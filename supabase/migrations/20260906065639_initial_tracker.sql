create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  start_year integer not null default 2026 check (start_year between 2000 and 2100),
  start_month integer not null default 9 check (start_month between 1 and 12),
  created_at timestamptz not null default now()
);
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text not null default '' check (char_length(description) <= 4000),
  category text not null default 'Học tập' check (category in ('Học tập','Kỹ năng','Dự án','Ngoại ngữ','Trải nghiệm')),
  deadline date not null,
  progress integer not null default 0 check (progress between 0 and 100),
  completed_on date,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  constraint completion_matches_progress check ((progress = 100 and completed_on is not null) or (progress < 100 and completed_on is null))
);
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  notes text not null default '' check (char_length(notes) <= 4000),
  occurred_on date not null,
  kind text not null default 'event' check (kind in ('event','progress','completion')),
  created_at timestamptz not null default now(),
  foreign key (goal_id, user_id) references public.goals(id, user_id) on delete set null (goal_id)
);
create index goals_owner_deadline_idx on public.goals (user_id, deadline);
create index activities_owner_date_idx on public.activities (user_id, occurred_on desc, id);
create index activities_goal_owner_idx on public.activities (goal_id, user_id);

alter table public.profiles enable row level security;
alter table public.goals enable row level security;
alter table public.activities enable row level security;
revoke all on public.profiles, public.goals, public.activities from anon;
grant select, insert, update, delete on public.profiles, public.goals, public.activities to authenticated;

create policy profiles_owner_select on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy profiles_owner_insert on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy profiles_owner_update on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy profiles_owner_delete on public.profiles for delete to authenticated using ((select auth.uid()) = id);
create policy goals_owner_select on public.goals for select to authenticated using ((select auth.uid()) = user_id);
create policy goals_owner_insert on public.goals for insert to authenticated with check ((select auth.uid()) = user_id);
create policy goals_owner_update on public.goals for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy goals_owner_delete on public.goals for delete to authenticated using ((select auth.uid()) = user_id);
create policy activities_owner_select on public.activities for select to authenticated using ((select auth.uid()) = user_id);
create policy activities_owner_insert on public.activities for insert to authenticated with check ((select auth.uid()) = user_id);
create policy activities_owner_update on public.activities for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy activities_owner_delete on public.activities for delete to authenticated using ((select auth.uid()) = user_id);

-- Runs with the caller's RLS permissions. Goal and history are saved atomically.
create function public.record_goal_progress() returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  if TG_OP = 'UPDATE' then
    if new.progress = old.progress and new.completed_on is not distinct from old.completed_on then return new; end if;
  elsif new.progress = 0 then
    return new;
  end if;
  insert into public.activities (user_id, goal_id, title, notes, occurred_on, kind)
  values (
    new.user_id, new.id, new.title,
    case when new.progress = 100 then 'Đã hoàn thành mục tiêu.' else 'Tiến độ: ' || new.progress || '%' end,
    coalesce(new.completed_on, (now() at time zone 'Asia/Ho_Chi_Minh')::date),
    case when new.progress = 100 then 'completion' else 'progress' end
  );
  return new;
end;
$$;
revoke execute on function public.record_goal_progress() from public, anon;
grant execute on function public.record_goal_progress() to authenticated;
create trigger goal_progress_history after insert or update on public.goals
for each row execute function public.record_goal_progress();
