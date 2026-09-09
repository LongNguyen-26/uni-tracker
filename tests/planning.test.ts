import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSemesters,
  demoData,
  type SemesterSettings,
} from "../src/lib/timeline";
import {
  calculatedProgress,
  clockText,
  goalProgressText,
  repeatedSessions,
  sessionElapsed,
  validateSemesterSettings,
  type FocusSession,
  type SessionInput,
} from "../src/lib/planning";
import {
  importPayload,
  parseCalendar,
  parseJson,
  parseTable,
  repeatImport,
  validateImportRow,
} from "../src/lib/importer";
import { formatMinutes } from "../src/lib/focus";
import fs from "node:fs";

test("4/5/6 years preserve actual semester dates inside complete Monday–Sunday weeks", () => {
  for (const n of [4, 5, 6]) {
    const s = buildSemesters(2026, 9, n);
    assert.equal(s.length, n * 2);
    s.forEach((x) => {
      assert.equal(new Date(`${x.displayStart}T12:00:00`).getDay(), 1);
      assert.equal(new Date(`${x.displayEnd}T12:00:00`).getDay(), 0);
      assert.equal(x.days.length % 7, 0);
    });
  }
  const s = buildSemesters(2026, 9, 4, [
    {
      index: 0,
      start: "2026-09-09",
      end: "2027-01-22",
      label: "HK mùa thu",
      breaks: [],
    },
  ])[0];
  assert.equal(s.start, "2026-09-09");
  assert.equal(s.displayStart, "2026-09-07");
  assert.equal(s.displayEnd, "2027-01-24");
});
test("settings reject overlapping terms and holidays outside term", () => {
  const settings: SemesterSettings[] = buildSemesters(2026, 9).map(
    ({ index, start, end, label, breaks }) => ({
      index,
      start,
      end,
      label,
      breaks,
    }),
  );
  validateSemesterSettings({ study_years: 4, semester_settings: settings });
  assert.throws(() =>
    validateSemesterSettings({ study_years: 5, semester_settings: settings }),
  );
  settings[1].start = settings[0].end;
  assert.throws(() =>
    validateSemesterSettings({ study_years: 4, semester_settings: settings }),
  );
});
test("numeric goals show meaningful units and project progress is derived from steps", () => {
  const g = demoData("2026-09-06").goals[1];
  assert.equal(goalProgressText(g), "6.5 → 7 band");
  assert.equal(calculatedProgress(g), 0);
  assert.equal(calculatedProgress({ ...g, metric_current: 7 }), 100);
  assert.equal(
    calculatedProgress({
      ...g,
      metric_direction: "decrease",
      metric_current: 6,
    }),
    100,
  );
  const project = demoData("2026-09-06").goals[2];
  assert.equal(calculatedProgress(project), 50);
  assert.equal(goalProgressText(project), "2/4 cột mốc");
});
test("timer is based on elapsed wall time, excludes paused time and runs past the plan", () => {
  const s = {
    status: "running",
    planned_minutes: 60,
    elapsed_seconds: 600,
    running_since: "2026-09-07T01:00:00Z",
  } as FocusSession;
  assert.equal(sessionElapsed(s, Date.parse("2026-09-07T01:10:00Z")), 1200);
  assert.equal(
    sessionElapsed(
      { ...s, status: "paused" },
      Date.parse("2026-09-07T04:00:00Z"),
    ),
    600,
  );
  // Three hours on a one-hour plan is three hours; the plan does not clamp it.
  assert.equal(sessionElapsed(s, Date.parse("2026-09-07T04:00:00Z")), 11400);
  assert.equal(clockText(3600), "01:00:00");
  assert.equal(formatMinutes(1 / 6), "10 giây");
});
test("weekly repeats skip configured holidays and reject invalid intervals", () => {
  const s: SessionInput = {
    title: "Paper",
    notes: "",
    goal_id: null,
    scheduled_start: "2026-09-07T09:00:00+07:00",
    scheduled_end: "2026-09-07T10:00:00+07:00",
    planned_minutes: 60,
    timezone: "Asia/Ho_Chi_Minh",
  };
  const settings = [
    {
      index: 0,
      start: "2026-09-01",
      end: "2027-01-01",
      label: "HK1",
      breaks: [{ label: "Nghỉ", start: "2026-09-14", end: "2026-09-14" }],
    },
  ];
  assert.equal(repeatedSessions(s, 3, settings, true).length, 2);
  assert.throws(() =>
    repeatedSessions({ ...s, scheduled_end: s.scheduled_start }, 2),
  );
  assert.throws(() => repeatedSessions(s, 53));
});
test("Vietnamese CSV/Docs tables support weekdays, quoted cells and editable invalid dates", () => {
  const rows = parseTable(
    'Tên hoạt động,Thứ,Giờ bắt đầu,Giờ kết thúc\n"Paper, đọc tài liệu",T2,9:00,10:00',
    "session",
    "2026-09-07",
  );
  assert.equal(rows[0].date, "2026-09-07");
  assert.equal(rows[0].title, "Paper, đọc tài liệu");
  assert.equal(rows[0].start_time, "09:00");
  assert.equal(validateImportRow(rows[0], [], rows, "2026-09-07"), "");
  rows[0].date = "2026-02-31";
  assert.match(validateImportRow(rows[0], [], rows, "2026-09-07"), /ngày/i);
  assert.throws(() =>
    parseTable("arbitrary instructions", "session", "2026-09-07"),
  );
});
test("JSON templates retain numeric/checklist data and linked goals; import preview has no writes", () => {
  const rows = parseJson(
    fs.readFileSync("public/templates/goals.json", "utf8"),
    "session",
    "2026-09-07",
  );
  assert.equal(rows.length, 4);
  rows.forEach((r) =>
    assert.equal(validateImportRow(r, [], rows, "2026-09-07"), ""),
  );
  const payload = importPayload(rows);
  assert.equal(payload[0].kind, "goal");
  assert.equal(payload[2].goal_ref, "ielts");
  assert.ok(!("user_id" in payload[0]));
  rows[0].selected = false;
  assert.match(validateImportRow(rows[2], [], rows, "2026-09-07"), /gốc/);
  assert.equal(repeatImport(rows, 3, [], false).length, 8);
});
test("ICS expands weekly recurrence, respects EXDATE and exclusive all-day end", async () => {
  const text =
    "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:abc\r\nDTSTART:20260907T020000Z\r\nDTEND:20260907T030000Z\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\nEXDATE:20260914T020000Z\r\nSUMMARY:Paper\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:def\r\nDTSTART;VALUE=DATE:20260908\r\nDTEND;VALUE=DATE:20260910\r\nSUMMARY:Thi CK\r\nEND:VEVENT\r\nEND:VCALENDAR";
  const rows = await parseCalendar(text, "2026-09-07", 4);
  assert.equal(rows.length, 3);
  assert.equal(rows[2].end_date, "2026-09-09");
  assert.equal(rows[2].kind, "timetable");
  assert.equal(rows[2].all_day, true);
});

