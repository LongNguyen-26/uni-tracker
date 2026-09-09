<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project decisions and delivery log

User requested that every push/deployment be recorded here. After each release, record the actual commit and verified Vercel status; never label an unverified deployment successful. Preserve the Next.js rules above. Keep credentials and personal test data out of this file.

Production: https://uni-tracker-sigma.vercel.app · GitHub: https://github.com/LongNguyen-26/uni-tracker · Supabase: `cerynvewyhoazzhksmcc`.

| Commit / push | Changes | Verified production deployment |
| --- | --- | --- |
| `976537a` | First push: Vietnamese university timeline, goals, activity history, Supabase email/password Auth and owner RLS. | READY — `dpl_CoE668yHfHQPz1PHrGBi6cJbjS6q` |
| `2675dec` | Added public environment template for local setup. | READY — `dpl_5xSUwU3UsJ4AeShaBzYFAAKFgVom` |
| `bf6b1a8` | Documented production URL and email configuration. | READY — `dpl_62g7c2TRkcdxwiKNvtsNwqHLFDge` |
| `9ca0ecb` | Goal colors, distinct milestones/exams, weekly/monthly focus statistics, better auth errors and password visibility. User approved temporary signup without email confirmation and custom SMTP. | READY — `dpl_6B9wAuh9J9sTvwetrGnDcbobAoMc` |
| `375c876` | Kept account controls accessible on short screens. | READY — `dpl_4ZWdPjQ2awZWTTis4DJTKW4HKG2a` |
| `803b160` | Flexible 4/5/6-year calendars, date picker/ranges, numeric/checklist goals, avatar, editable activity history, weekly hour budgets, persistent timer with review, atomic reviewed imports (Excel/CSV/Docs/JSON/ICS/PDF/OCR). Added 3 additive Supabase migrations. | READY — `dpl_9zszSXCD2jUe49Z21py4T9vwuxqU`; production alias verified |
| `7794f95` | Unified academic grid; recurring school/fixed timetable; weekly free-slot proposals with exam-hour reserves; journal filters; Monday calendars and shared presets; safe recovery of missing profiles. Added the timetable migration. | READY — `dpl_Ew8cLzXAChgkJoVDP7BBr3zoQEiP`; production alias and authenticated data verified on 2026-09-08 |
| `docs: record deployment 7794f95` (2026-09-08; documentation-only push) | Records the verified release and cleanup below. | No application changes; the AGENTS-only delivery record is configured to skip the build and retain `7794f95`. |
| `c892f48` (2026-09-08; pushed to `codex/guided-import`, then fast-forwarded to `main`) | Guided preparation and AI prompt/template; optional numeric/checklist measures; dependency-aware grouped partial imports; all-day windows, duration-only intentions and goal weekly hours. Goal dates mark the deadline/event window, including short approximate windows. | Preview READY — `dpl_41VHhTv8QdvbMaqi2CjxnKn8rs1G`; Production READY — `dpl_9UQ15RcJnPeSk3AGge1zLn7RBHx8`; production alias verified, HTTP 200. |
| `docs: record deployment c892f48` (2026-09-08; documentation-only push) | Records both verified deployments, validation and QA cleanup. | No application changes; AGENTS-only delivery record retains production `c892f48`. |

### Release 1 — unified milestones and forms — 2026-09-08

- Commit `1456b07ffe8bf0f5e18c089ce8028f28ec40a3b8` pushed to `codex/unified-milestones`, then fast-forwarded to `main`. Preview READY: `dpl_EAMb5RXERznbjTHFHiwm98rC5JhZ`. Production READY: `dpl_A4opt9PvsdvNki2ztSmyeMLuTbXJ`, production alias assigned without errors; HTTP 200 verified.
- Unified dated/undated work and final deadlines in `GoalStep`, preserving legacy checklist progress. Added contextual imports, milestone rows, shared session forms, multiple weekdays, and reviewed additive backup restore with all record types, exact seconds and links.
- Applied migration `20260908142625_unified_goal_milestones_and_restore.sql` under the user's explicit database authorization, after rebuilding a fresh local database and passing all six SQL suites. All 48 unit tests, lint, typecheck and production build passed. Build required network access for the existing Google Font.
- One Preview smoke flow confirmed the current term, opened goal import, and saved six out-of-order goal/milestone rows. Database verification retained the final deadline, a null deadline, and numeric IELTS progress at zero despite a completed intermediate milestone. Browser console had no errors or warnings. Removed the disposable QA account and local credentials after logout.
- Security advisor remains limited to the existing disabled leaked-password protection setting. The documentation-only `docs: record deployment 1456b07` push records this release and retains the verified application deployment.
- The approved next releases are the hourly weekly grid with automatically saved timer sessions, followed by the compact journey filters and estimated-date confirmation reminders. Holidays and drag-and-drop remain outside this plan.

