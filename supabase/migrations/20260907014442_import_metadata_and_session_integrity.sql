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
    return jsonb_build_object('already_imported',true,'count',existing.row_count);
  end if;
  for item in select value from jsonb_array_elements(p_items) loop
    if item->>'kind' is null or item->>'kind' not in ('goal','session','activity','budget') then raise exception 'Loại dữ liệu không hợp lệ.'; end if;
    if item->>'kind'<>'goal' then continue; end if;
    if nullif(item->>'ref','') is not null and goal_map ? (item->>'ref') then raise exception 'Mã mục tiêu nguồn bị trùng.'; end if;
    mode:=coalesce(item->>'tracking_mode','milestone');
    insert into public.goals(user_id,title,description,category,color,tracking_mode,milestone_kind,starts_on,deadline,semester_index,metric_current,metric_target,metric_unit,metric_direction,checklist,progress,completed_on)
    values(auth.uid(),item->>'title',coalesce(item->>'description',''),'Học tập',coalesce(item->>'color','#2563eb'),mode,coalesce(item->>'milestone_kind','general'),nullif(item->>'starts_on','')::date,(item->>'deadline')::date,(item->>'semester_index')::integer,coalesce((item->>'metric_current')::numeric,0),coalesce((item->>'metric_target')::numeric,1),coalesce(item->>'metric_unit',''),coalesce(item->>'metric_direction','increase'),coalesce(item->'checklist','[]'),coalesce((item->>'progress')::integer,0),nullif(item->>'completed_on','')::date)
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
      insert into public.focus_sessions(user_id,goal_id,title,notes,scheduled_start,scheduled_end,planned_minutes,timezone)
      values(auth.uid(),goal_uuid,item->>'title',coalesce(item->>'notes',''),(item->>'scheduled_start')::timestamptz,(item->>'scheduled_end')::timestamptz,(item->>'planned_minutes')::integer,item->>'timezone');
    elsif item->>'kind'='activity' then
      if (item->>'date')::date>(now() at time zone 'Asia/Ho_Chi_Minh')::date then raise exception 'Nhật ký phải là việc đã làm.'; end if;
      insert into public.activities(user_id,goal_id,title,notes,occurred_on,kind,duration_minutes,color,is_milestone,milestone_kind,started_at,ended_at)
      values(auth.uid(),goal_uuid,item->>'title',coalesce(item->>'notes',''),(item->>'date')::date,'event',coalesce((item->>'minutes')::numeric,0),coalesce(item->>'color','#237a4b'),coalesce((item->>'is_milestone')::boolean,false),coalesce(item->>'milestone_kind','general'),(item->>'started_at')::timestamptz,(item->>'ended_at')::timestamptz);
    elsif item->>'kind'='budget' then
      insert into public.weekly_budgets(user_id,goal_id,week_start,planned_minutes) values(auth.uid(),goal_uuid,(item->>'date')::date,(item->>'minutes')::integer)
      on conflict(user_id,week_start,goal_id) do update set planned_minutes=excluded.planned_minutes;
    end if;
    inserted:=inserted+1;
  end loop;
  insert into public.import_batches(id,user_id,fingerprint,row_count) values(p_batch_id,auth.uid(),digest,inserted);
  return jsonb_build_object('already_imported',false,'count',inserted);
end $$;
revoke execute on function public.import_tracker(uuid,jsonb) from public,anon;
grant execute on function public.import_tracker(uuid,jsonb) to authenticated;

create function public.validate_session_integrity() returns trigger language plpgsql security invoker set search_path='' as $$
declare segment jsonb; a timestamptz; b timestamptz; previous_end timestamptz; seconds numeric:=0;
begin
 if not exists(select 1 from pg_timezone_names where name=new.timezone) then raise exception 'Múi giờ không hợp lệ.'; end if;
 if new.planned_minutes<>round(extract(epoch from new.scheduled_end-new.scheduled_start)/60) then raise exception 'Thời lượng dự kiến cần khớp với khung giờ đã chọn.'; end if;
 for segment in select value from jsonb_array_elements(new.segments) loop
  a:=(segment->>'start')::timestamptz;b:=(segment->>'end')::timestamptz;
  if a is null or b is null or b<=a or a<previous_end then raise exception 'Các khoảng làm việc bị trùng hoặc không hợp lệ.'; end if;
  seconds:=seconds+extract(epoch from b-a);previous_end:=b;
 end loop;
 if seconds<>new.elapsed_seconds then raise exception 'Thời gian thực tế không khớp các khoảng đã làm.'; end if;
 return new;
end $$;
revoke execute on function public.validate_session_integrity() from public,anon;grant execute on function public.validate_session_integrity() to authenticated;
create trigger validate_session_integrity before insert or update on public.focus_sessions for each row execute function public.validate_session_integrity();
