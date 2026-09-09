begin;
select set_config('test.user',gen_random_uuid()::text,true);
select set_config('test.other',gen_random_uuid()::text,true);
insert into auth.users(id,email) values(current_setting('test.user')::uuid,'overtime-local@example.invalid'),(current_setting('test.other')::uuid,'overtime-other@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.user'),true);
do $$
declare goal uuid; session uuid; long_session uuid; s public.focus_sessions; logs integer; total numeric;
begin
 insert into public.goals(user_id,title,tracking_mode) values(auth.uid(),'Research','none') returning id into goal;

 -- A 10 minute plan worked for 25 minutes keeps every second past the target.
 insert into public.focus_sessions(user_id,goal_id,title,intent,scheduled_start,scheduled_end,planned_minutes,timezone,status,running_since,elapsed_seconds,segments)
 values(auth.uid(),goal,'Research','Read paper','2026-09-07T09:00:00+07','2026-09-07T09:10:00+07',10,'Asia/Ho_Chi_Minh','running',clock_timestamp()-interval '900 seconds',600,'[{"start":"2026-09-07T08:00:00+07","end":"2026-09-07T08:10:00+07"}]') returning id into session;
 s:=public.transition_session(session,'pause');
 -- Past the plan a pause is still a pause: the student can carry on.
 if s.status<>'paused' then raise exception 'Overtime pause became %',s.status; end if;
 if s.elapsed_seconds<1500 then raise exception 'Overtime was clamped to %',s.elapsed_seconds; end if;
 s:=public.transition_session(session,'start');
 if s.status<>'running' then raise exception 'Could not resume past the plan'; end if;
 s:=public.transition_session(session,'stop');
 s:=public.transition_session(session,'confirm');
 if s.status<>'completed' then raise exception 'Confirm failed after overtime'; end if;
 select round(sum(duration_minutes)*60) into total from public.activities where session_id=session;
 if total<>s.elapsed_seconds then raise exception 'Logged % seconds for % elapsed',total,s.elapsed_seconds;end if;
 if total<1500 then raise exception 'Overtime not written to the journal: %',total; end if;

 -- The ceiling constraint is gone, so an over-plan row is storable directly.
 insert into public.focus_sessions(user_id,goal_id,title,scheduled_start,scheduled_end,planned_minutes,timezone,status,elapsed_seconds,segments)
 values(auth.uid(),goal,'Research','2026-09-09T09:00:00+07','2026-09-09T09:30:00+07',30,'Asia/Ho_Chi_Minh','paused',7200,'[{"start":"2026-09-09T09:00:00+07","end":"2026-09-09T11:00:00+07"}]') returning id into long_session;

 -- Segments still have to match elapsed exactly; overtime does not loosen that.
 begin
  update public.focus_sessions set elapsed_seconds=9999 where id=long_session;
  raise exception 'Integrity test failed';
 exception when others then if sqlerrm='Integrity test failed' then raise; end if; end;

 -- A confirmed overnight overrun splits per day and stays within a day's worth.
 update public.focus_sessions set status='review',elapsed_seconds=43200,
  segments='[{"start":"2026-09-10T20:00:00+07","end":"2026-09-11T08:00:00+07"}]',
  scheduled_start='2026-09-10T20:00:00+07',scheduled_end='2026-09-10T21:00:00+07',planned_minutes=60
  where id=long_session;
 s:=public.transition_session(long_session,'confirm');
 select count(*),round(sum(duration_minutes)*60) into logs,total from public.activities where session_id=long_session;
 if logs<>2 then raise exception 'Overnight overrun produced % logs',logs; end if;
 if total<>43200 then raise exception 'Overnight overrun logged % seconds',total; end if;
 if exists(select 1 from public.activities where session_id=long_session and duration_minutes>1440) then raise exception 'A single day exceeded 24h'; end if;

 -- Confirming twice must not double-count the overtime.
 s:=public.transition_session(long_session,'confirm');
 select round(sum(duration_minutes)*60) into total from public.activities where session_id=long_session;
 if total<>43200 then raise exception 'Re-confirm changed the journal to %',total; end if;

 perform set_config('test.session',session::text,true);
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
do $$ begin
 begin perform public.transition_session(current_setting('test.session')::uuid,'start');raise exception 'Ownership test failed';exception when others then if sqlerrm='Ownership test failed' then raise;end if;end;
 if exists(select 1 from public.activities) then raise exception 'Owner data leaked';end if;
end $$;
reset role;
rollback;
