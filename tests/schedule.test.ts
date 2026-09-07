import test from "node:test";
import assert from "node:assert/strict";
import {
  academicSettings,
  journeySettings,
  journeySemesters,
  moveSemester,
  weekCapacity,
  distributeWeek,
  dayVisual,
  sessionsOnDay,
  parseCalendarPreset,
  isGreen,
  type TimetableEntry,
} from "../src/lib/schedule";
import {
  demoData,
  daysBetween,
  GOAL_COLORS,
  type Profile,
  type Activity,
} from "../src/lib/timeline";
import {
  validateSemesterSettings,
  localDateTime,
  type FocusSession,
} from "../src/lib/planning";
import {
  parseTable,
  parseJson,
  repeatImport,
  importPayload,
  validateImportRow,
} from "../src/lib/importer";

const profile: Profile = {
  ...demoData("2026-09-07").profile,
  start_year: 2026,
  study_years: 4,
  semester_settings: [],
  wake_minutes: 420,
  sleep_minutes: 1380,
};
const goal = {
  ...demoData("2026-09-07").goals[0],
  id: "g",
  progress: 0,
  starts_on: null,
  timing_mode: "fixed" as const,
  deadline: "2026-12-01",
  color: "#2563eb",
};
const entry: TimetableEntry = {
  id: "t",
  user_id: "u",
  title: "Lớp",
  kind: "class",
  semester_index: 0,
  weekday: 0,
  start_minute: 480,
  end_minute: 600,
  valid_from: "2026-09-07",
  valid_until: "2026-12-31",
  notes: "",
};
function session(
  start: string,
  end: string,
  extra: Partial<FocusSession> = {},
): FocusSession {
  return {
    id: "s",
    user_id: "u",
    goal_id: "g",
    title: "Paper",
    notes: "",
    scheduled_start: new Date(start).toISOString(),
    scheduled_end: new Date(end).toISOString(),
    planned_minutes: (Date.parse(end) - Date.parse(start)) / 60000,
    status: "planned",
    elapsed_seconds: 0,
    running_since: null,
    segments: [],
    timezone: "Asia/Ho_Chi_Minh",
    ...extra,
  } as FocusSession;
}

