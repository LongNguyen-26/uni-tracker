-- Additive: existing goals, timer history and atomic planning imports remain compatible.
alter table public.profiles add column preparation_done boolean not null default false;
alter table public.goals drop constraint goals_tracking_mode_check;
alter table public.goals add constraint goals_tracking_mode_check check(tracking_mode in ('none','progress','milestone','numeric','checklist')),
 add column weekly_hours numeric not null default 0 check(weekly_hours between 0 and 168),
 add constraint unmeasured_goal_progress check(tracking_mode <> 'none' or progress in (0,100));
alter table public.focus_sessions add column is_unscheduled boolean not null default false;
alter table public.timetable_entries add column goal_id uuid,
 add column all_day boolean not null default false,
 add constraint timetable_goal_owner_fk foreign key(goal_id,user_id) references public.goals(id,user_id) on delete set null(goal_id),
 add constraint timetable_all_day check(not all_day or (start_minute=0 and end_minute=1440));
create index timetable_goal_owner_idx on public.timetable_entries(goal_id,user_id);
alter table public.import_batches add column result jsonb;

create or replace function public.import_tracker(p_batch_id uuid,p_items jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare item jsonb; goal_map jsonb:='{}'; goal_uuid uuid; new_uuid uuid; digest text; existing public.import_batches; inserted integer:=0; mode text;
begin
  if auth.uid() is null then raise exception 'Hãy đăng nhập.'; end if;
  if p_batch_id is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 500 then raise exception 'Mỗi lần nhập cần 1–500 dòng.'; end if;
  if pg_column_size(p_items)>4000000 then raise exception 'Dữ liệu nhập quá lớn.'; end if;
  digest:=md5(p_items::text);
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  select * into existing from public.import_batches where user_id=auth.uid() and (id=p_batch_id or fingerprint=digest) limit 1;
  if found then
    if existing.fingerprint<>digest then raise exception 'Lần nhập này đã được lưu với nội dung khác; hãy phân tích lại nguồn.'; end if;
    return coalesce(existing.result,'{}'::jsonb)||jsonb_build_object('already_imported',true,'count',existing.row_count);
  end if;
  for item in select value from jsonb_array_elements(p_items) loop
    if item->>'kind' is null or item->>'kind' not in ('goal','session','activity','budget','timetable') then raise exception 'Loại dữ liệu không hợp lệ.'; end if;
    if item->>'kind'<>'goal' then continue; end if;
    if nullif(item->>'ref','') is not null and goal_map ? (item->>'ref') then raise exception 'Mã mục tiêu nguồn bị trùng.'; end if;
    mode:=coalesce(item->>'tracking_mode','none');
    insert into public.goals(user_id,title,description,category,color,tracking_mode,milestone_kind,starts_on,deadline,semester_index,metric_current,metric_target,metric_unit,metric_direction,checklist,progress,completed_on,timing_mode,reserved_hours,weekly_hours)
    values(auth.uid(),item->>'title',coalesce(item->>'description',''),'Học tập',coalesce(item->>'color','#2563eb'),mode,coalesce(item->>'milestone_kind','general'),nullif(item->>'starts_on','')::date,(item->>'deadline')::date,(item->>'semester_index')::integer,coalesce((item->>'metric_current')::numeric,0),coalesce((item->>'metric_target')::numeric,1),coalesce(item->>'metric_unit',''),coalesce(item->>'metric_direction','increase'),coalesce(item->'checklist','[]'),coalesce((item->>'progress')::integer,0),nullif(item->>'completed_on','')::date,coalesce(item->>'timing_mode','fixed'),coalesce((item->>'reserved_hours')::numeric,0),coalesce((item->>'weekly_hours')::numeric,0))
    returning id into new_uuid;
    if item->>'category' in ('Học tập','Kỹ năng','Dự án','Ngoại ngữ','Trải nghiệm') then update public.goals set category=item->>'category' where id=new_uuid; end if;
    if nullif(item->>'ref','') is not null then goal_map:=goal_map||jsonb_build_object(item->>'ref',new_uuid); end if;
    inserted:=inserted+1;
  end loop;
  for item in select value from jsonb_array_elements(p_items) loop
    if item->>'kind'='goal' then continue; end if;
    goal_uuid:=nullif(item->>'goal_id','')::uuid;
    if goal_uuid is null and nullif(item->>'goal_ref','') is not null then
      goal_uuid:=(goal_map->>(item->>'goal_ref'))::uuid;
      if goal_uuid is null then raise exception 'Không tìm thấy mục tiêu liên kết trong lần nhập.'; end if;
    end if;
    if item->>'kind'='session' then
      if not exists(select 1 from pg_timezone_names where name=item->>'timezone') then raise exception 'Múi giờ phiên không hợp lệ.'; end if;
      if coalesce((item->>'prevent_overlap')::boolean,false) and not coalesce((item->>'is_unscheduled')::boolean,false) then
        if exists(select 1 from public.focus_sessions s where s.user_id=auth.uid() and not s.is_unscheduled and s.scheduled_start<(item->>'scheduled_end')::timestamptz and s.scheduled_end>(item->>'scheduled_start')::timestamptz)
        or exists(select 1 from public.timetable_entries t where t.user_id=auth.uid()
          and ((item->>'scheduled_start')::timestamptz at time zone (item->>'timezone'))::date between t.valid_from and t.valid_until
          and (t.all_day or extract(isodow from ((item->>'scheduled_start')::timestamptz at time zone (item->>'timezone')))::integer-1=t.weekday)
          and t.start_minute < extract(hour from ((item->>'scheduled_end')::timestamptz at time zone (item->>'timezone')))*60+extract(minute from ((item->>'scheduled_end')::timestamptz at time zone (item->>'timezone')))
          and t.end_minute > extract(hour from ((item->>'scheduled_start')::timestamptz at time zone (item->>'timezone')))*60+extract(minute from ((item->>'scheduled_start')::timestamptz at time zone (item->>'timezone'))))
        then raise exception 'Lịch vừa thay đổi hoặc phiên bị trùng TKB. Hãy đóng và mở lại kế hoạch tuần để tạo gợi ý mới.'; end if;
      end if;
      insert into public.focus_sessions(user_id,goal_id,title,notes,scheduled_start,scheduled_end,planned_minutes,timezone,is_unscheduled)
      values(auth.uid(),goal_uuid,item->>'title',coalesce(item->>'notes',''),(item->>'scheduled_start')::timestamptz,(item->>'scheduled_end')::timestamptz,(item->>'planned_minutes')::integer,item->>'timezone',coalesce((item->>'is_unscheduled')::boolean,false));
    elsif item->>'kind'='activity' then
      if (item->>'date')::date>(now() at time zone 'Asia/Ho_Chi_Minh')::date then raise exception 'Nhật ký phải là việc đã làm.'; end if;
      insert into public.activities(user_id,goal_id,title,notes,occurred_on,kind,duration_minutes,color,is_milestone,milestone_kind,started_at,ended_at)
      values(auth.uid(),goal_uuid,item->>'title',coalesce(item->>'notes',''),(item->>'date')::date,'event',coalesce((item->>'minutes')::numeric,0),coalesce(item->>'color','#237a4b'),coalesce((item->>'is_milestone')::boolean,false),coalesce(item->>'milestone_kind','general'),(item->>'started_at')::timestamptz,(item->>'ended_at')::timestamptz);
    elsif item->>'kind'='timetable' then
      insert into public.timetable_entries(user_id,title,kind,semester_index,weekday,start_minute,end_minute,valid_from,valid_until,notes,goal_id,all_day)
      values(auth.uid(),item->>'title',coalesce(item->>'schedule_kind','class'),coalesce((item->>'semester_index')::integer,0),(item->>'weekday')::integer,(item->>'start_minute')::integer,(item->>'end_minute')::integer,(item->>'valid_from')::date,(item->>'valid_until')::date,coalesce(item->>'notes',''),goal_uuid,coalesce((item->>'all_day')::boolean,false));
    elsif item->>'kind'='budget' then
      insert into public.weekly_budgets(user_id,goal_id,week_start,planned_minutes) values(auth.uid(),goal_uuid,(item->>'date')::date,(item->>'minutes')::integer)
      on conflict(user_id,week_start,goal_id) do update set planned_minutes=excluded.planned_minutes;
    end if;
    inserted:=inserted+1;
  end loop;
  insert into public.import_batches(id,user_id,fingerprint,row_count,result) values(p_batch_id,auth.uid(),digest,inserted,jsonb_build_object('goal_map',goal_map));
  return jsonb_build_object('already_imported',false,'count',inserted,'goal_map',goal_map);
end $$;
revoke execute on function public.import_tracker(uuid,jsonb) from public,anon;
grant execute on function public.import_tracker(uuid,jsonb) to authenticated;

-- Review imports isolate row failures. Weekly allocation continues to use the atomic RPC above.
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
 for item in select value from jsonb_array_elements(p_items) order by case when value->>'kind'='goal' then 0 else 1 end loop
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
   result_row:=public.import_tracker(md5(p_batch_id::text||':'||position::text)::uuid,jsonb_build_array(item));
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