### Release validation `c892f48` — 2026-09-08

- User explicitly authorized production database changes after the initial automatic approval rejection. Applied additive migration `20260908041254_guided_import_and_goal_measures.sql`; existing records were retained.
- 45 unit tests, typecheck, lint and production build passed. Rebuilt a clean local PostgreSQL database from all migrations and passed all five SQL rollback suites (database, focus, planning, schedule, reviewed import). The new reviewed-import rollback suite also passed on Supabase after migration.
- The supplied CSV parsed as 31 source rows plus 4 visible generated goals, with all 35 rows valid. Personal source data was not committed or imported into production.
- Preview smoke test used one disposable account and one mixed import flow. Preparation confirmed only the current term, copy prompt showed success, grouped review imported 6 valid rows and retained 1 invalid row. A single deadline displayed one date; a 3-day event and a 14-day estimated window displayed their own dates; a conference retained 2027-08-18 through 2027-08-22 with no time inputs. The weekly view showed the imported 30-minute unscheduled intention and 25 actual minutes. SQL verified the goal link on the all-day window. No browser console errors or warnings were reported on the app.
- The integrated browser tool could not initialize after resumption; Playwright CLI completed the Preview smoke test. Clipboard read permission was denied to automation, while the app's write operation reported success.
- Vercel confirmed production READY for full commit `c892f48af61e18fd57c0f13bcce4312c9591ba61`, with `uni-tracker-sigma.vercel.app` assigned and no alias error. The production URL returned HTTP 200; the Vercel runtime error scan for the preceding hour was clean. Build duration was approximately 21 seconds. Security advisor findings remained limited to the existing disabled leaked-password protection setting.
- Removed the disposable Supabase QA account and cascaded data, verified zero remaining QA users/goals/sessions, removed local QA credential and temporary browser files, and stopped the local test database.

### Current import and goal decisions

- Public import choices are Mục tiêu, Lịch cố định and Hoạt động; planned/completed is the activity status. Legacy export formats remain readable. Fixed commitments reserve time; links to goals inform their weekly allocation without fabricating completed work.
- New goals can have no measure, a numeric target or a checklist. Weekly hours belong to the goal and can be overridden for an individual week.
- A goal's dates mark its deadline or event window, never an automatic span from today or the start of the semester. A fixed deadline uses one date; a Hackathon can use its three event dates; a vague late-month deadline uses a clearly labelled 7–14-day approximate window. Selecting the semester does not change these dates.

### Known issues

- Resolved in release `b546fb9`: the weekly intention summary now counts planned session duration separately from weekly goal budgets. Imported planned activities no longer depend on having a budget to appear in that summary.

### Current product direction (user update after `803b160`)

- One academic grid combines actual hours, planned sessions, fixed deadline corners and event windows. Goal colors exclude brand green.
- School timetable and fixed commitments reserve time but do not count as focus sessions or productivity. Weekly planning proposes sessions into available time, with preview and confirmation.
- New journeys estimate HK1 in August–January and HK2 in February–June. Semester starts align to Monday; changing a start shifts its end. This supersedes the earlier request to retain a midweek start. Holidays are no longer exposed in settings.
- Do not refetch or reset the page merely when switching browser tabs. Missing profiles should recover safely, preserving goals and logs.
- Log search also filters by goal. Existing goal/activity edits, precise timer seconds, pause/resume and reviewed imports must keep working.
- Calendar presets may be shared as a link containing calendar settings only; applying one requires review. Do not expose account or goal data in preset links.

### Validation recorded for `803b160`

