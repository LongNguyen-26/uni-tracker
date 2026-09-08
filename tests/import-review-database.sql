begin;
select set_config('test.user',gen_random_uuid()::text,true);
select set_config('test.other',gen_random_uuid()::text,true);
insert into auth.users(id,email) values(current_setting('test.user')::uuid,'review-local@example.invalid'),(current_setting('test.other')::uuid,'other-local@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.user'),true);
do $$
declare batch uuid:=gen_random_uuid(); items jsonb; result jsonb; retry jsonb; g uuid;
begin
 items:='[
 {"kind":"session","row_key":"session","title":"Read","goal_ref":"study","scheduled_start":"2026-09-09T00:00:00+07","scheduled_end":"2026-09-09T00:30:00+07","planned_minutes":30,"is_unscheduled":true,"timezone":"Asia/Ho_Chi_Minh"},
 {"kind":"goal","row_key":"goal","ref":"study","title":"Study","deadline":"2026-12-01","tracking_mode":"none","weekly_hours":6},
 {"kind":"goal","row_key":"badgoal","ref":"bad","title":"Invalid","deadline":"2026-12-01","weekly_hours":999},
 {"kind":"activity","row_key":"dependent","title":"Depends on invalid goal","goal_ref":"bad","date":"2026-09-07","minutes":30},
 {"kind":"timetable","row_key":"fixed","title":"Conference","goal_ref":"study","schedule_kind":"fixed","semester_index":0,"weekday":1,"start_minute":0,"end_minute":1440,"valid_from":"2027-08-18","valid_until":"2027-08-22","all_day":true},
 {"kind":"activity","row_key":"badrow","title":"Too long","date":"2026-09-07","minutes":9999},
 {"kind":"activity","row_key":"actual","title":"Done","goal_ref":"study","date":"2026-09-07","minutes":25}
 ]';
 result:=public.import_tracker_reviewed(batch,items);
 if (result->>'count')::int<>4 or jsonb_array_length(result->'errors')<>3 then raise exception 'Partial import mismatch: %',result; end if;
 g:=(result->'goal_map'->>'study')::uuid;
 if not exists(select 1 from public.goals where id=g and weekly_hours=6 and tracking_mode='none' and progress=0) then raise exception 'Goal measure or hours lost'; end if;
 if not exists(select 1 from public.timetable_entries where goal_id=g and valid_until='2027-08-22' and all_day) then raise exception 'Fixed window or link lost'; end if;
 if not exists(select 1 from public.focus_sessions where goal_id=g and is_unscheduled and planned_minutes=30) then raise exception 'Duration-only intention lost'; end if;
 if (select sum(duration_minutes) from public.activities)<>25 then raise exception 'Fixed/unscheduled time counted as actual'; end if;
 retry:=public.import_tracker_reviewed(batch,items);
 if not (retry->>'already_imported')::boolean or (select count(*) from public.goals)<>1 or (select count(*) from public.activities)<>1 then raise exception 'Idempotency failed'; end if;
 retry:=public.import_tracker_reviewed(gen_random_uuid(),items);
 if not (retry->>'already_imported')::boolean or (select count(*) from public.focus_sessions)<>1 then raise exception 'Content retry duplicated data'; end if;
 perform set_config('test.goal',g::text,true);
 -- An unassigned clock slot must not cause a false overlap in the atomic planner.
 perform public.import_tracker(gen_random_uuid(),'[{"kind":"session","title":"Real slot","scheduled_start":"2026-09-09T00:00:00+07","scheduled_end":"2026-09-09T00:30:00+07","planned_minutes":30,"timezone":"Asia/Ho_Chi_Minh","prevent_overlap":true}]');
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
do $$ declare result jsonb;
begin
 if exists(select 1 from public.goals) or exists(select 1 from public.timetable_entries) or exists(select 1 from public.import_batches) then raise exception 'Owner isolation failed'; end if;
 result:=public.import_tracker_reviewed(gen_random_uuid(),jsonb_build_array(jsonb_build_object('kind','timetable','title','Foreign link','goal_id',current_setting('test.goal'),'weekday',0,'start_minute',480,'end_minute',540,'valid_from','2026-09-07','valid_until','2026-09-07')));
 if (result->>'count')::int<>0 or jsonb_array_length(result->'errors')<>1 or exists(select 1 from public.timetable_entries) then raise exception 'Foreign goal accepted: %',result; end if;
end $$;
reset role;
rollback;
