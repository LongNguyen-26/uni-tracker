-- Resumable student setup. Existing records and owner policies are retained.
alter table public.profiles drop constraint profiles_study_years_check;
alter table public.profiles add constraint profiles_study_years_check check (study_years in (3,4,5,6));
alter table public.profiles
  add column onboarding_term integer,
  add column preparation_skipped text[] not null default '{}',
  add constraint profiles_onboarding_term_check check (onboarding_term is null or onboarding_term between 0 and study_years * 2 - 1),
  add constraint profiles_preparation_skipped_check check (preparation_skipped <@ array['timetable','goals','activities']::text[]);
