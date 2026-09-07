alter table public.profiles alter column start_month set default 8,
 add column wake_minutes integer not null default 420,
 add column sleep_minutes integer not null default 1380,
 add column confirmed_semesters jsonb not null default '[]' check(jsonb_typeof(confirmed_semesters)='array'),
 add constraint awake_interval check(wake_minutes>=0 and wake_minutes<sleep_minutes and sleep_minutes<=1440);
alter table public.goals add column timing_mode text not null default 'fixed' check(timing_mode in ('fixed','window','flexible')),
 add column reserved_hours numeric not null default 0 check(reserved_hours between 0 and 168);
update public.goals set timing_mode='window' where starts_on is not null and starts_on<>deadline;
update public.goals set color=case when color='#0d9488' then '#0891b2' else '#64748b' end where color in ('#0d9488','#237a4b');
create table public.timetable_entries (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(char_length(btrim(title)) between 1 and 160),kind text not null check(kind in ('class','fixed')),
 semester_index integer not null check(semester_index between 0 and 11),weekday integer not null check(weekday between 0 and 6),
 start_minute integer not null check(start_minute between 0 and 1439),end_minute integer not null check(end_minute between 1 and 1440 and end_minute>start_minute),
 valid_from date not null,valid_until date not null check(valid_until>=valid_from and valid_until-valid_from<=730),
 notes text not null default '' check(char_length(notes)<=4000)
);
create index timetable_owner_dates_idx on public.timetable_entries(user_id,valid_from,valid_until);
alter table public.timetable_entries enable row level security;
create policy timetable_owner on public.timetable_entries to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
revoke all on public.timetable_entries from anon;
grant select,insert,update,delete on public.timetable_entries to authenticated;

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
    if item->>'kind' is null or item->>'kind' not in ('goal','session','activity','budget','timetable') then raise exception 'Loại dữ liệu không hợp lệ.'; end if;
    if item->>'kind'<>'goal' then continue; end if;
    if nullif(item->>'ref','') is not null and goal_map ? (item->>'ref') then raise exception 'Mã mục tiêu nguồn bị trùng.'; end if;
    mode:=coalesce(item->>'tracking_mode','milestone');
    insert into public.goals(user_id,title,description,category,color,tracking_mode,milestone_kind,starts_on,deadline,semester_index,metric_current,metric_target,metric_unit,metric_direction,checklist,progress,completed_on,timing_mode,reserved_hours)
    values(auth.uid(),item->>'title',coalesce(item->>'description',''),'Học tập',coalesce(item->>'color','#2563eb'),mode,coalesce(item->>'milestone_kind','general'),nullif(item->>'starts_on','')::date,(item->>'deadline')::date,(item->>'semester_index')::integer,coalesce((item->>'metric_current')::numeric,0),coalesce((item->>'metric_target')::numeric,1),coalesce(item->>'metric_unit',''),coalesce(item->>'metric_direction','increase'),coalesce(item->'checklist','[]'),coalesce((item->>'progress')::integer,0),nullif(item->>'completed_on','')::date,coalesce(item->>'timing_mode','fixed'),coalesce((item->>'reserved_hours')::numeric,0))
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
      if coalesce((item->>'prevent_overlap')::boolean,false) then
        if exists(select 1 from public.focus_sessions s where s.user_id=auth.uid() and s.scheduled_start<(item->>'scheduled_end')::timestamptz and s.scheduled_end>(item->>'scheduled_start')::timestamptz)
        or exists(select 1 from public.timetable_entries t where t.user_id=auth.uid()
          and ((item->>'scheduled_start')::timestamptz at time zone (item->>'timezone'))::date between t.valid_from and t.valid_until
          and extract(isodow from ((item->>'scheduled_start')::timestamptz at time zone (item->>'timezone')))::integer-1=t.weekday
          and t.start_minute < extract(hour from ((item->>'scheduled_end')::timestamptz at time zone (item->>'timezone')))*60+extract(minute from ((item->>'scheduled_end')::timestamptz at time zone (item->>'timezone')))
          and t.end_minute > extract(hour from ((item->>'scheduled_start')::timestamptz at time zone (item->>'timezone')))*60+extract(minute from ((item->>'scheduled_start')::timestamptz at time zone (item->>'timezone'))))
        then raise exception 'Lịch vừa thay đổi hoặc phiên bị trùng TKB. Hãy đóng và mở lại kế hoạch tuần để tạo gợi ý mới.'; end if;
      end if;
      insert into public.focus_sessions(user_id,goal_id,title,notes,scheduled_start,scheduled_end,planned_minutes,timezone)
      values(auth.uid(),goal_uuid,item->>'title',coalesce(item->>'notes',''),(item->>'scheduled_start')::timestamptz,(item->>'scheduled_end')::timestamptz,(item->>'planned_minutes')::integer,item->>'timezone');
    elsif item->>'kind'='activity' then
      if (item->>'date')::date>(now() at time zone 'Asia/Ho_Chi_Minh')::date then raise exception 'Nhật ký phải là việc đã làm.'; end if;
      insert into public.activities(user_id,goal_id,title,notes,occurred_on,kind,duration_minutes,color,is_milestone,milestone_kind,started_at,ended_at)
      values(auth.uid(),goal_uuid,item->>'title',coalesce(item->>'notes',''),(item->>'date')::date,'event',coalesce((item->>'minutes')::numeric,0),coalesce(item->>'color','#237a4b'),coalesce((item->>'is_milestone')::boolean,false),coalesce(item->>'milestone_kind','general'),(item->>'started_at')::timestamptz,(item->>'ended_at')::timestamptz);
    elsif item->>'kind'='timetable' then
      insert into public.timetable_entries(user_id,title,kind,semester_index,weekday,start_minute,end_minute,valid_from,valid_until,notes)
      values(auth.uid(),item->>'title',coalesce(item->>'schedule_kind','class'),coalesce((item->>'semester_index')::integer,0),(item->>'weekday')::integer,(item->>'start_minute')::integer,(item->>'end_minute')::integer,(item->>'valid_from')::date,(item->>'valid_until')::date,coalesce(item->>'notes',''));
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

