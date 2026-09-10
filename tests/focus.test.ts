import test from "node:test";
import assert from "node:assert/strict";
import {
  compactMinutes,
  dayBackground,
  formatMinutes,
  isWork,
  periodBounds,
  productivity,
  semesterRhythm,
  shiftPeriod,
  splitColor,
  summarizeDays,
} from "../src/lib/focus";
import { demoData, GOAL_COLORS, type Activity } from "../src/lib/timeline";
const { goals, activities } = demoData("2026-09-06");
const event = (patch: Partial<Activity>): Activity => ({
  ...activities[0],
  id: "event",
  occurred_on: "2026-09-06",
  duration_minutes: 60,
  goal_id: goals[0].id,
  color: goals[0].color,
  ...patch,
});
test("time and persistence exclude automated progress and untimed achievements", () => {
  const logs = [
    event({}),
    event({ id: "auto", kind: "progress", duration_minutes: 400 }),
    event({ id: "award", is_milestone: true, duration_minutes: 0 }),
    event({ id: "note", duration_minutes: 0 }),
    event({ id: "future", occurred_on: "2026-09-07" }),
  ];
  const result = productivity(
    logs,
    goals,
    "2026-09-01",
    "2026-09-30",
    "2026-09-06",
  );
  assert.equal(result.minutes, 60);
  assert.equal(result.activeDays, 1);
  assert.equal(result.elapsedDays, 6);
  assert.equal(result.untimed, 1);
  assert.equal(result.allocation[0].minutes, 60);
  assert.equal(
    isWork(event({ is_milestone: true, duration_minutes: 90 })),
    true,
  );
});
test("periods use calendar weeks/months including leap years and year boundary", () => {
  assert.deepEqual(periodBounds("2026-01-01", "week"), {
    start: "2025-12-29",
    end: "2026-01-04",
  });
  assert.deepEqual(periodBounds("2024-02-15", "month"), {
    start: "2024-02-01",
    end: "2024-02-29",
  });
  assert.equal(shiftPeriod("2026-01-31", "month", 1), "2026-02-01");
  assert.equal(shiftPeriod("2026-09-06", "week", -1), "2026-08-30");
  assert.equal(
    productivity([], [], "2026-10-01", "2026-10-31", "2026-09-06").elapsedDays,
    0,
  );
});
test("two deadlines split diagonally; logging same goal does not add another segment", () => {
  const deadline = goals[0].deadline!;
  const midterm = goals.find((g) => g.milestone_kind === "midterm")!;
  const pair = [goals[0], { ...midterm, deadline }];
  const days = summarizeDays(pair, [event({ occurred_on: deadline })]);
  const day = days.get(deadline)!;
  assert.equal(day.colors.length, 2);
  assert.equal(day.marker, "G");
  assert.match(dayBackground(day, "goals"), /linear-gradient\(135deg/);
  assert.ok(day.label.includes(pair[0].title));
  assert.ok(day.label.includes(pair[1].title));
});
test("collision summaries retain every item while drawing at most four segments", () => {
  // Six goals landing on one day, however many the demo happens to carry.
  const sameDay = Array.from({ length: 6 }, (_, i) => ({
    ...goals[i % goals.length],
    id: `clash-${i}`,
    color: GOAL_COLORS[i],
    deadline: "2026-09-06",
  }));
  const day = summarizeDays(sameDay, []).get("2026-09-06")!;
  assert.equal(day.colors.length, 6);
  assert.equal(day.deadlines.length, 6);
  assert.match(splitColor(day.colors), /conic-gradient/);
  assert.equal((splitColor(day.colors).match(/%/g) || []).length, 8);
});
test("completed milestones use a star without inflating focus, history retains deleted goal", () => {
  const award = event({
    kind: "completion",
    is_milestone: true,
    duration_minutes: 0,
    goal_id: null,
    goal_title: "Archived IELTS",
  });
  const day = summarizeDays([], [award]).get("2026-09-06")!;
  assert.equal(day.marker, "★");
  assert.equal(dayBackground(day, "focus"), "#edf0eb");
  const report = productivity(
    [event({ goal_id: null, goal_title: "Archived IELTS" })],
    [],
    "2026-09-01",
    "2026-09-30",
    "2026-09-06",
  );
  assert.equal(report.allocation[0].title, "Archived IELTS");
  assert.equal(formatMinutes(125), "2 giờ 5 phút");
});
test("weekly rhythm shares the semester heatmap columns and keeps one stack order", () => {
  // Two full columns plus a short trailing one, with a leading blank pad cell.
  const days = [
    null,
    "2026-08-04",
    "2026-08-05",
    "2026-08-06",
    "2026-08-07",
    "2026-08-08",
    "2026-08-09",
    "2026-08-10",
    "2026-08-11",
    "2026-08-12",
    "2026-08-13",
    "2026-08-14",
    "2026-08-15",
    "2026-08-16",
    "2026-08-17",
    "2026-08-18",
  ];
  const rhythm = semesterRhythm(
    [
      event({ id: "a", occurred_on: "2026-08-05", duration_minutes: 30 }),
      event({
        id: "b",
        occurred_on: "2026-08-06",
        duration_minutes: 120,
        goal_id: goals[1].id,
        color: goals[1].color,
      }),
      event({ id: "c", occurred_on: "2026-08-12", duration_minutes: 45 }),
      event({ id: "d", occurred_on: "2026-08-17", duration_minutes: 15 }),
      event({ id: "skip", occurred_on: "2026-08-19", duration_minutes: 600 }),
      event({ id: "untimed", occurred_on: "2026-08-05", duration_minutes: 0 }),
      event({
        id: "auto",
        occurred_on: "2026-08-05",
        kind: "progress",
        duration_minutes: 90,
      }),
    ],
    goals,
    days,
    "2026-08-20",
  );
  // Columns are cut every 7 cells, exactly as the heatmap fills them, so the
  // leading blank shares the first column instead of shifting the whole axis.
  assert.deepEqual(
    rhythm.weeks.map((w) => [w.start, w.end, w.minutes]),
    [
      ["2026-08-04", "2026-08-09", 150],
      ["2026-08-10", "2026-08-16", 45],
      ["2026-08-17", "2026-08-18", 15],
    ],
  );
  // A day past the last column is out of the semester and never counted.
  assert.equal(rhythm.minutes, 210);
  assert.equal(rhythm.peak, 150);
  // The larger goal leads the allocation, and every stack repeats that order.
  assert.deepEqual(
    rhythm.allocation.map((item) => item.minutes),
    [120, 90],
  );
  assert.deepEqual(
    rhythm.weeks[0].segments.map((s) => s.id),
    [goals[1].id, goals[0].id],
  );
  assert.deepEqual(
    rhythm.weeks[2].segments.map((s) => [s.id, s.minutes]),
    [[goals[0].id, 15]],
  );
});
test("weekly rhythm marks columns after today as future", () => {
  const rhythm = semesterRhythm(
    [],
    goals,
    Array.from(
      { length: 14 },
      (_, i) => `2026-08-${String(4 + i).padStart(2, "0")}`,
    ),
    "2026-08-05",
  );
  assert.deepEqual(
    rhythm.weeks.map((w) => w.future),
    [false, true],
  );
  assert.equal(rhythm.peak, 60);
});

test("compact durations fit a figure slot", () => {
  assert.equal(compactMinutes(0), "0p");
  assert.equal(compactMinutes(45), "45p");
  assert.equal(compactMinutes(60), "1g");
  assert.equal(compactMinutes(3165), "52g 45p");
  assert.equal(compactMinutes(-10), "0p");
});
