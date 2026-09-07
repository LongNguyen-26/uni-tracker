alter table public.profiles add column study_years integer not null default 4 check(study_years in (4,5,6)), add column semester_settings jsonb not null default '[]' check(jsonb_typeof(semester_settings)='array');
alter table public.goals drop constraint goals_tracking_mode_check;
alter table public.goals add constraint goals_tracking_mode_check check(tracking_mode in ('progress','milestone','numeric','checklist')),
  add column starts_on date,
  add column semester_index integer check(semester_index between 0 and 11),
  add column metric_current numeric not null default 0 check(metric_current between -1000000000 and 1000000000),
  add column metric_target numeric not null default 1 check(metric_target between -1000000000 and 1000000000),
  add column metric_unit text not null default '' check(char_length(metric_unit)<=30),
  add column metric_direction text not null default 'increase' check(metric_direction in ('increase','decrease')),
  add column checklist jsonb not null default '[]' check(jsonb_typeof(checklist)='array' and jsonb_array_length(checklist)<=100),
  add constraint goal_valid_period check(starts_on is null or (starts_on<=deadline and deadline-starts_on<=2196));
alter table public.activities alter column duration_minutes type numeric using duration_minutes::numeric,
  add column started_at timestamptz, add column ended_at timestamptz,
  add constraint activity_time_pair check((started_at is null and ended_at is null) or (started_at is not null and ended_at is not null and ended_at>=started_at and ended_at-started_at<=interval '1 day'));

create function public.validate_academic_settings() returns trigger language plpgsql security invoker set search_path='' as $$
declare item jsonb; holiday jsonb; previous_end date; idx integer:=0; a date; b date;
begin
  if jsonb_array_length(new.semester_settings) not in (0,new.study_years*2) then raise exception 'Cần cấu hình đủ các học kỳ.'; end if;
  for item in select value from jsonb_array_elements(new.semester_settings) loop
    a:=(item->>'start')::date; b:=(item->>'end')::date;
    if (item->>'index')::integer is distinct from idx or a is null or b is null or b<a or b-a>370 or a<=previous_end or char_length(coalesce(item->>'label',''))>80 then raise exception 'Khoảng ngày học kỳ không hợp lệ hoặc chồng lấn.'; end if;
    if jsonb_typeof(item->'breaks') is distinct from 'array' or jsonb_array_length(item->'breaks')>30 then raise exception 'Danh sách kỳ nghỉ không hợp lệ.'; end if;
    for holiday in select value from jsonb_array_elements(item->'breaks') loop
      if (holiday->>'start')::date is null or (holiday->>'end')::date is null or (holiday->>'start')::date<a or (holiday->>'end')::date>b or (holiday->>'end')::date<(holiday->>'start')::date or char_length(coalesce(holiday->>'label',''))>80 then raise exception 'Kỳ nghỉ phải nằm trong học kỳ.'; end if;
    end loop;
    previous_end:=b; idx:=idx+1;
  end loop;
  return new;
end $$;
create trigger validate_academic_settings before insert or update on public.profiles for each row execute function public.validate_academic_settings();
revoke execute on function public.validate_academic_settings() from public,anon; grant execute on function public.validate_academic_settings() to authenticated;

create function public.normalize_goal_tracking() returns trigger language plpgsql security invoker set search_path='' as $$
declare step jsonb; total integer; done_count integer:=0;
begin
  for step in select value from jsonb_array_elements(new.checklist) loop
    if jsonb_typeof(step->'done') is distinct from 'boolean' or char_length(btrim(coalesce(step->>'title',''))) not between 1 and 160 or char_length(coalesce(step->>'id','')) not between 1 and 80 then raise exception 'Cột mốc dự án không hợp lệ.'; end if;
    if (step->>'done')::boolean then done_count:=done_count+1; end if;
  end loop;
  if new.tracking_mode='numeric' then
    new.progress:=case when (new.metric_direction='increase' and new.metric_current>=new.metric_target) or (new.metric_direction='decrease' and new.metric_current<=new.metric_target) then 100 else 0 end;
  elsif new.tracking_mode='checklist' then
    total:=jsonb_array_length(new.checklist);
    new.progress:=case when total=0 then 0 else floor(done_count*100.0/total)::integer end;
  end if;
  if new.progress=100 then new.completed_on:=coalesce(new.completed_on,(now() at time zone 'Asia/Ho_Chi_Minh')::date); else new.completed_on:=null; end if;
  return new;
