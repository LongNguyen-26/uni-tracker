alter table public.focus_sessions add column intent text not null default '' check(char_length(intent)<=160), add column actual text not null default '' check(char_length(actual)<=160);
update public.focus_sessions set intent=case when notes='Phân bổ từ kế hoạch tuần' then '' else left(title,160) end,
 actual=case when status='completed' then left(coalesce(nullif(notes,''),title),160) else '' end;

create function public.finish_session(p_id uuid,p_stopped_at timestamptz,p_actual text default null) returns public.focus_sessions
language plpgsql security invoker set search_path='' as $$
declare s public.focus_sessions; delta integer; stop_at timestamptz; content text;
begin
 if auth.uid() is null then raise exception 'Hãy đăng nhập.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into s from public.focus_sessions where id=p_id and user_id=auth.uid() for update;
 if not found then raise exception 'Không tìm thấy phiên.'; end if;
 if s.status='completed' then return s; end if;
 if p_stopped_at is null then raise exception 'Thiếu thời điểm dừng.'; end if;
 content:=coalesce(p_actual,nullif(s.actual,''),s.intent,'');
 if char_length(content)>160 then raise exception 'Nội dung tối đa 160 ký tự.'; end if;
 if s.status='running' then
  stop_at:=greatest(s.running_since,least(p_stopped_at,clock_timestamp()));
  delta:=greatest(0,least(s.planned_minutes*60-s.elapsed_seconds,floor(extract(epoch from stop_at-s.running_since))::integer));
  if delta>0 then s.segments:=s.segments||jsonb_build_array(jsonb_build_object('start',s.running_since,'end',s.running_since+delta*interval '1 second')); end if;
  s.elapsed_seconds:=s.elapsed_seconds+delta;
 end if;
 update public.focus_sessions set running_since=null,status='paused',elapsed_seconds=s.elapsed_seconds,segments=s.segments,actual=content,title=coalesce(nullif(content,''),(select title from public.goals where id=s.goal_id),s.title) where id=s.id returning * into s;
 if s.elapsed_seconds>0 then s:=public.transition_session(s.id,'confirm',s.notes);
 else update public.focus_sessions set status='completed' where id=s.id returning * into s; end if;
 return s;
end $$;
revoke execute on function public.finish_session(uuid,timestamptz,text) from public,anon;
grant execute on function public.finish_session(uuid,timestamptz,text) to authenticated;

create function public.set_session_content(p_id uuid,p_intent text default null,p_actual text default null) returns public.focus_sessions
language plpgsql security invoker set search_path='' as $$
declare s public.focus_sessions;
begin
 if auth.uid() is null then raise exception 'Hãy đăng nhập.'; end if;
 update public.focus_sessions set intent=coalesce(p_intent,intent), actual=coalesce(p_actual,actual),
 title=case when p_intent is not null then coalesce(nullif(p_intent,''),(select title from public.goals where id=goal_id),title) else title end
 where id=p_id and user_id=auth.uid() returning * into s;
 if not found then raise exception 'Không tìm thấy phiên.'; end if;
 return s;
end $$;
revoke execute on function public.set_session_content(uuid,text,text) from public,anon;
grant execute on function public.set_session_content(uuid,text,text) to authenticated;

create function public.sync_session_actual() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.actual is distinct from old.actual and new.status='completed' then
  update public.activities set title=coalesce(nullif(new.actual,''),(select title from public.goals where id=new.goal_id),new.title) where session_id=new.id and user_id=new.user_id;
 end if;
 return new;
end $$;
create trigger sync_session_actual after update of actual on public.focus_sessions for each row execute function public.sync_session_actual();
create function public.sync_activity_actual() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if pg_trigger_depth()=1 and new.session_id is not null and new.title is distinct from old.title then
  update public.focus_sessions set actual=new.title where id=new.session_id and user_id=new.user_id;
 end if;
 return new;
end $$;
create trigger sync_activity_actual after update of title on public.activities for each row execute function public.sync_activity_actual();
revoke execute on function public.sync_session_actual(), public.sync_activity_actual() from public,anon;
grant execute on function public.sync_session_actual(), public.sync_activity_actual() to authenticated;

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
        if exists(select 1 from public.focus_sessions s where s.user_id=auth.uid() and s.status<>'completed' and not s.is_unscheduled and s.scheduled_start<(item->>'scheduled_end')::timestamptz and s.scheduled_end>(item->>'scheduled_start')::timestamptz)
        or exists(select 1 from public.timetable_entries t where t.user_id=auth.uid()
          and ((item->>'scheduled_start')::timestamptz at time zone (item->>'timezone'))::date between t.valid_from and t.valid_until
          and (t.all_day or extract(isodow from ((item->>'scheduled_start')::timestamptz at time zone (item->>'timezone')))::integer-1=t.weekday)
          and t.start_minute < extract(hour from ((item->>'scheduled_end')::timestamptz at time zone (item->>'timezone')))*60+extract(minute from ((item->>'scheduled_end')::timestamptz at time zone (item->>'timezone')))
          and t.end_minute > extract(hour from ((item->>'scheduled_start')::timestamptz at time zone (item->>'timezone')))*60+extract(minute from ((item->>'scheduled_start')::timestamptz at time zone (item->>'timezone'))))
        then raise exception 'Lịch vừa thay đổi hoặc phiên bị trùng TKB. Hãy đóng và mở lại kế hoạch tuần để tạo gợi ý mới.'; end if;
      end if;
      insert into public.focus_sessions(user_id,goal_id,title,notes,scheduled_start,scheduled_end,planned_minutes,timezone,is_unscheduled,intent)
      values(auth.uid(),goal_uuid,item->>'title',coalesce(item->>'notes',''),(item->>'scheduled_start')::timestamptz,(item->>'scheduled_end')::timestamptz,(item->>'planned_minutes')::integer,item->>'timezone',coalesce((item->>'is_unscheduled')::boolean,false),coalesce(item->>'intent',item->>'title',''));
    elsif item->>'kind'='activity' then
      if (item->>'date')::date>(now() at time zone 'Asia/Ho_Chi_Minh')::date then raise exception 'Nhật ký phải là việc đã làm.'; end if;
      insert into public.activities(user_id,goal_id,title,notes,occurred_on,kind,duration_minutes,color,is_milestone,milestone_kind,started_at,ended_at)
      values(auth.uid(),goal_uuid,item->>'title',coalesce(item->>'notes',''),(item->>'date')::date,'event',coalesce((item->>'minutes')::numeric,0),coalesce(item->>'color','#237a4b'),coalesce((item->>'is_milestone')::boolean,false),coalesce(item->>'milestone_kind','general'),(item->>'started_at')::timestamptz,(item->>'ended_at')::timestamptz);
    elsif item->>'kind'='timetable' then
      insert into public.timetable_entries(user_id,title,kind,semester_index,weekday,start_minute,end_minute,valid_from,valid_until,notes,goal_id,all_day)
      values(auth.uid(),item->>'title',coalesce(item->>'schedule_kind','class'),(item->>'semester_index')::integer,(item->>'weekday')::integer,(item->>'start_minute')::integer,(item->>'end_minute')::integer,(item->>'valid_from')::date,(item->>'valid_until')::date,coalesce(item->>'notes',''),goal_uuid,coalesce((item->>'all_day')::boolean,false));
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
