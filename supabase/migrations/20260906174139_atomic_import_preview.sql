create table public.import_batches (
  id uuid not null, user_id uuid not null references auth.users(id) on delete cascade,
  fingerprint text not null, row_count integer not null check(row_count between 1 and 500),
  created_at timestamptz not null default now(), primary key(user_id,id), unique(user_id,fingerprint)
);
alter table public.import_batches enable row level security;
revoke all on public.import_batches from anon;
grant select,insert on public.import_batches to authenticated;
create policy import_batches_read on public.import_batches for select to authenticated using((select auth.uid())=user_id);
create policy import_batches_write on public.import_batches for insert to authenticated with check((select auth.uid())=user_id);

create function public.import_tracker(p_batch_id uuid,p_items jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare item jsonb; goal_map jsonb:='{}'; goal_uuid uuid; new_uuid uuid; digest text; existing public.import_batches; inserted integer:=0; mode text;
begin
  if auth.uid() is null then raise exception 'Hãy đăng nhập.'; end if;
  if p_batch_id is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 500 then raise exception 'Mỗi lần nhập cần 1–500 dòng.'; end if;
  if pg_column_size(p_items)>4000000 then raise exception 'Dữ liệu nhập quá lớn.'; end if;
  digest:=md5(p_items::text);
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  select * into existing from public.import_batches where user_id=auth.uid() and (id=p_batch_id or fingerprint=digest) limit 1;
  if found then
    if existing.fingerprint<>digest then raise exception 'Lần nhập này đã được lưu với nội dung khác; hãy phân tích lại nguồn.'; end if;
    return jsonb_build_object('already_imported',true,'count',existing.row_count);
  end if;
  for item in select value from jsonb_array_elements(p_items) loop
    if item->>'kind' is null or item->>'kind' not in ('goal','session','activity','budget') then raise exception 'Loại dữ liệu không hợp lệ.'; end if;
    if item->>'kind'<>'goal' then continue; end if;
    if nullif(item->>'ref','') is not null and goal_map ? (item->>'ref') then raise exception 'Mã mục tiêu nguồn bị trùng.'; end if;
    mode:=coalesce(item->>'tracking_mode','milestone');
    insert into public.goals(user_id,title,description,category,color,tracking_mode,milestone_kind,starts_on,deadline,semester_index,metric_current,metric_target,metric_unit,metric_direction,checklist,progress,completed_on)
    values(auth.uid(),item->>'title',coalesce(item->>'description',''),'Học tập',coalesce(item->>'color','#2563eb'),mode,coalesce(item->>'milestone_kind','general'),nullif(item->>'starts_on','')::date,(item->>'deadline')::date,(item->>'semester_index')::integer,coalesce((item->>'metric_current')::numeric,0),coalesce((item->>'metric_target')::numeric,1),coalesce(item->>'metric_unit',''),coalesce(item->>'metric_direction','increase'),coalesce(item->'checklist','[]'),coalesce((item->>'progress')::integer,0),nullif(item->>'completed_on','')::date)
    returning id into new_uuid;
    if item->>'category' in ('Học tập','Kỹ năng','Dự án','Ngoại ngữ','Trải nghiệm') then update public.goals set category=item->>'category' where id=new_uuid; end if;
    if nullif(item->>'ref','') is not null then goal_map:=goal_map||jsonb_build_object(item->>'ref',new_uuid); end if;
    inserted:=inserted+1;
  end loop;
  for item in select value from jsonb_array_elements(p_items) loop
    if item->>'kind'='goal' then continue; end if;
    goal_uuid:=nullif(item->>'goal_id','')::uuid;
    if goal_uuid is null and nullif(item->>'goal_ref','') is not null then
      goal_uuid:=(goal_map->>(item->>'goal_ref'))::uuid;
      if goal_uuid is null then raise exception 'Không tìm thấy mục tiêu liên kết trong lần nhập.'; end if;
    end if;
    if item->>'kind'='session' then
      if not exists(select 1 from pg_timezone_names where name=item->>'timezone') then raise exception 'Múi giờ phiên không hợp lệ.'; end if;
      insert into public.focus_sessions(user_id,goal_id,title,notes,scheduled_start,scheduled_end,planned_minutes,timezone)
      values(auth.uid(),goal_uuid,item->>'title',coalesce(item->>'notes',''),(item->>'scheduled_start')::timestamptz,(item->>'scheduled_end')::timestamptz,(item->>'planned_minutes')::integer,item->>'timezone');
    elsif item->>'kind'='activity' then
      if (item->>'date')::date>(now() at time zone 'Asia/Ho_Chi_Minh')::date then raise exception 'Nhật ký phải là việc đã làm.'; end if;
      insert into public.activities(user_id,goal_id,title,notes,occurred_on,kind,duration_minutes)
      values(auth.uid(),goal_uuid,item->>'title',coalesce(item->>'notes',''),(item->>'date')::date,'event',coalesce((item->>'minutes')::numeric,0));
    elsif item->>'kind'='budget' then
      insert into public.weekly_budgets(user_id,goal_id,week_start,planned_minutes) values(auth.uid(),goal_uuid,(item->>'date')::date,(item->>'minutes')::integer)
      on conflict(user_id,week_start,goal_id) do update set planned_minutes=excluded.planned_minutes;
    end if;
    inserted:=inserted+1;
  end loop;
  insert into public.import_batches(id,user_id,fingerprint,row_count) values(p_batch_id,auth.uid(),digest,inserted);
  return jsonb_build_object('already_imported',false,'count',inserted);
end $$;
revoke execute on function public.import_tracker(uuid,jsonb) from public,anon;
grant execute on function public.import_tracker(uuid,jsonb) to authenticated;