end $$;
create trigger normalize_goal_tracking before insert or update on public.goals for each row execute function public.normalize_goal_tracking();
revoke execute on function public.normalize_goal_tracking() from public,anon; grant execute on function public.normalize_goal_tracking() to authenticated;

create or replace function public.record_goal_progress() returns trigger language plpgsql security invoker set search_path='' as $$
declare detail text;
begin
  if TG_OP='UPDATE' then
    if new.progress=old.progress and new.completed_on is not distinct from old.completed_on and (new.tracking_mode<>'numeric' or new.metric_current=old.metric_current) and (new.tracking_mode<>'checklist' or new.checklist=old.checklist) then return new; end if;
  elsif new.progress=0 then return new; end if;
  detail:=case when new.tracking_mode='numeric' then new.metric_current||' → '||new.metric_target||' '||new.metric_unit when new.tracking_mode='checklist' then (select count(*) from jsonb_array_elements(new.checklist) s where (s->>'done')::boolean)||'/'||jsonb_array_length(new.checklist)||' cột mốc' when new.progress=100 then 'Đã hoàn thành mục tiêu.' else 'Tiến độ: '||new.progress||'%' end;
  insert into public.activities(user_id,goal_id,title,notes,occurred_on,kind,color,is_milestone,milestone_kind,goal_title)
  values(new.user_id,new.id,new.title,detail,coalesce(new.completed_on,(now() at time zone 'Asia/Ho_Chi_Minh')::date),case when new.progress=100 then 'completion' else 'progress' end,new.color,new.progress=100,new.milestone_kind,new.title);
  return new;
end $$;

create table public.weekly_budgets(
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null, week_start date not null check(extract(isodow from week_start)=1),
  planned_minutes integer not null check(planned_minutes between 0 and 10080),
  unique(user_id,week_start,goal_id), foreign key(goal_id,user_id) references public.goals(id,user_id) on delete cascade
);
create index weekly_budgets_goal_owner_idx on public.weekly_budgets(goal_id,user_id);
create table public.focus_sessions(
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, goal_id uuid,
  title text not null check(char_length(btrim(title)) between 1 and 160), notes text not null default '' check(char_length(notes)<=4000),
  scheduled_start timestamptz not null, scheduled_end timestamptz not null,
  planned_minutes integer not null check(planned_minutes between 1 and 1440),
  timezone text not null default 'Asia/Ho_Chi_Minh' check(char_length(timezone) between 1 and 80),
  elapsed_seconds integer not null default 0 check(elapsed_seconds>=0), running_since timestamptz,
  status text not null default 'planned' check(status in ('planned','running','paused','review','completed')),
  segments jsonb not null default '[]' check(jsonb_typeof(segments)='array' and jsonb_array_length(segments)<=1000),
  created_at timestamptz not null default now(), unique(id,user_id),
  foreign key(goal_id,user_id) references public.goals(id,user_id) on delete set null(goal_id),
  check(scheduled_end>scheduled_start and scheduled_end-scheduled_start<=interval '1 day'),
  check(elapsed_seconds<=planned_minutes*60), check((status='running')=(running_since is not null))
);
create index focus_sessions_owner_date_idx on public.focus_sessions(user_id,scheduled_start,id);
create index focus_sessions_goal_owner_idx on public.focus_sessions(goal_id,user_id);
create unique index one_running_session_per_user on public.focus_sessions(user_id) where status='running';
alter table public.activities add column session_id uuid,
  add constraint activities_session_owner_fk foreign key(session_id,user_id) references public.focus_sessions(id,user_id) on delete set null(session_id),
  add constraint activity_one_session_day unique(session_id,occurred_on);
