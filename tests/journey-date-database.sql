begin;
select set_config('test.user',gen_random_uuid()::text,true);
insert into auth.users(id,email) values(current_setting('test.user')::uuid,'journey-date-local@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.user'),true);
do $$
declare g uuid; count_before integer; steps jsonb;
begin
 insert into public.goals(user_id,title,tracking_mode,metric_current,metric_target,checklist)
 values(auth.uid(),'IELTS','numeric',6,7,'[{"id":"mock","title":"Mock","done":true,"date":"2026-10-31"},{"id":"exam","title":"Exam","done":false,"date":"2026-11-17","end_date":"2026-11-30","timing_mode":"flexible","is_final":true,"counts_for_progress":false}]') returning id into g;
 select count(*) into count_before from public.activities;
 select jsonb_agg(case when x->>'id'='mock' then x||'{"date":"2026-10-30","end_date":"2026-10-30","timing_mode":"fixed"}'::jsonb else x end) into steps from public.goals cross join lateral jsonb_array_elements(checklist) x where id=g;
 update public.goals set checklist=steps where id=g;
 if (select deadline from public.goals where id=g)<>'2026-11-30' then raise exception 'Intermediate confirmation erased final deadline'; end if;
 select jsonb_agg(case when x->>'id'='exam' then x||'{"date":"2026-11-25","end_date":"2026-11-25","timing_mode":"fixed"}'::jsonb else x end) into steps from public.goals cross join lateral jsonb_array_elements(checklist) x where id=g;
 update public.goals set checklist=steps where id=g;
 if not exists(select 1 from public.goals where id=g and deadline='2026-11-25' and starts_on is null and timing_mode='fixed' and metric_current=6 and progress=0 and completed_on is null) then raise exception 'Final date confirmation changed measure or failed to derive deadline'; end if;
 if exists(select 1 from public.goals cross join lateral jsonb_array_elements(checklist) x where id=g and x->>'id'='exam' and (x->>'done')::boolean) then raise exception 'Date confirmation completed milestone'; end if;
 if (select count(*) from public.activities)<>count_before then raise exception 'Metadata confirmation created progress history'; end if;
end $$;
reset role;
rollback;
