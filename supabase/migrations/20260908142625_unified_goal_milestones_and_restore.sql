-- A deadline is a final marker in the same list as ordinary, optionally dated work.
alter table public.goals alter column deadline drop not null;
alter table public.import_batches drop constraint import_batches_row_count_check;
alter table public.import_batches add constraint import_batches_row_count_check check(row_count between 1 and 10000);
alter table public.timetable_entries alter column semester_index drop not null;
alter table public.goals drop constraint goals_checklist_check;
alter table public.goals add constraint goals_checklist_check check(jsonb_typeof(checklist)='array' and jsonb_array_length(checklist)<=101);

create or replace function public.normalize_goal_tracking() returns trigger language plpgsql security invoker set search_path='' as $$
declare step jsonb; total integer:=0; done_count integer:=0; finals integer:=0; ids text[]:='{}'; a date; b date;
begin
  -- Compatibility with older clients which still submit deadline independently.
  if new.deadline is not null and not exists(select 1 from jsonb_array_elements(new.checklist) s where coalesce((s->>'is_final')::boolean,false))
     and (TG_OP='INSERT' or not exists(select 1 from jsonb_array_elements(old.checklist) s where coalesce((s->>'is_final')::boolean,false))) then
    new.checklist:=new.checklist||jsonb_build_array(jsonb_build_object('id','final-deadline','title','Hạn hoàn thành','done',new.progress=100,'date',coalesce(new.starts_on,new.deadline),'end_date',new.deadline,'timing_mode',new.timing_mode,'is_final',true,'counts_for_progress',false));
  end if;
  new.deadline:=null; new.starts_on:=null;
  for step in select value from jsonb_array_elements(new.checklist) loop
    if jsonb_typeof(step->'done') is distinct from 'boolean' or char_length(btrim(coalesce(step->>'title',''))) not between 1 and 160 or char_length(coalesce(step->>'id','')) not between 1 and 80 or step->>'id'=any(ids) then raise exception 'Tên, mã hoặc trạng thái việc/cột mốc không hợp lệ.'; end if;
    ids:=array_append(ids,step->>'id');
    a:=nullif(step->>'date','')::date; b:=coalesce(nullif(step->>'end_date','')::date,a);
    if (a is null and b is not null) or b<a or b-a>2196 or coalesce(step->>'timing_mode','fixed') not in ('fixed','window','flexible') or char_length(coalesce(step->>'notes',''))>1000 or (coalesce(step->>'timing_mode','fixed')='fixed' and b<>a) then raise exception 'Ngày hoặc ghi chú cột mốc chưa hợp lệ.'; end if;
    if coalesce((step->>'is_final')::boolean,false) then
      finals:=finals+1; new.deadline:=b; new.starts_on:=case when coalesce(step->>'timing_mode','fixed')='fixed' then null else a end; new.timing_mode:=coalesce(step->>'timing_mode','fixed');
    end if;
    if coalesce((step->>'counts_for_progress')::boolean,true) then
      total:=total+1; if (step->>'done')::boolean then done_count:=done_count+1; end if;
    end if;
  end loop;
  if finals>1 then raise exception 'Mỗi mục tiêu chỉ có một mốc hạn cuối.'; end if;
  if new.tracking_mode='numeric' then
    new.progress:=case when (new.metric_direction='increase' and new.metric_current>=new.metric_target) or (new.metric_direction='decrease' and new.metric_current<=new.metric_target) then 100 else 0 end;
  elsif new.tracking_mode='checklist' then new.progress:=case when total=0 then 0 else floor(done_count*100.0/total)::integer end;
  end if;
  if new.progress=100 then new.completed_on:=coalesce(new.completed_on,(now() at time zone 'Asia/Ho_Chi_Minh')::date); else new.completed_on:=null; end if;
  return new;
end $$;

create or replace function public.record_goal_progress() returns trigger language plpgsql security invoker set search_path='' as $$
declare detail text;
begin
  if current_setting('unitracker.restoring',true)='on' then return new; end if;
  if TG_OP='UPDATE' then
    if new.progress=old.progress and new.completed_on is not distinct from old.completed_on and (new.tracking_mode<>'numeric' or new.metric_current=old.metric_current) then return new; end if;
  elsif new.progress=0 then return new; end if;
  detail:=case when new.tracking_mode='numeric' then new.metric_current||' → '||new.metric_target||' '||new.metric_unit when new.tracking_mode='checklist' then (select count(*) filter(where (s->>'done')::boolean)||'/'||count(*)||' việc' from jsonb_array_elements(new.checklist) s where coalesce((s->>'counts_for_progress')::boolean,true)) when new.progress=100 then 'Đã hoàn thành mục tiêu.' else 'Tiến độ: '||new.progress||'%' end;
  insert into public.activities(user_id,goal_id,title,notes,occurred_on,kind,color,is_milestone,milestone_kind,goal_title)
  values(new.user_id,new.id,new.title,detail,coalesce(new.completed_on,(now() at time zone 'Asia/Ho_Chi_Minh')::date),case when new.progress=100 then 'completion' else 'progress' end,new.color,new.progress=100,new.milestone_kind,new.title);
  return new;