test("JSON activity import retains actual timestamps and milestone colors", () => {
  const activity = {
    title: "Nộp paper",
    occurred_on: "2026-09-07",
    duration_minutes: 1.5,
    kind: "event",
    color: "#a855f7",
    is_milestone: true,
    milestone_kind: "achievement",
    started_at: "2026-09-07T02:00:00Z",
    ended_at: "2026-09-07T02:01:30Z",
  };
  const rows = parseJson(
    JSON.stringify({ activities: [activity] }),
    "activity",
    "2026-09-07",
  );
  const payload = importPayload(rows)[0];
  assert.ok("minutes" in payload);
  assert.equal(payload.color, activity.color);
  assert.equal(payload.started_at, activity.started_at);
  assert.equal(payload.ended_at, activity.ended_at);
  assert.equal(payload.minutes, 1.5);
  assert.equal(payload.is_milestone, true);
  rows[0].date = "2026-09-06";
  const moved = importPayload(rows)[0];
  assert.ok("minutes" in moved);
  assert.equal(moved.started_at, null);
});

test("calendar rejects undefined time zones and omits cancelled events", async () => {
  const wrap = (event: string) =>
    `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:zone-test\r\n${event}\r\nEND:VEVENT\r\nEND:VCALENDAR`;
  await assert.rejects(
    () =>
      parseCalendar(
        wrap(
          "DTSTART;TZID=Missing/Zone:20260907T090000\r\nDTEND;TZID=Missing/Zone:20260907T100000",
        ),
        "2026-09-07",
        1,
      ),
    /VTIMEZONE/,
  );
  const rows = await parseCalendar(
    wrap(
      "DTSTART:20260907T020000Z\r\nDTEND:20260907T030000Z\r\nSTATUS:CANCELLED",
    ),
    "2026-09-07",
    1,
  );
  assert.equal(rows.length, 0);
});
