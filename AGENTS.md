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
