create or replace function public.capture_activity_goal() returns trigger
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
    if exists(select 1 from public.goals where id=old.goal_id and user_id=old.user_id) then
      -- Explicitly detaching a log moves its time to the unassigned group.
      new.goal_title := '';
    else
      -- A deleted goal keeps its historical label and color in the journal.
      new.goal_title := old.goal_title;
      new.color := old.color;
    end if;
  end if;
  return new;
end;
$$;
