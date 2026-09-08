begin;
select set_config('test.user',gen_random_uuid()::text,true);
select set_config('test.other',gen_random_uuid()::text,true);
insert into auth.users(id,email) values(current_setting('test.user')::uuid,'autosave-local@example.invalid'),(current_setting('test.other')::uuid,'autosave-other@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.user'),true);
do $$
declare goal uuid; session uuid; empty_session uuid; s public.focus_sessions; r public.focus_sessions; stopped timestamptz; logs integer;
begin
 insert into public.goals(user_id,title,tracking_mode) values(auth.uid(),'Research','none') returning id into goal;
 insert into public.focus_sessions(user_id,goal_id,title,intent,scheduled_start,scheduled_end,planned_minutes,timezone,status,running_since,elapsed_seconds,segments)
 values(auth.uid(),goal,'Research','Read paper','2026-09-07T23:00:00+07','2026-09-08T00:00:00+07',60,'Asia/Ho_Chi_Minh','running',clock_timestamp()-interval '60 seconds',17,'[{"start":"2026-09-06T23:59:50+07","end":"2026-09-07T00:00:07+07"}]') returning id into session;
 select running_since+interval '23 seconds' into stopped from public.focus_sessions where id=session;
 s:=public.finish_session(session,stopped);
 if s.status<>'completed' or s.elapsed_seconds<>40 or s.actual<>'Read paper' then raise exception 'Autosave wrong: %',s; end if;
 if (select round(sum(duration_minutes)*60) from public.activities where session_id=session)<>40 then raise exception 'Exact seconds lost'; end if;
 select count(*) into logs from public.activities where session_id=session;
 r:=public.finish_session(session,stopped+interval '60 seconds');
 if r.elapsed_seconds<>40 or (select count(*) from public.activities where session_id=session)<>logs then raise exception 'Retry added time or duplicated logs'; end if;
 perform public.set_session_content(session,null,'Actual result');
 if exists(select 1 from public.activities where session_id=session and title<>'Actual result') then raise exception 'Actual did not sync'; end if;
 update public.activities set title='Edited history' where id=(select id from public.activities where session_id=session limit 1);
 if (select actual from public.focus_sessions where id=session)<>'Edited history' or exists(select 1 from public.activities where session_id=session and title<>'Edited history') then raise exception 'History did not sync'; end if;
 insert into public.focus_sessions(user_id,goal_id,title,intent,scheduled_start,scheduled_end,planned_minutes) values(auth.uid(),goal,'Research','','2026-09-08T09:00:00+07','2026-09-08T10:00:00+07',60) returning id into empty_session;
 s:=public.finish_session(empty_session,clock_timestamp());
 if s.elapsed_seconds<>0 or exists(select 1 from public.activities where session_id=empty_session) then raise exception 'Zero minute phantom log'; end if;
 insert into public.focus_sessions(user_id,goal_id,title,intent,scheduled_start,scheduled_end,planned_minutes,status,elapsed_seconds,segments) values(auth.uid(),goal,'Research','','2026-09-08T09:00:00+07','2026-09-08T10:00:00+07',60,'review',2,'[{"start":"2026-09-08T09:00:00+07","end":"2026-09-08T09:00:02+07"}]') returning id into empty_session;
 s:=public.finish_session(empty_session,clock_timestamp());
 if s.actual<>'' or s.elapsed_seconds<>2 then raise exception 'Empty intent must stay optional'; end if;
 perform set_config('test.session',session::text,true);
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
do $$ begin
 begin perform public.finish_session(current_setting('test.session')::uuid,now());raise exception 'Ownership test failed';exception when others then if sqlerrm='Ownership test failed' then raise;end if;end;
 if exists(select 1 from public.activities) then raise exception 'Owner data leaked';end if;
end $$;
reset role;
rollback;
