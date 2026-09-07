begin;
select set_config('test.user',gen_random_uuid()::text,true);
select set_config('test.other',gen_random_uuid()::text,true);
select set_config('test.goal',gen_random_uuid()::text,true);
select set_config('test.batch',gen_random_uuid()::text,true);
insert into auth.users(id,email) values(current_setting('test.user')::uuid,'schedule-'||current_setting('test.user')||'@example.invalid'),(current_setting('test.other')::uuid,'schedule-'||current_setting('test.other')||'@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.user'),true);
insert into public.goals(id,user_id,title,deadline) values(current_setting('test.goal')::uuid,current_setting('test.user')::uuid,'Paper','2026-12-01');
select public.import_tracker(current_setting('test.batch')::uuid,'[{"kind":"timetable","title":"Algorithms","schedule_kind":"class","semester_index":0,"weekday":0,"start_minute":480,"end_minute":600,"valid_from":"2026-09-07","valid_until":"2026-12-31"}]');
select public.import_tracker(current_setting('test.batch')::uuid,'[{"kind":"timetable","title":"Algorithms","schedule_kind":"class","semester_index":0,"weekday":0,"start_minute":480,"end_minute":600,"valid_from":"2026-09-07","valid_until":"2026-12-31"}]');
do $$ begin
 if (select count(*) from public.timetable_entries)<>1 or exists(select 1 from public.focus_sessions) then raise exception 'Timetable duplication or incorrectly created focus session'; end if;
 begin
  perform public.import_tracker(gen_random_uuid(),jsonb_build_array(jsonb_build_object('kind','budget','goal_id',current_setting('test.goal'),'date','2026-09-07','minutes',600),jsonb_build_object('kind','session','title','Conflicting study','scheduled_start','2026-09-07T09:00:00+07','scheduled_end','2026-09-07T10:00:00+07','planned_minutes',60,'timezone','Asia/Ho_Chi_Minh','prevent_overlap',true)));
  raise exception 'Overlapping timetable accepted';
 exception when raise_exception then if sqlerrm not like 'Lịch vừa thay đổi%' then raise; end if; end;
 if exists(select 1 from public.weekly_budgets) then raise exception 'Partial planner budget saved despite conflict'; end if;
end $$;
select public.import_tracker(gen_random_uuid(),'[{"kind":"session","title":"Free time","scheduled_start":"2026-09-07T10:00:00+07","scheduled_end":"2026-09-07T11:00:00+07","planned_minutes":60,"timezone":"Asia/Ho_Chi_Minh","prevent_overlap":true}]');
do $$ begin
 begin
  perform public.import_tracker(gen_random_uuid(),'[{"kind":"session","title":"Overlapping session","scheduled_start":"2026-09-07T10:30:00+07","scheduled_end":"2026-09-07T11:30:00+07","planned_minutes":60,"timezone":"Asia/Ho_Chi_Minh","prevent_overlap":true}]');
  raise exception 'Overlapping session accepted';
 exception when raise_exception then if sqlerrm not like 'Lịch vừa thay đổi%' then raise; end if; end;
 if (select count(*) from public.focus_sessions)<>1 then raise exception 'Session conflict persisted'; end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
do $$ begin
 if exists(select 1 from public.timetable_entries) then raise exception 'Other user can see timetable'; end if;
 begin
  insert into public.timetable_entries(user_id,title,kind,semester_index,weekday,start_minute,end_minute,valid_from,valid_until) values(current_setting('test.user')::uuid,'Wrong owner','class',0,0,480,600,'2026-09-07','2026-12-31');
  raise exception 'Wrong timetable owner accepted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