create index activities_session_owner_idx on public.activities(session_id,user_id);
alter table public.weekly_budgets enable row level security; alter table public.focus_sessions enable row level security;
revoke all on public.weekly_budgets,public.focus_sessions from anon;
grant select,insert,update,delete on public.weekly_budgets,public.focus_sessions to authenticated;
create policy budgets_owner on public.weekly_budgets for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy sessions_owner on public.focus_sessions for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);

create function public.transition_session(p_id uuid,p_action text,p_notes text default null) returns public.focus_sessions
language plpgsql security invoker set search_path='' as $$
declare s public.focus_sessions; delta integer; segment jsonb; cursor_time timestamptz; until_time timestamptz; day_end timestamptz; seconds_in_day numeric; goal_color text;
begin
  if auth.uid() is null then raise exception 'Hãy đăng nhập.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  select * into s from public.focus_sessions where id=p_id and user_id=auth.uid() for update;
  if not found then raise exception 'Không tìm thấy phiên làm việc.'; end if;
  if p_action not in ('start','pause','stop','confirm') then raise exception 'Thao tác không hợp lệ.'; end if;
  if not exists(select 1 from pg_timezone_names where name=s.timezone) then raise exception 'Múi giờ không hợp lệ.'; end if;
  if s.status='completed' then return s; end if;
  if p_action='start' then
    if s.status='running' then return s; end if;
    if s.elapsed_seconds>=s.planned_minutes*60 or s.status='review' then raise exception 'Phiên đã kết thúc; hãy xác nhận nhật ký.'; end if;
    if exists(select 1 from public.focus_sessions where user_id=auth.uid() and status='running' and id<>p_id) then raise exception 'Hãy tạm dừng phiên đang chạy trước.'; end if;
    s.status:='running';s.running_since:=clock_timestamp();
  else
    if s.status='running' then
      delta:=greatest(0,least(s.planned_minutes*60-s.elapsed_seconds,floor(extract(epoch from clock_timestamp()-s.running_since))::integer));
      if delta>0 then s.segments:=s.segments||jsonb_build_array(jsonb_build_object('start',s.running_since,'end',s.running_since+delta*interval '1 second')); end if;
      s.elapsed_seconds:=s.elapsed_seconds+delta;s.running_since:=null;
    end if;
    s.status:=case when p_action='pause' and s.elapsed_seconds<s.planned_minutes*60 then 'paused' else 'review' end;
    if p_action='confirm' then
      if s.elapsed_seconds<1 then raise exception 'Phiên chưa có thời gian thực tế để lưu.'; end if;
      s.notes:=coalesce(p_notes,s.notes);
      select color into goal_color from public.goals where id=s.goal_id and user_id=auth.uid();
      for segment in select value from jsonb_array_elements(s.segments) loop
        cursor_time:=(segment->>'start')::timestamptz;until_time:=(segment->>'end')::timestamptz;
        while cursor_time<until_time loop
          day_end:=least(until_time,((cursor_time at time zone s.timezone)::date+1)::timestamp at time zone s.timezone);
          seconds_in_day:=extract(epoch from day_end-cursor_time);
          insert into public.activities(user_id,goal_id,session_id,title,notes,occurred_on,kind,duration_minutes,color,started_at,ended_at)
          values(s.user_id,s.goal_id,s.id,s.title,s.notes,(cursor_time at time zone s.timezone)::date,'event',seconds_in_day/60,coalesce(goal_color,'#237a4b'),cursor_time,day_end)
          on conflict(session_id,occurred_on) do update set duration_minutes=public.activities.duration_minutes+excluded.duration_minutes,started_at=least(public.activities.started_at,excluded.started_at),ended_at=greatest(public.activities.ended_at,excluded.ended_at);
          cursor_time:=day_end;
        end loop;
      end loop;
      s.status:='completed';
    end if;
  end if;
  update public.focus_sessions set status=s.status,elapsed_seconds=s.elapsed_seconds,running_since=s.running_since,segments=s.segments,notes=s.notes where id=s.id returning * into s;
  return s;
end $$;
revoke execute on function public.transition_session(uuid,text,text) from public,anon; grant execute on function public.transition_session(uuid,text,text) to authenticated;
