import test from "node:test";
import assert from "node:assert/strict";
import {
  demoData,
  type Goal,
  type GoalStep,
  type Semester,
} from "../src/lib/timeline";
import {
  goalsInSemester,
  confirmMilestoneDate,
  showJourneyIntro,
} from "../src/lib/journey-view";
import { milestoneReminder } from "../src/lib/milestones";
import { calculatedProgress, type FocusSession } from "../src/lib/planning";
import {
  goalReviewRows,
  prepareImportRows,
  parseTable,
} from "../src/lib/importer";

test("semester goal filter uses work, sessions and intermediate date windows, retaining completed history", () => {
  const demo = demoData("2026-09-08"),
    base = { ...demo.goals[0], deadline: null, starts_on: null, checklist: [] };
  const goals: Goal[] = [
    { ...base, id: "work", progress: 100 },
    { ...base, id: "session" },
    {
      ...base,
      id: "step",
      checklist: [
        {
          id: "a",
          title: "Window",
          done: false,
          date: "2026-08-20",
          end_date: "2026-09-03",
        },
      ],
    },
    { ...base, id: "outside", deadline: "2027-11-01" },
    { ...base, id: "end-at-boundary" },
  ];
  const semester = { start: "2026-09-01", end: "2026-12-31" } as Semester;
  const activities = [
    { ...demo.activities[0], goal_id: "work", occurred_on: "2026-09-04" },
  ];
  const sessions = [
    {
      goal_id: "session",
      scheduled_start: "2026-08-31T23:30:00",
      scheduled_end: "2026-09-01T00:30:00",
    },
    {
      goal_id: "end-at-boundary",
      scheduled_start: "2026-08-31T23:00:00",
      scheduled_end: "2026-09-01T00:00:00",
    },
  ] as FocusSession[];
  assert.deepEqual(
    goalsInSemester(goals, activities, sessions, semester).map((g) => g.id),
    ["work", "session", "step"],
  );
  assert.equal(goalsInSemester(goals, activities, sessions).length, 5);
});
test("estimated date reminders begin 14 days before, persist after the range, and stop after confirmation", () => {
  const step: GoalStep = {
    id: "exam",
    title: "IELTS",
    done: false,
    date: "2026-11-20",
    end_date: "2026-11-30",
    timing_mode: "flexible",
    is_final: true,
    counts_for_progress: false,
  };
  assert.equal(milestoneReminder(step, "2026-11-05"), null);
  assert.equal(milestoneReminder(step, "2026-11-06"), "upcoming");
  assert.equal(milestoneReminder(step, "2026-11-30"), "upcoming");
  assert.equal(milestoneReminder(step, "2026-12-01"), "overdue");
  assert.equal(milestoneReminder({ ...step, done: true }, "2026-11-20"), null);
  const base = demoData("2026-09-08").goals.find(
    (g) => g.metric_unit === "band",
  )!;
  const goal = {
    ...base,
    tracking_mode: "numeric" as const,
    metric_current: 6,
    metric_target: 7,
    deadline: step.end_date!,
    checklist: [
      step,
      { id: "abstract", title: "Abstract", done: true, date: "2026-10-31" },
    ],
  };
  const update = confirmMilestoneDate(goal, "exam", "2026-11-25");
  assert.equal(update.deadline, "2026-11-25");
  assert.equal(update.starts_on, null);
  assert.equal(update.checklist[0].done, false);
  assert.equal(update.checklist[1].done, true);
  assert.equal(milestoneReminder(update.checklist[0], "2026-11-20"), null);
  assert.equal(calculatedProgress({ ...goal, ...update }), 0);
  assert.equal(
    confirmMilestoneDate(goal, "abstract", "2026-10-30").deadline,
    "2026-11-30",
  );
  assert.throws(() => confirmMilestoneDate(goal, "gone", "2026-11-25"));
  assert.deepEqual([0, 1, 2, 3].map(showJourneyIntro), [
    true,
    true,
    true,
    false,
  ]);
});
test("review nests out-of-order milestones immediately under their incoming goals", () => {
  const rows = prepareImportRows(
    parseTable(
      "kind,title,goal_id\nmilestone,A one,A\nmilestone,B one,B\ngoal,A,\ngoal,B,\nmilestone,A two,A",
      "goal",
      "2026-09-08",
    ),
    [],
    "2026-09-08",
  );
  assert.deepEqual(
    goalReviewRows(rows, []).map((r) => r.title),
    ["A", "A one", "A two", "B", "B one"],
  );
});