26 unit tests, lint and production build passed. Rollback SQL tests covered owner isolation, foreign goal rejection, progress history, midnight timer splitting, idempotent confirmation, activity edits and atomic import rollback. Browser checks covered immediate signup/login/logout, numeric/checklist edits, a 25-second session and edited log, fullscreen timer, CSV repetition, Excel/Word/PDF extraction, OCR invalid-row blocking, and a 390px viewport. OCR still needs manual review.

### Verified release `7794f95` — 2026-09-08

- Unified academic grid now loads planned sessions immediately, with goal-colored actual time, dashed intentions, fixed deadline corners and tinted event windows. Added the compact journey selector, removed the separate productivity coloring mode, fixed month-label collisions and internal academic-grid scrollbars.
- Added recurring class/fixed-commitment timetable, reviewed timetable import (including Vietnamese type columns), editable recurring entries, awake-hour settings, free-time calculation without double-counting overlaps, and weekly allocation previews. Suggestions avoid past time and existing reservations, retain exam-hour reserves, and reload the correct saved budgets when changing weeks. Event milestones reserve hours without becoming study sessions automatically.
- Estimated semesters begin on Monday (August–January / February–June); changing the start shifts the end. Added one-time term confirmation and validated calendar preset links. Removed holiday controls. Missing profiles recover without deleting goals, logs, sessions or timetable entries.
- Added goal filters to journal search, retained edits after timer confirmation, shifted actual end timestamps when editing starts, and suppressed focus-triggered data reloads. Added the quick-access timer bar and excluded green from goal palettes.
- Applied additive migration `20260907090219_timetable_and_unified_timeline.sql`. The previous application remains compatible with the new columns/table.
- Verification: 33 unit tests, lint and production build passed. The planning and schedule SQL rollback suites passed; owner isolation, repeat-import protection and rollback on timetable/session collisions were checked. Browser checks saved a four-week timetable and a weekly proposal, retained exact seconds after editing a confirmed log, confirmed Monday date shifting, and recovered a deliberately removed test profile with all 2 goals / 4 logs / 8 sessions / 2 timetable entries intact. An exam-window check reduced the next week's available time from 103h to 89h for a 14h reserve.
- Delivery records use a separate `docs: record deployment…` commit after Vercel reports READY. `scripts/ignore-build.mjs` skips builds only when such a commit changes `AGENTS.md` alone, preventing a documentation/deployment loop. Every application change still builds normally.
- Final browser checks: changing to the following week restored its saved 4h Paper / 2h IELTS budgets. At 390px, academic cells measured 9.225 × 9.225px; the semester grid had equal client/scroll width (302px) and height (98px), with no internal overflow. Restored the normal browser viewport afterward.
- GitHub push completed. Vercel reports READY for full commit `7794f952f0ccf7b0447680fa938881cfd29ae9b4`, with `uni-tracker-sigma.vercel.app` assigned and no alias error. A production browser check verified login, persisted timetable entries, 108h available in the test week, exact logged time, and logout; no browser console errors were reported. Shared calendar links opened the review/settings screen before applying changes.
- Removed the disposable QA account and its cascaded test records after verification, and removed its ignored local credential file. Existing user records were preserved.

### Verified release `b546fb9` — 2026-09-09 (release 2 of 3)

