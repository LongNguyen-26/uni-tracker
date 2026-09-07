begin;
select set_config('test.user',gen_random_uuid()::text,true);
select set_config('test.other',gen_random_uuid()::text,true);
select set_config('test.goal',gen_random_uuid()::text,true);
select set_config('test.session',gen_random_uuid()::text,true);
select set_config('test.batch',gen_random_uuid()::text,true);
insert into auth.users(id,email) values(current_setting('test.user')::uuid,'planning-'||current_setting('test.user')||'@example.invalid'),(current_setting('test.other')::uuid,'planning-'||current_setting('test.other')||'@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.user'),true);
insert into public.profiles(id,display_name,start_year,start_month,study_years) values(current_setting('test.user')::uuid,'Test',2026,9,6);
insert into public.goals(id,user_id,title,deadline,tracking_mode,metric_current,metric_target,metric_unit) values(current_setting('test.goal')::uuid,current_setting('test.user')::uuid,'IELTS','2026-12-01','numeric',6.5,7,'band');
update public.goals set metric_current=7 where id=current_setting('test.goal')::uuid;
do $$ begin
 if not exists(select 1 from public.goals where id=current_setting('test.goal')::uuid and progress=100 and completed_on is not null) then raise exception 'Numeric goal completion failed'; end if;
 if not exists(select 1 from public.activities where goal_id=current_setting('test.goal')::uuid and notes like '%7 → 7 band%') then raise exception 'Numeric history failed'; end if;
end $$;
update public.goals set tracking_mode='checklist',checklist='[{"id":"1","title":"A","done":true},{"id":"2","title":"B","done":false},{"id":"3","title":"C","done":false}]' where id=current_setting('test.goal')::uuid;
do $$ begin
 if not exists(select 1 from public.goals where id=current_setting('test.goal')::uuid and progress=33 and completed_on is null) then raise exception 'Checklist derived progress failed'; end if;
 begin
  insert into public.weekly_budgets(user_id,goal_id,week_start,planned_minutes) values(current_setting('test.user')::uuid,current_setting('test.goal')::uuid,'2026-09-08',60);
  raise exception 'Tuesday accepted';
 exception when check_violation then null; end;
end $$;
insert into public.focus_sessions(id,user_id,goal_id,title,scheduled_start,scheduled_end,planned_minutes,elapsed_seconds,status,segments)
values(current_setting('test.session')::uuid,current_setting('test.user')::uuid,current_setting('test.goal')::uuid,'Midnight work','2026-09-06T23:50:00+07','2026-09-07T00:20:00+07',30,900,'paused','[{"start":"2026-09-06T23:50:00+07:00","end":"2026-09-07T00:00:00+07:00"},{"start":"2026-09-07T00:10:00+07:00","end":"2026-09-07T00:15:00+07:00"}]');
select public.transition_session(current_setting('test.session')::uuid,'confirm','Đọc Paper');
select public.transition_session(current_setting('test.session')::uuid,'confirm','Retry');
do $$ begin
 if (select count(*) from public.activities where session_id=current_setting('test.session')::uuid)<>2 then raise exception 'Midnight splitting or duplicate prevention failed'; end if;
 if (select sum(duration_minutes) from public.activities where session_id=current_setting('test.session')::uuid)<>15 then raise exception 'Paused time included or duplicated'; end if;
end $$;
update public.activities set title='Edited activity',duration_minutes=8,notes='Correction' where session_id=current_setting('test.session')::uuid and occurred_on='2026-09-06';
select public.transition_session(current_setting('test.session')::uuid,'confirm');
do $$ begin
 if (select sum(duration_minutes) from public.activities where session_id=current_setting('test.session')::uuid)<>13 then raise exception 'Retry overwrote manual edit'; end if;
end $$;
select public.import_tracker(current_setting('test.batch')::uuid,'[{"kind":"goal","ref":"paper","title":"Import test","deadline":"2026-12-01","tracking_mode":"milestone"},{"kind":"session","goal_ref":"paper","title":"Work","scheduled_start":"2026-09-07T09:00:00+07","scheduled_end":"2026-09-07T10:00:00+07","planned_minutes":60,"timezone":"Asia/Ho_Chi_Minh"}]');
select public.import_tracker(current_setting('test.batch')::uuid,'[{"kind":"goal","ref":"paper","title":"Import test","deadline":"2026-12-01","tracking_mode":"milestone"},{"kind":"session","goal_ref":"paper","title":"Work","scheduled_start":"2026-09-07T09:00:00+07","scheduled_end":"2026-09-07T10:00:00+07","planned_minutes":60,"timezone":"Asia/Ho_Chi_Minh"}]');
do $$ begin
 if (select count(*) from public.goals where title='Import test')<>1 then raise exception 'Repeated import duplicated'; end if;
 begin
  perform public.import_tracker(gen_random_uuid(),'[{"kind":"goal","title":"Should roll back","deadline":"2026-12-01"},{"kind":"session","title":"Invalid","scheduled_start":"2026-09-07T09:00:00+07","scheduled_end":"2026-09-07T08:00:00+07","planned_minutes":60,"timezone":"Asia/Ho_Chi_Minh"}]');
  raise exception 'Invalid session accepted';
 exception when check_violation then null; when raise_exception then if sqlerrm<>'Thời lượng dự kiến cần khớp với khung giờ đã chọn.' then raise; end if; end;
 if exists(select 1 from public.goals where title='Should roll back') then raise exception 'Partial import persisted'; end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
do $$ begin
 if exists(select 1 from public.focus_sessions) or exists(select 1 from public.import_batches) then raise exception 'Cross-user data visible'; end if;
 begin
  insert into public.weekly_budgets(user_id,goal_id,week_start,planned_minutes) values(current_setting('test.other')::uuid,current_setting('test.goal')::uuid,'2026-09-07',60);
  raise exception 'Cross-user goal linked';
 exception when foreign_key_violation then null; end;
end $$;
reset role;
rollback;
