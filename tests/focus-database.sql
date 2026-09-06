begin;
select set_config('test.user', gen_random_uuid()::text, true);
select set_config('test.goal', gen_random_uuid()::text, true);
select set_config('test.event', gen_random_uuid()::text, true);
insert into auth.users(id,email) values(current_setting('test.user')::uuid, 'focus-' || current_setting('test.user') || '@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.user'), true);
insert into public.goals(id,user_id,title,deadline,color,tracking_mode,milestone_kind)
values(current_setting('test.goal')::uuid,current_setting('test.user')::uuid,'Final exam','2026-12-01','#dc2626','milestone','final');
do $$ begin
 begin
  update public.goals set progress=30 where id=current_setting('test.goal')::uuid;
  raise exception 'Fractional milestone permitted';
 exception when check_violation then null;
 end;
 begin
  update public.goals set color='red' where id=current_setting('test.goal')::uuid;
  raise exception 'Invalid color permitted';
 exception when check_violation then null;
 end;
end $$;
insert into public.activities(id,user_id,goal_id,title,occurred_on,duration_minutes)
values(current_setting('test.event')::uuid,current_setting('test.user')::uuid,current_setting('test.goal')::uuid,'Revision','2026-09-06',90);
do $$ begin
 if not exists(select 1 from public.activities where id=current_setting('test.event')::uuid and color='#dc2626' and goal_title='Final exam' and duration_minutes=90) then raise exception 'Goal snapshot or time missing'; end if;
 begin
  update public.activities set duration_minutes=-1 where id=current_setting('test.event')::uuid;
  raise exception 'Negative time permitted';
 exception when check_violation then null;
 end;
end $$;
update public.activities set goal_id=null where id=current_setting('test.event')::uuid;
do $$ begin
 if exists(select 1 from public.activities where id=current_setting('test.event')::uuid and goal_title<>'') then raise exception 'Manual detach retained association'; end if;
end $$;
update public.activities set goal_id=current_setting('test.goal')::uuid where id=current_setting('test.event')::uuid;
update public.goals set progress=100,completed_on='2026-09-06' where id=current_setting('test.goal')::uuid;
do $$ begin
 if not exists(select 1 from public.activities where goal_id=current_setting('test.goal')::uuid and kind='completion' and is_milestone and milestone_kind='final' and color='#dc2626' and duration_minutes=0) then raise exception 'Milestone completion metadata missing'; end if;
end $$;
delete from public.goals where id=current_setting('test.goal')::uuid;
do $$ begin
 if not exists(select 1 from public.activities where id=current_setting('test.event')::uuid and goal_id is null and goal_title='Final exam' and color='#dc2626' and duration_minutes=90) then raise exception 'Deleted goal lost snapshot'; end if;
end $$;
reset role;
select 'PASS: milestone constraints, color validation, actual minutes, detach and deleted-goal history' as result;
rollback;