- Replaced stacked weekly cards with a shared 06:00–23:00 hour grid. Card positions and heights reflect actual time; overlapping cards use lanes. Shared empty runs of at least two hours fold without changing stored time or budgets. All-day entries and unscheduled activities have separate rows/trays; off-hours entries remain accessible. Headers/time axis stay visible while scrolling and seven columns remain on small screens.
- Weekly budgets now have one editing path in the planning modal and a read-only summary below. Planned session time is reported separately. Completed intentions no longer duplicate actual timer logs or reserve their old slots. Actual timer segments retain pauses and midnight splits; moving edited activities respects their saved timestamps.
- Added short intent/actual content, inline empty-intent editing, an optional eight-second post-save content strip and today's missing-content entry point. Dated cards open editing/moving/deleting actions. Moving a precise activity preserves its seconds.
- Applied additive migration `20260908192456_timer_autosave_and_session_content.sql`. A single authenticated RPC stops and logs in one transaction; retries use the original stop instant, remain idempotent and never create zero-minute logs. Existing review sessions remain usable. Actual-content changes synchronize linked daily logs; journal edits synchronize session content.
- Validation: 51 unit tests, lint, typecheck and production build passed. All seven SQL suites passed on a fresh local database after replaying every migration, including pause/resume, exact stop time, midnight splitting, retry, owner isolation, content synchronization and empty/legacy sessions.
- GitHub commit `b546fb9157661d5b04ca68dede143e682748636d` was pushed to `codex/hourly-week-autosave` and then `main`. Preview READY: `dpl_DBhXnXyNEJ2A6GTnrV5hkG7Ty1Lx`. One Preview flow verified cards at 07:00 and 14:30 had different vertical positions and proportional 60px/90px heights, then stopped a timer: one log, exactly 33 seconds and inherited intent. No browser errors or warnings. Disposable QA account and local credential/browser files removed after logout.
- Production READY: `dpl_BUFcQa8dVgRz9Ee9YK1BXMyESZ62`, matching the full commit above, `uni-tracker-sigma.vercel.app` assigned, no alias error, HTTP 200 verified.
- Remaining approved release 3: compact journey toolbar/multiselect legend, semester-relevant goals, first-three-visits help and estimated milestone date confirmation with reduced-motion-aware contraction.

### Verified release `c2159c7` — 2026-09-09 (release 3 of 3)

- Combined journey title/year range, journey/semester selector, goal multiselect and current-term action into one compact toolbar. Removed the separate zoom label, year filter, duplicate semester strip and external goal-color list. The dropdown carries color dots and checkboxes, with active goals first and completed goals collapsed; completed history stays selected and colored by default.
- Semester relevance includes activities, sessions and all dated steps/windows, including intermediate milestones. The first-visit explanation appears for the first three openings per account/device, then remains available from the help button.
- Estimated unfinished milestones prompt from fourteen days before their window, with an overdue message afterward. Clicking opens the date picker directly. Confirmation switches to a fixed date, derives the final deadline when applicable, and preserves checklist states and numeric results. Visible window cells contract in 280ms; reduced-motion preferences suppress the animation and the app does not navigate away.
- Import review now places milestones immediately below their incoming parent goals, retaining original row identities and partial-import validation. No database migration was needed for this release.
- Validation: 54 unit tests, lint, typecheck and production build passed. All eight SQL rollback suites passed on the local test database, including date confirmation retaining intermediate/final roles, numeric results, completion states and progress history.
- Commit `c2159c75770a42ec87605255bcd48c598ab70fa8` pushed to `codex/compact-journey-dates`, then fast-forwarded to `main`. Preview READY: `dpl_GNRbXX9buHNau8XyWDhJWMgD66WM`. One Preview flow selected Year 3 HK1, excluded the later-term goal, verified the completed goal remained checked and colored, then confirmed an estimated 14-day IELTS window to one date. Browser instrumentation recorded 280ms animations, no remaining estimated cells, a single dated border, the confirmation notice and no remaining reminder. SQL retained score 6, progress 0 and an unfinished milestone. Console had no errors or warnings.
- Production READY: `dpl_3TGVnSLKRxNMvfU5h93Yf5KUK2YQ`, matching the full commit above, with `uni-tracker-sigma.vercel.app` assigned, no alias error and HTTP 200 verified. Logged out, removed the disposable QA account and local QA files, and stopped the local test database.
- All three approved releases are delivered. The documentation-only `docs: record deployment c2159c7` push records this status and retains the verified application deployment. Holidays and drag-and-drop remain outside the agreed scope.

### Verified release `2a855e3` — 2026-09-09 (student setup)