end $$;

-- Metadata-only migration, with the original checklist states and denominator intact.
update public.goals set checklist=checklist where deadline is not null;

create function public.append_goal_milestone(p_goal_id uuid,p_step jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare g public.goals; candidate jsonb;
begin
  select * into g from public.goals where id=p_goal_id and user_id=auth.uid() for update;
  if not found then raise exception 'Chọn hoặc tạo mục tiêu cho cột mốc này.'; end if;
  candidate:=jsonb_build_object('id',coalesce(nullif(p_step->>'id',''),gen_random_uuid()::text),'title',p_step->>'title','done',coalesce((p_step->>'done')::boolean,false),'date',nullif(p_step->>'date',''),'end_date',nullif(p_step->>'end_date',''),'timing_mode',coalesce(p_step->>'timing_mode','fixed'),'notes',coalesce(p_step->>'notes',''),'is_final',false,'counts_for_progress',true);
  if exists(select 1 from jsonb_array_elements(g.checklist) s where s->>'title'=candidate->>'title' and nullif(s->>'date','') is not distinct from nullif(candidate->>'date','') and nullif(s->>'end_date','') is not distinct from nullif(candidate->>'end_date','')) then return; end if;
  update public.goals set checklist=checklist||jsonb_build_array(candidate),tracking_mode=case when tracking_mode='none' then 'checklist' else tracking_mode end where id=g.id;
end $$;
revoke execute on function public.append_goal_milestone(uuid,jsonb) from public,anon;
grant execute on function public.append_goal_milestone(uuid,jsonb) to authenticated;

create or replace function public.import_tracker_reviewed(p_batch_id uuid, p_items jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare item jsonb; result_row jsonb; goal_map jsonb:='{}'; accepted jsonb:='[]'; errors jsonb:='[]';
 digest text; existing public.import_batches; position integer:=0; row_key text; response jsonb; mapped text;
begin
 if auth.uid() is null then raise exception 'Hãy đăng nhập.'; end if;
 if p_batch_id is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 500 or pg_column_size(p_items)>4000000 then raise exception 'Mỗi lần nhập cần 1–500 dòng, tối đa 4 MB dữ liệu đã đọc.'; end if;
 digest:=md5('reviewed:'||p_items::text);
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into existing from public.import_batches where user_id=auth.uid() and (id=p_batch_id or fingerprint=digest) limit 1;
 if found then
  if existing.fingerprint<>digest then raise exception 'Nội dung lần nhập đã đổi. Hãy xem trước lại.'; end if;
  return existing.result||jsonb_build_object('already_imported',true);
 end if;
 for item in select value from jsonb_array_elements(p_items) order by case when value->>'kind'='goal' then 0 when value->>'kind'='milestone' then 1 else 2 end loop
  position:=position+1;
  row_key:=coalesce(item->>'row_key',position::text);
  begin
   if item->>'kind'='goal' and nullif(item->>'ref','') is not null and goal_map ? (item->>'ref') then
    raise exception 'Mã mục tiêu nguồn bị trùng; dùng mục tiêu đã nhập trước đó.';
   end if;
   if item->>'kind'<>'goal' and nullif(item->>'goal_id','') is null and nullif(item->>'goal_ref','') is not null then
    mapped:=goal_map->>(item->>'goal_ref');
    if mapped is null then raise exception 'Mục tiêu liên kết chưa được nhập. Sửa mục tiêu đó rồi thử lại.'; end if;
    item:=item||jsonb_build_object('goal_id',mapped,'goal_ref','');
   end if;
   if item->>'kind' in ('milestone','session','activity') and nullif(item->>'goal_id','') is null then raise exception 'Gắn một mục tiêu để biết thời gian này đang giúp bạn tiến tới điều gì.'; end if;
   if item->>'kind'='milestone' then
    perform public.append_goal_milestone((item->>'goal_id')::uuid,item);
    result_row:='{}';
   else
   result_row:=public.import_tracker(md5(p_batch_id::text||':'||position::text)::uuid,jsonb_build_array(item));
   end if;
   goal_map:=goal_map||coalesce(result_row->'goal_map','{}');
   accepted:=accepted||jsonb_build_array(row_key);
  exception when others then
   errors:=errors||jsonb_build_array(jsonb_build_object('key',row_key,'message',case
    when sqlstate='23503' then 'Mục tiêu liên kết không tồn tại hoặc không thuộc tài khoản này.'
    when sqlstate='23514' then 'Ngày, thời lượng hoặc thước đo vượt giới hạn. Hãy kiểm tra dòng này.'
    when sqlstate='42501' then 'Bạn không có quyền lưu dòng này.'
    when sqlstate='22P02' or sqlstate='22007' or sqlstate='22008' then 'Ngày hoặc số chưa đúng định dạng.'
    when sqlstate='23505' then 'Dòng này trùng dữ liệu đã lưu.'
    else sqlerrm end));
  end;
 end loop;
 response:=jsonb_build_object('count',jsonb_array_length(accepted),'accepted',accepted,'errors',errors,'goal_map',goal_map,'already_imported',false);
 if jsonb_array_length(accepted)>0 then
  insert into public.import_batches(id,user_id,fingerprint,row_count,result) values(p_batch_id,auth.uid(),digest,jsonb_array_length(accepted),response);
 end if;
 return response;
end $$;
revoke execute on function public.import_tracker_reviewed(uuid,jsonb) from public,anon;
grant execute on function public.import_tracker_reviewed(uuid,jsonb) to authenticated;

create function public.export_tracker() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('version',3,'exported_at',now(),
  'profile',(select to_jsonb(p) from public.profiles p where id=auth.uid()),
  'goals',coalesce((select jsonb_agg(g order by id) from public.goals g where user_id=auth.uid()),'[]'),
  'activities',coalesce((select jsonb_agg(a order by id) from public.activities a where user_id=auth.uid()),'[]'),
  'sessions',coalesce((select jsonb_agg(s order by id) from public.focus_sessions s where user_id=auth.uid()),'[]'),
  'budgets',coalesce((select jsonb_agg(b order by id) from public.weekly_budgets b where user_id=auth.uid()),'[]'),
  'timetable_entries',coalesce((select jsonb_agg(t order by id) from public.timetable_entries t where user_id=auth.uid()),'[]'));
$$;
revoke execute on function public.export_tracker() from public,anon;
grant execute on function public.export_tracker() to authenticated;

-- Stable destination IDs retain all links across retries and across accounts.
create function public.restore_record_id(p_table text,p_source uuid) returns uuid language plpgsql stable security invoker set search_path='' as $$
declare result uuid;
begin
 if p_source is null then return null; end if;
 if p_table not in ('goals','focus_sessions','activities','weekly_budgets','timetable_entries') then raise exception 'Loại bản ghi không được hỗ trợ.'; end if;
 execute format('select id from public.%I where id=$1 and user_id=$2',p_table) into result using p_source,auth.uid();
 return coalesce(result,md5(auth.uid()::text||':'||p_table||':'||p_source::text)::uuid);
end $$;
revoke execute on function public.restore_record_id(text,uuid) from public,anon;
grant execute on function public.restore_record_id(text,uuid) to authenticated;

create function public.restore_tracker_reviewed(p_items jsonb,p_apply boolean default false,p_batch_id uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare item jsonb; candidate jsonb; current_row jsonb; rows jsonb:='[]'; response jsonb; saved public.import_batches; tbl text; row_key text; destination uuid; columns_sql text; values_sql text; field text; digest text; row_status text; previous_restore text;
begin
 if auth.uid() is null then raise exception 'Hãy đăng nhập.'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 10000 or pg_column_size(p_items)>16000000 then raise exception 'Bản sao lưu cần 1–10.000 bản ghi, tối đa 16 MB dữ liệu đã đọc.'; end if;
 if p_apply and p_batch_id is null then raise exception 'Thiếu mã lần khôi phục.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 digest:=md5('restore:'||p_items::text);
 if p_apply then
  select * into saved from public.import_batches where user_id=auth.uid() and (id=p_batch_id or fingerprint=digest) limit 1;
  if found then
   if saved.fingerprint<>digest then raise exception 'Lựa chọn khôi phục đã đổi. Hãy đối chiếu lại.'; end if;
   return saved.result;
  end if;
 end if;
 previous_restore:=current_setting('unitracker.restoring',true);
 perform set_config('unitracker.restoring','on',true);
 for item in select value from jsonb_array_elements(p_items) order by case value->>'table' when 'goals' then 0 when 'focus_sessions' then 1 when 'profiles' then 3 else 2 end loop
  tbl:=item->>'table'; row_key:=item->>'key'; candidate:=item->'data'; current_row:=null;
  begin
   if tbl not in ('profiles','goals','focus_sessions','activities','weekly_budgets','timetable_entries') then raise exception 'Loại bản ghi không được hỗ trợ: %',tbl; end if;
   if item->>'resolution'='skip' then
    row_status:='skipped';
   else
    destination:=case when tbl='profiles' then auth.uid() else public.restore_record_id(tbl,(candidate->>'id')::uuid) end;
    if destination is null then raise exception 'Bản sao lưu thiếu mã bản ghi.'; end if;
    candidate:=(candidate-'user_id')||jsonb_build_object('id',destination);
    if tbl<>'profiles' then candidate:=candidate||jsonb_build_object('user_id',auth.uid()); end if;
    if candidate ? 'goal_id' then candidate:=candidate||jsonb_build_object('goal_id',public.restore_record_id('goals',nullif(candidate->>'goal_id','')::uuid)); end if;
    if candidate ? 'session_id' then candidate:=candidate||jsonb_build_object('session_id',public.restore_record_id('focus_sessions',nullif(candidate->>'session_id','')::uuid)); end if;
    if tbl='focus_sessions' and candidate->>'status'='running' then raise exception 'Timer phải được tạm dừng tại thời điểm xuất trước khi khôi phục.'; end if;
    for field in select jsonb_object_keys(candidate) loop
     if not exists(select 1 from pg_attribute where attrelid=format('public.%I',tbl)::regclass and attname=field and attnum>0 and not attisdropped and attgenerated='') then raise exception 'Cột % chưa được hỗ trợ; cập nhật ứng dụng trước khi khôi phục.',field; end if;
    end loop;
    execute format('select to_jsonb(t) from public.%I t where id=$1 and %I=$2',tbl,case when tbl='profiles' then 'id' else 'user_id' end) into current_row using destination,auth.uid();
    if current_row is null and tbl='weekly_budgets' then
     select to_jsonb(b) into current_row from public.weekly_budgets b where user_id=auth.uid() and goal_id=(candidate->>'goal_id')::uuid and week_start=(candidate->>'week_start')::date;
     if current_row is not null then destination:=(current_row->>'id')::uuid; candidate:=candidate||jsonb_build_object('id',destination); end if;
    end if;
    row_status:=case when current_row is null then 'new' when (current_row - 'created_at' - 'updated_at') @> (candidate - 'created_at' - 'updated_at') then 'same' else 'conflict' end;
    if p_apply then
     if current_row is not null then
      if tbl='profiles' and item->>'resolution'='replace' then
       update public.profiles set display_name=coalesce(candidate->>'display_name',display_name),start_year=(candidate->>'start_year')::integer,start_month=(candidate->>'start_month')::integer,study_years=(candidate->>'study_years')::integer,semester_settings=candidate->'semester_settings',wake_minutes=coalesce((candidate->>'wake_minutes')::integer,wake_minutes),sleep_minutes=coalesce((candidate->>'sleep_minutes')::integer,sleep_minutes),confirmed_semesters=coalesce(candidate->'confirmed_semesters',confirmed_semesters),preparation_done=coalesce((candidate->>'preparation_done')::boolean,preparation_done) where id=auth.uid();
       row_status:='saved';
      elsif row_status='conflict' and item->>'resolution' is distinct from 'keep' then raise exception 'Bản ghi khác nội dung hiện tại. Chọn giữ bản đang có trước khi tiếp tục.';
      else row_status:='kept'; end if;
     else
      select string_agg(format('%I',key),',' order by key),string_agg(format('r.%I',key),',' order by key) into columns_sql,values_sql from jsonb_object_keys(candidate) key;
      execute format('insert into public.%I(%s) select %s from jsonb_populate_record(null::public.%I,$1) r',tbl,columns_sql,values_sql,tbl) using candidate;
      row_status:='saved';
     end if;
    end if;
   end if;
   rows:=rows||jsonb_build_array(jsonb_build_object('key',row_key,'table',tbl,'title',coalesce(candidate->>'title',candidate->>'display_name',candidate->>'week_start',tbl),'status',row_status,'current',current_row-'user_id','incoming',candidate-'user_id'));
  exception when others then
   rows:=rows||jsonb_build_array(jsonb_build_object('key',row_key,'table',tbl,'title',coalesce(candidate->>'title',tbl),'status','error','message',case when sqlstate='23503' then 'Liên kết chưa có: khôi phục mục tiêu/phiên gốc trước.' when sqlstate='23514' then 'Ngày, thời lượng hoặc trạng thái không hợp lệ.' else sqlerrm end));
  end;
 end loop;
 perform set_config('unitracker.restoring',coalesce(previous_restore,''),true);
 response:=jsonb_build_object('rows',rows);
 if p_apply and not exists(select 1 from jsonb_array_elements(rows) r where r->>'status'='error') then insert into public.import_batches(id,user_id,fingerprint,row_count,result) values(p_batch_id,auth.uid(),digest,jsonb_array_length(rows),response); end if;
 return response;
end $$;
revoke execute on function public.restore_tracker_reviewed(jsonb,boolean,uuid) from public,anon;
grant execute on function public.restore_tracker_reviewed(jsonb,boolean,uuid) to authenticated;

