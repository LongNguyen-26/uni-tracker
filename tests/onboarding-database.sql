begin;
select set_config('test.user_a',gen_random_uuid()::text,true);
select set_config('test.user_b',gen_random_uuid()::text,true);
insert into auth.users(id,email) values (current_setting('test.user_a')::uuid,'setup-a-'||current_setting('test.user_a')||'@example.invalid'),(current_setting('test.user_b')::uuid,'setup-b-'||current_setting('test.user_b')||'@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.user_a'),true);
insert into public.profiles(id,display_name,start_year,start_month,study_years,onboarding_term,preparation_skipped) values(current_setting('test.user_a')::uuid,'Setup QA',2024,8,3,4,array['timetable']);
do $$ begin
 if not exists(select 1 from public.profiles where id=current_setting('test.user_a')::uuid and onboarding_term=4 and study_years=3 and preparation_skipped=array['timetable'] and not preparation_done) then raise exception 'Setup not persisted'; end if;
 begin update public.profiles set onboarding_term=6 where id=current_setting('test.user_a')::uuid; raise exception 'Invalid semester permitted'; exception when check_violation then null; end;
 begin update public.profiles set preparation_skipped=array['invalid'] where id=current_setting('test.user_a')::uuid; raise exception 'Invalid skipped step permitted'; exception when check_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.user_b'),true);
do $$ begin if exists(select 1 from public.profiles where id=current_setting('test.user_a')::uuid) then raise exception 'Profile leaked'; end if; end $$;
rollback;