- Commit `2a855e33d5067b321364cb8e55fc31df27708f0c` pushed to `codex/student-onboarding`, then fast-forwarded to `main`. Preview READY: `dpl_2hRFXSBaYq2u2mApn2Gf4Hj6o7Z2`. Production READY: `dpl_7CpTD2BP7toCRy5hr7ZfjZNVRQjM`, matching this commit with the production alias assigned and no alias error. Production HTTP 200 verified.
- New accounts choose an integer 3/4/5/6-year program, current semester and its dates alongside an interactive semester diagram. Setup then remains on a guided three-part screen with separate or combined AI/file imports, manual editors, reviewed planning, a live saved calendar and goal-color chips. Goals retain nested milestones and are visible before any hours are scheduled.
- Applied additive `guided_student_onboarding` migration (local file `20260909052900_guided_student_onboarding.sql`, Supabase version `20260909054058`). It adds remembered semester/skipped sections and permits 3-year programs. Existing data and owner policies were preserved.
- Validation: 58 unit tests, typecheck, lint and production build passed. The new rollback SQL suite passed on Supabase, checking saved state, invalid semester/skipped sections and owner isolation. Security advisor only reports the previously known disabled leaked-password protection.
- Browser checks: Year 3 setup remained in the guide; separate goal import showed colored zero-hour chips; reload resumed setup. Mixed import accepted four valid rows and retained one invalid timetable row, with milestones under goals. Final review showed all three sections and entering the app remained completed after reload. Mobile 390px layout inspected. Authenticated Preview showed saved 3/3 state with no app console errors/warnings. Preview protection was accessed using Vercel's temporary authorized share link; its login-page errors were outside the app. Disposable QA account is retained temporarily for the explicitly requested second release and will be removed after its verification.
- Next authorized update: contextual three-part guidance after exiting setup, reciprocal Weekly/Goals navigation with destination import dialogs, state-based titles and completed-card dismissal. Documentation-only `docs: record deployment 2a855e3` push records this release without rebuilding the application.

### Verified release `fef32b5` — 2026-09-09 (contextual setup guidance)

- Commit `fef32b570e081ab486fa92a0164c3b5d5a5c7e42` pushed to `codex/contextual-setup-guidance`, then fast-forwarded to `main`. Preview READY: `dpl_41pTctGhBPWxq849AYXX5N2sufWU`. Production READY: `dpl_Dhz4Xj2QBtmxxH5YDvtP7Q1hbrpk`, matching this commit with `uni-tracker-sigma.vercel.app` assigned and no alias error. Production HTTP 200 verified. Build took roughly 28 seconds.
- A user who leaves setup unfinished now sees one progress card on both Weekly and Goals. Each page puts its own section first and the other section links across, so importing goals lands on the Goals page where the list and counters actually change. The card title follows the saved state, planning stays disabled until both timetable and goals exist, and the completed card dismisses itself after eight seconds and stays dismissed per account and device. The on-page prompt/template/rules boxes were removed in favour of this card; the import dialog now opens only the groups that need attention.
- No database migration was required. The release is client-side only, so the schema, RLS policies and RPCs are unchanged from `2a855e3`.
- Validation: 59 unit tests, typecheck, lint and production build passed locally on the released commit. `setupGuidance` ordering, state-based titles, `next` section and the planning precondition are covered by unit tests rather than by browser steps.
- Preview browser check (one flow, authenticated by restoring the existing QA session rather than re-entering a password): the app booted, loaded 6 goals with their colored weekly chips and the hour grid, rendered the 3/3 completion card, auto-hid it and persisted the dismissal across a reload. Console reported 0 errors and 0 warnings. Preview protection was opened with Vercel's temporary authorized share link; restoring storage state clears that link's cookie, so the share URL must be reopened afterwards.
- Production browser check: authenticated render showed the weekly grid, goal chips and no horizontal overflow; navigating to Goals produced 6 goal cards with the counter at 6; the completion card also rendered and self-dismissed on the production origin. Console reported 0 errors and 0 warnings.
- Not re-verified on the deployed builds: the 0/3 and 1/3 states of the guidance card and the two cross-page import hand-offs. Resetting the QA account's rows to reach 0/3 was refused by this session's permission classifier, and the Vercel runtime-error scan was refused for the same reason. Those states were exercised on localhost against this exact commit in the previous session (0/3 → 1/3 → 3/3, both navigation directions, 6-goal import, 390px layout) and remain covered by unit tests; production evidence for them is the unit tests plus the localhost run, not a deployed-build check.
- Removed the disposable QA account `8627b79d-e4ac-43cf-8ad2-ce07d681f2ac` and its cascaded rows after verification; zero QA users, goals, sessions, timetable entries or profiles remain and the seven existing accounts were untouched. Deleted the local QA credential file and every saved browser session-state file. Security advisor findings remain limited to the existing disabled leaked-password protection.
- The documentation-only `docs: record deployment fef32b5` push records this release and retains the verified application deployment.
