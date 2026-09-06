alter table public.goals
  add column color text not null default '#237a4b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  add column tracking_mode text not null default 'progress' check (tracking_mode in ('progress','milestone')),
  add column milestone_kind text not null default 'general' check (milestone_kind in ('general','midterm','final','achievement')),
  add constraint milestone_has_binary_progress check (tracking_mode <> 'milestone' or progress in (0,100));
alter table public.activities
  add column duration_minutes integer not null default 0 check (duration_minutes between 0 and 1440),
  add column color text not null default '#237a4b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  add column is_milestone boolean not null default false,
  add column milestone_kind text not null default 'general' check (milestone_kind in ('general','midterm','final','achievement')),
  add column goal_title text not null default '' check (char_length(goal_title) <= 160);
update public.goals set color = case category when 'Học tập' then '#2563eb' when 'Kỹ năng' then '#0d9488' when 'Dự án' then '#7c3aed' when 'Ngoại ngữ' then '#ea580c' else '#db2777' end;
update public.activities a set color=g.color, goal_title=g.title from public.goals g where a.goal_id=g.id and a.user_id=g.user_id;
update public.activities set is_milestone=true where kind='completion';

create function public.capture_activity_goal() returns trigger
language plpgsql security invoker set search_path = ''
as $$
declare related public.goals;
begin
  if new.goal_id is not null then
    select * into related from public.goals where id=new.goal_id and user_id=new.user_id;
    if not found then raise exception 'Related goal is unavailable' using errcode='23503'; end if;
    new.goal_title := related.title;
    new.color := related.color;
    if new.kind='completion' then
      new.is_milestone := true;
      new.milestone_kind := related.milestone_kind;
    end if;
  elsif TG_OP='UPDATE' and old.goal_id is not null then
    -- Preserve the label/color when a linked goal is deleted.
    if new.goal_title='' then new.goal_title := old.goal_title; end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.capture_activity_goal() from public, anon;
grant execute on function public.capture_activity_goal() to authenticated;
create trigger capture_activity_goal_before_write before insert or update on public.activities
for each row execute function public.capture_activity_goal();

create or replace function public.record_goal_progress() returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  if TG_OP = 'UPDATE' then
    if new.progress=old.progress and new.completed_on is not distinct from old.completed_on then return new; end if;
  elsif new.progress=0 then return new;
  end if;
  insert into public.activities(user_id,goal_id,title,notes,occurred_on,kind,color,is_milestone,milestone_kind,goal_title)
  values(new.user_id,new.id,new.title,
    case when new.progress=100 then 'Đã hoàn thành mục tiêu.' else 'Tiến độ: '||new.progress||'%' end,
    coalesce(new.completed_on,(now() at time zone 'Asia/Ho_Chi_Minh')::date),
    case when new.progress=100 then 'completion' else 'progress' end,
    new.color,new.progress=100,new.milestone_kind,new.title);
  return new;
end;
$$;
