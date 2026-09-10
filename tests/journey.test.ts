import test from "node:test";
import assert from "node:assert/strict";
import {
  currentPhase,
  dayEffort,
  goalJourney,
  isAway,
  lastWorkedGoal,
  orderGoals,
  stripHeights,
} from "../src/lib/journey";
import { demoData, type Activity, type Goal } from "../src/lib/timeline";

const TODAY = "2026-09-10"; // A Thursday, so its week starts 2026-09-07.
const { goals, activities } = demoData(TODAY);
const goal = goals[0];
const other = goals[1];
const event = (patch: Partial<Activity>): Activity => ({
  ...activities[0],
  id: "event",
  kind: "event",
  is_milestone: false,
  occurred_on: TODAY,
  duration_minutes: 60,
  created_at: "2026-09-10T00:00:00Z",
  goal_id: goal.id,
  color: goal.color,
  ...patch,
});

test("a journey counts only logged effort on this goal", () => {
  const journey = goalJourney(
    goal,
    [
      event({ id: "a", duration_minutes: 90 }),
      event({ id: "b", occurred_on: "2026-09-09", duration_minutes: 30 }),
      event({ id: "auto", kind: "progress", duration_minutes: 500 }),
      event({ id: "award", is_milestone: true, duration_minutes: 0 }),
      event({ id: "note", duration_minutes: 0 }),
      event({ id: "elsewhere", goal_id: other.id, duration_minutes: 300 }),
      event({ id: "loose", goal_id: null, duration_minutes: 300 }),
    ],
    TODAY,
  );
  assert.equal(journey.minutes, 120);
  assert.equal(journey.sessions, 2);
  assert.equal(journey.activeDays, 2);
  assert.equal(journey.longestMinutes, 90);
  assert.equal(journey.last?.id, "a");
});

test("totals survive a break: active days accumulate and never reset", () => {
  const journey = goalJourney(
    goal,
    [
      event({ id: "old", occurred_on: "2026-06-01", duration_minutes: 120 }),
      event({ id: "older", occurred_on: "2026-06-02", duration_minutes: 60 }),
      event({ id: "recent", occurred_on: "2026-08-20", duration_minutes: 45 }),
    ],
    TODAY,
  );
  assert.equal(journey.activeDays, 3);
  assert.equal(journey.minutes, 225);
  assert.equal(journey.streak, 0, "a pause ends the streak");
  assert.equal(journey.firstDay, "2026-06-01");
  assert.equal(journey.lastDay, "2026-08-20");
  assert.equal(journey.daysSinceFirst, 101);
  assert.equal(journey.daysSinceLast, 21);
  assert.equal(isAway(journey), true);
});

test("a goal worked yesterday is neither away nor streak-broken", () => {
  const journey = goalJourney(
    goal,
    [
      event({ id: "y", occurred_on: "2026-09-09" }),
      event({ id: "x", occurred_on: "2026-09-08" }),
    ],
    TODAY,
  );
  assert.equal(journey.streak, 2);
  assert.equal(journey.daysSinceLast, 1);
  assert.equal(isAway(journey), false);
});

test("a goal with no logged time is never reported as away", () => {
  const journey = goalJourney(goal, [], TODAY);
  assert.equal(journey.minutes, 0);
  assert.equal(journey.daysSinceLast, null);
  assert.equal(isAway(journey), false);
  assert.equal(journey.weeks.length, 12);
  assert.deepEqual(
    stripHeights(journey.weeks).filter((h) => h > 0),
    [],
  );
});

test("the week strip buckets by Monday and ends on the current week", () => {
  const journey = goalJourney(
    goal,
    [
      event({ id: "mon", occurred_on: "2026-09-07", duration_minutes: 60 }),
      event({ id: "thu", occurred_on: "2026-09-10", duration_minutes: 30 }),
      event({ id: "prev", occurred_on: "2026-09-02", duration_minutes: 45 }),
      event({
        id: "ancient",
        occurred_on: "2026-01-01",
        duration_minutes: 600,
      }),
    ],
    TODAY,
  );
  const weeks = journey.weeks;
  assert.equal(weeks[weeks.length - 1].start, "2026-09-07");
  assert.equal(weeks[0].start, "2026-06-22");
  assert.equal(weeks[weeks.length - 1].minutes, 90);
  assert.equal(weeks[weeks.length - 2].minutes, 45);
  assert.equal(journey.weekMinutes, 90);
  assert.equal(journey.minutes, 735, "the strip window never limits the total");
  assert.deepEqual(stripHeights(weeks).slice(-2), [0.5, 1]);
});

