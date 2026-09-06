begin;
select set_config('test.user_a', gen_random_uuid()::text, true);
select set_config('test.user_b', gen_random_uuid()::text, true);
select set_config('test.goal', gen_random_uuid()::text, true);
insert into auth.users(id, email) values
(current_setting('test.user_a')::uuid, 'rls-a-' || current_setting('test.user_a') || '@example.invalid'),
(current_setting('test.user_b')::uuid, 'rls-b-' || current_setting('test.user_b') || '@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.user_a'), true);
insert into public.profiles(id,display_name,start_year,start_month) values(current_setting('test.user_a')::uuid,'Test A',2024,9);
insert into public.goals(id,user_id,title,deadline,progress) values(current_setting('test.goal')::uuid,current_setting('test.user_a')::uuid,'Test goal','2026-10-01',20);
do $$ begin
 if (select count(*) from public.activities where goal_id = current_setting('test.goal')::uuid and kind='progress') <> 1 then raise exception 'Initial progress missing'; end if;
end $$;
update public.goals set progress=100, completed_on='2026-09-05' where id=current_setting('test.goal')::uuid;
do $$ begin
 if (select count(*) from public.activities where goal_id=current_setting('test.goal')::uuid and kind='completion' and occurred_on='2026-09-05') <> 1 then raise exception 'Completion history missing'; end if;
end $$;
update public.goals set title='Renamed goal' where id=current_setting('test.goal')::uuid;
do $$ begin
 if (select count(*) from public.activities where goal_id=current_setting('test.goal')::uuid) <> 2 then raise exception 'No-op update duplicated history'; end if;
 begin
   update public.goals set user_id=current_setting('test.user_b')::uuid where id=current_setting('test.goal')::uuid;
   raise exception 'Owner reassignment was permitted';
 exception when insufficient_privilege then null;
 end;
end $$;
select set_config('request.jwt.claim.sub', current_setting('test.user_b'), true);
do $$ begin
 if exists(select 1 from public.profiles where id=current_setting('test.user_a')::uuid) then raise exception 'Profile leaked'; end if;
 if exists(select 1 from public.goals where id=current_setting('test.goal')::uuid) then raise exception 'Goal leaked'; end if;
 if exists(select 1 from public.activities where user_id=current_setting('test.user_a')::uuid) then raise exception 'Activity leaked'; end if;
 begin
  insert into public.goals(user_id,title,deadline) values(current_setting('test.user_a')::uuid,'spoof','2026-10-01');
  raise exception 'Insert spoof permitted';
 exception when insufficient_privilege then null;
 end;
 begin
  insert into public.activities(user_id,goal_id,title,occurred_on) values(current_setting('test.user_b')::uuid,current_setting('test.goal')::uuid,'cross owner','2026-09-06');
  raise exception 'Cross-owner relation permitted';
 exception when foreign_key_violation then null;
 end;
 update public.goals set title='hacked' where id=current_setting('test.goal')::uuid;
 if found then raise exception 'Cross-owner update permitted'; end if;
 delete from public.goals where id=current_setting('test.goal')::uuid;
 if found then raise exception 'Cross-owner delete permitted'; end if;
end $$;
select set_config('request.jwt.claim.sub', current_setting('test.user_a'), true);
delete from public.goals where id=current_setting('test.goal')::uuid;
do $$ begin
 if (select count(*) from public.activities where user_id=current_setting('test.user_a')::uuid and goal_id is null) <> 2 then raise exception 'Deleting goal lost history'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
 begin
   perform 1 from public.goals;
   raise exception 'Anonymous read permitted';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
select 'PASS: ownership, spoof rejection, atomic history, no duplicate history, retained history and anonymous denial' as result;
rollback;