test("Monday academic estimates cover 4/5/6 years, spring ends in June, start shifts retain duration", () => {
  for (const years of [4, 5, 6]) {
    const p = { ...profile, study_years: years };
    const terms = journeySettings(p);
    assert.equal(terms.length, years * 2);
    validateSemesterSettings({ ...p, semester_settings: terms });
    terms.forEach((s, i) => {
      assert.equal(new Date(s.start + "T12:00").getDay(), 1);
      if (i % 2) assert.equal(s.end.slice(5, 7), "06");
    });
    journeySemesters(p).forEach((s) => assert.equal(s.days.length % 7, 0));
  }
  const term = academicSettings(2026, 4)[0],
    moved = moveSemester(term, "2026-08-12");
  assert.equal(moved.start, "2026-08-10");
  assert.equal(
    daysBetween(moved.start, moved.end),
    daysBetween(term.start, term.end),
  );
  const old = academicSettings(2026, 4);
  old[1].start = "2027-02-03";
  old[0].end = "2027-02-02";
  const normalized = journeySettings({ ...profile, semester_settings: old });
  assert.equal(normalized[0].end, "2027-01-31");
  validateSemesterSettings({ ...profile, semester_settings: normalized });
});
test("capacity unions duplicate classes and overlapping sessions, reserves exam weeks separately", () => {
  const s = session("2026-09-07T09:00", "2026-09-07T11:00");
  const exam = {
    ...goal,
    starts_on: "2026-09-07",
    deadline: "2026-09-13",
    timing_mode: "window" as const,
    reserved_hours: 14,
  };
  const c = weekCapacity(
    "2026-09-07",
    profile,
    [entry, { ...entry, id: "duplicate" }],
    [s],
    [exam],
  );
  assert.equal(c.awake, 112 * 60);
  assert.equal(c.fixed, 120);
  assert.equal(c.occupied, 180);
  assert.equal(c.reserved, 840);
  assert.equal(c.available, 112 * 60 - 180 - 840);
  assert.ok(
    c.slots
      .filter((x) => x.day === "2026-09-07")
      .every((x) => x.end <= 480 || x.start >= 660),
  );
  assert.equal(weekCapacity("2026-09-14", profile, [], [], [exam]).reserved, 0);
});
test("auto allocation respects existing time, exam reserve, current time and active goals", () => {
  const existing = session("2026-09-08T10:00", "2026-09-08T11:00");
  const now = new Date("2026-09-07T10:07");
  const exam = {
    ...goal,
    id: "exam",
    starts_on: "2026-09-07",
    deadline: "2026-09-13",
    timing_mode: "window" as const,
    reserved_hours: 100,
  };
  const done = { ...goal, id: "done", progress: 100 };
  const result = distributeWeek(
    "2026-09-07",
    profile,
    [entry],
    [existing],
    [goal, exam, done],
    { g: 20, done: 50 },
    now,
  );
  const capacity = weekCapacity(
    "2026-09-07",
    profile,
    [entry],
    [existing],
    [goal, exam],
    now,
  );
  assert.ok(result.unallocated > 0);
  assert.ok(result.sessions.length > 0);
  assert.ok(
    result.sessions.reduce((n, s) => n + s.planned_minutes, 0) <=
      capacity.available,
  );
  result.sessions.forEach((s, i) => {
    assert.equal(s.goal_id, "g");
    assert.ok(Date.parse(s.scheduled_start) >= now.getTime());
    assert.ok(s.planned_minutes <= 120);
    assert.ok(
      result.sessions.every(
        (other, j) =>
          i === j ||
          s.scheduled_end <= other.scheduled_start ||
          s.scheduled_start >= other.scheduled_end,
      ),
    );
    assert.ok(
      s.scheduled_end <= existing.scheduled_start ||
        s.scheduled_start >= existing.scheduled_end,
    );
  });
  const next = distributeWeek(
    "2026-09-07",
    profile,
    [],
    [existing],
    [goal],
    { g: 2 },
    new Date("2026-09-06T00:00"),
  );
  assert.equal(
    next.sessions.reduce((n, s) => n + s.planned_minutes, 0),
    60,
  );
});
test("single grid distinguishes intentions, actual hours, fixed corners and uncertain windows", () => {
  const day = "2026-09-07",
    s = session(day + "T09:00", day + "T10:00");
  const future = { ...goal, deadline: day },
    range = {
      ...goal,
      id: "range",
      starts_on: day,
      deadline: "2026-09-10",
      timing_mode: "flexible" as const,
    };
  const before = dayVisual(day, [future, range], [], [s]);
  assert.equal(before.minutes, 0);
  assert.equal(before.planned, true);
  assert.equal(before.fixed.length, 1);
  assert.equal(before.ranges.length, 1);
  assert.equal(before.uncertain, true);
  const a = {
    id: "a",
    goal_id: "g",
    occurred_on: day,
    kind: "event",
    duration_minutes: 60,
    color: goal.color,
  } as Activity;
  const after = dayVisual(
    day,
    [future, range],
    [a],
    [{ ...s, status: "completed" }],
  );
  assert.equal(after.planned, false);
  assert.equal(after.minutes, 60);
  assert.notEqual(after.background, before.background);
  assert.equal(after.corner, before.corner);
  const midnight = session(day + "T23:00", "2026-09-08T00:00");
  assert.equal(sessionsOnDay([midnight], "2026-09-08").length, 0);
});
test("timetable imports remain recurring reservations with dates and no focus minutes", () => {
  const rows = parseTable(
    "Tên môn học,Thứ,Giờ bắt đầu,Giờ kết thúc,Loại\nPaper lab,T2,08:00,10:00,class",
    "timetable",
    "2026-09-07",
  );
  const repeated = repeatImport(rows, 4, [], false);
  assert.equal(repeated.length, 1);
  assert.equal(repeated[0].end_date, "2026-10-04");
  assert.equal(validateImportRow(repeated[0], [], repeated, "2026-09-07"), "");
  const p = importPayload(repeated)[0];
  assert.equal(p.kind, "timetable");
  assert.ok("start_minute" in p);
  assert.equal(p.start_minute, 480);
  assert.equal(p.weekday, 0);
  assert.ok(!("scheduled_start" in p));
  const restored = parseJson(
    JSON.stringify({ timetable_entries: [entry] }),
    "timetable",
    "2026-09-07",
  );
  assert.equal(restored[0].timetable?.semester_index, 0);
  assert.equal(restored[0].end_date, entry.valid_until);
});
test("shared calendar validates dates and strips account data; palette excludes green", () => {
  const data = {
    ...profile,
    id: "private",
    semester_settings: academicSettings(2026, 4),
    goals: [goal],
  };
  const restored = parseCalendarPreset(JSON.stringify(data));
  assert.ok(!("id" in restored));
  assert.ok(!("goals" in restored));
  assert.deepEqual(restored.confirmed_semesters, []);
  assert.throws(() =>
    parseCalendarPreset(
      JSON.stringify({
        ...data,
        semester_settings: [{ index: 0, start: "bad" }],
      }),
    ),
  );
  assert.throws(() => parseCalendarPreset("x".repeat(16001)));
  assert.ok(GOAL_COLORS.every((c) => !isGreen(c)));
  assert.equal(isGreen("#237a4b"), true);
  assert.equal(localDateTime("2026-09-07T09:00:00").slice(0, 10), "2026-09-07");
});

test("Vietnamese type column retains fixed commitments instead of turning them into classes", () => {
  const rows = parseTable(
    "Tên môn học,Thứ,Giờ bắt đầu,Giờ kết thúc,Loại\nThể thao,T4,17:00,18:00,fixed",
    "timetable",
    "2026-09-07",
  );
  assert.equal(rows[0].timetable?.kind, "fixed");
  const data = importPayload(rows)[0];
  assert.ok("schedule_kind" in data);
  assert.equal(data.schedule_kind, "fixed");
});