const step = (patch: Record<string, unknown>) => ({
  id: String(patch.id || "s"),
  title: "Bước",
  done: false,
  date: null,
  end_date: null,
  timing_mode: "fixed" as const,
  is_final: false,
  counts_for_progress: true,
  ...patch,
});

test("the current phase is the step today falls inside", () => {
  const withSteps = {
    ...goal,
    deadline: null,
    checklist: [
      step({ id: "done", title: "Đọc paper", done: true }),
      step({
        id: "now",
        title: "Cài evaluation",
        date: "2026-09-01",
        end_date: "2026-09-20",
      }),
      step({ id: "later", title: "Viết bản thảo", date: "2026-10-01" }),
    ],
  } as Goal;
  assert.equal(currentPhase(withSteps, TODAY)?.id, "now");
});

test("with nothing dated around today the next step ahead is the phase", () => {
  const withSteps = {
    ...goal,
    deadline: null,
    checklist: [
      step({ id: "late", title: "Đã trễ", date: "2026-08-01" }),
      step({ id: "next", title: "Sắp tới", date: "2026-09-20" }),
    ],
  } as Goal;
  assert.equal(currentPhase(withSteps, TODAY)?.id, "next");
});

test("a goal without steps falls back to its own deadline", () => {
  const plain = { ...goal, deadline: "2026-12-01", checklist: [] } as Goal;
  assert.equal(currentPhase(plain, TODAY)?.is_final, true);
  const none = { ...goal, deadline: null, checklist: [] } as Goal;
  assert.equal(currentPhase(none, TODAY), null);
});

const makeGoal = (patch: Partial<Goal>): Goal => ({
  ...goal,
  checklist: [],
  ...patch,
});

test("recent order puts the goal you last worked first, unworked goals last", () => {
  const a = makeGoal({ id: "a", created_at: "2026-01-01T00:00:00Z" });
  const b = makeGoal({ id: "b", created_at: "2026-02-01T00:00:00Z" });
  const fresh = makeGoal({ id: "fresh", created_at: "2026-03-01T00:00:00Z" });
  const older = makeGoal({ id: "older", created_at: "2026-02-15T00:00:00Z" });
  const logs = [
    event({ id: "1", goal_id: "a", occurred_on: "2026-09-01" }),
    event({ id: "2", goal_id: "b", occurred_on: "2026-09-08" }),
  ];
  assert.deepEqual(
    orderGoals([a, b, fresh, older], logs, "recent").map((g) => g.id),
    ["b", "a", "fresh", "older"],
  );
});

test("deadline order is still available and puts undated goals last", () => {
  const soon = makeGoal({ id: "soon", deadline: "2026-09-30" });
  const later = makeGoal({ id: "later", deadline: "2026-12-31" });
  const undated = makeGoal({ id: "undated", deadline: null });
  assert.deepEqual(
    orderGoals([later, undated, soon], [], "deadline").map((g) => g.id),
    ["soon", "later", "undated"],
  );
});

test("starting now preselects the last worked goal, skipping finished ones", () => {
  const done = makeGoal({ id: "done", progress: 100 });
  const open = makeGoal({ id: "open", progress: 20 });
  const logs = [
    event({ id: "1", goal_id: "done", occurred_on: "2026-09-09" }),
    event({ id: "2", goal_id: "open", occurred_on: "2026-09-02" }),
  ];
  assert.equal(lastWorkedGoal([done, open], logs)?.id, "open");
  assert.equal(lastWorkedGoal([], logs), null);
  assert.equal(lastWorkedGoal([done], logs)?.id, "done");
});

test("today's effort counts logged work only, and ignores other days", () => {
  const logs = [
    event({ id: "1", occurred_on: TODAY, duration_minutes: 45 }),
    event({ id: "2", occurred_on: TODAY, duration_minutes: 20 }),
    // A milestone note carries no minutes, so it is not effort.
    event({ id: "3", occurred_on: TODAY, duration_minutes: 0 }),
    event({ id: "4", occurred_on: "2026-09-09", duration_minutes: 90 }),
  ];
  assert.deepEqual(dayEffort(logs, TODAY), { minutes: 65, sessions: 2 });
  assert.deepEqual(dayEffort(logs, "2026-09-08"), { minutes: 0, sessions: 0 });
  assert.deepEqual(dayEffort([], TODAY), { minutes: 0, sessions: 0 });
});
