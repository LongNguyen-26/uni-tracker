import test from "node:test";
import assert from "node:assert/strict";
import {
  dayBackground,
  formatMinutes,
  isWork,
  periodBounds,
  productivity,
  shiftPeriod,
  splitColor,
  summarizeDays,
} from "../src/lib/focus";
import { demoData, type Activity } from "../src/lib/timeline";
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
  const deadline = goals[0].deadline;
  const pair = [goals[0], { ...goals[5], deadline }];
  const days = summarizeDays(pair, [event({ occurred_on: deadline })]);
  const day = days.get(deadline)!;
  assert.equal(day.colors.length, 2);
  assert.equal(day.marker, "G");
  assert.match(dayBackground(day, "goals"), /linear-gradient\(135deg/);
  assert.ok(day.label.includes(pair[0].title));
  assert.ok(day.label.includes(pair[1].title));
});
test("collision summaries retain every item while drawing at most four segments", () => {
  const sameDay = goals
    .slice(0, 6)
    .map((g) => ({ ...g, deadline: "2026-09-06" }));
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
