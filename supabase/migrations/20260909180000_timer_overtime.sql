-- The app records what happened, it does not protect the plan: a countdown that
-- reaches zero keeps running and the extra time is logged like any other.
-- Drops the elapsed<=planned ceiling and the two places that clamped to it.
-- The previous deployment stays compatible: it simply never writes past the old
-- ceiling, and every other session invariant is unchanged.
do $$
declare ceiling_name text;
begin
  select conname into ceiling_name from pg_constraint
   where conrelid = 'public.focus_sessions'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%elapsed_seconds <= (planned_minutes * 60)%';
  if ceiling_name is not null then
    execute format('alter table public.focus_sessions drop constraint %I', ceiling_name);
  end if;
end $$;

create or replace function public.transition_session(p_id uuid,p_action text,p_notes text default null) returns public.focus_sessions
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
    -- Passing the planned duration no longer ends a session; only a stop does.
    if s.status='review' then raise exception 'Phiên đã kết thúc; hãy xác nhận nhật ký.'; end if;
    if exists(select 1 from public.focus_sessions where user_id=auth.uid() and status='running' and id<>p_id) then raise exception 'Hãy tạm dừng phiên đang chạy trước.'; end if;
    s.status:='running';s.running_since:=clock_timestamp();
  else
    if s.status='running' then
      delta:=greatest(0,floor(extract(epoch from clock_timestamp()-s.running_since))::integer);
      if delta>0 then s.segments:=s.segments||jsonb_build_array(jsonb_build_object('start',s.running_since,'end',s.running_since+delta*interval '1 second')); end if;
      s.elapsed_seconds:=s.elapsed_seconds+delta;s.running_since:=null;
    end if;
    s.status:=case when p_action='pause' then 'paused' else 'review' end;
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

create or replace function public.finish_session(p_id uuid,p_stopped_at timestamptz,p_actual text default null) returns public.focus_sessions
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
  -- Replays against the original stop instant, now without the planned ceiling.
  delta:=greatest(0,floor(extract(epoch from stop_at-s.running_since))::integer);
  if delta>0 then s.segments:=s.segments||jsonb_build_array(jsonb_build_object('start',s.running_since,'end',s.running_since+delta*interval '1 second')); end if;
  s.elapsed_seconds:=s.elapsed_seconds+delta;
 end if;
 update public.focus_sessions set running_since=null,status='paused',elapsed_seconds=s.elapsed_seconds,segments=s.segments,actual=content,title=coalesce(nullif(content,''),(select title from public.goals where id=s.goal_id),s.title) where id=s.id returning * into s;
 if s.elapsed_seconds>0 then s:=public.transition_session(s.id,'confirm',s.notes);
 else update public.focus_sessions set status='completed' where id=s.id returning * into s; end if;
 return s;
end $$;
