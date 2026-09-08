import test from "node:test";
import assert from "node:assert/strict";
import { demoData } from "../src/lib/timeline";
import { goalSteps, finalDates, milestonesOnDay } from "../src/lib/milestones";
import { calculatedProgress } from "../src/lib/planning";
import {
  parseTable,
  prepareImportRows,
  validImportRows,
  goalPayload,
} from "../src/lib/importer";
import { backupRows, pauseBackupSession } from "../src/lib/backup";
import type { FocusSession } from "../src/lib/planning";

test("legacy final deadline does not change checklist progress; intermediate and final coexist", () => {
  const g = demoData("2026-09-08").goals[2];
  const steps = goalSteps(g);
  assert.equal(calculatedProgress({ ...g, checklist: steps }), g.progress);
  const extra = {
    id: "abstract",
    title: "Abstract",
    done: false,
    date: "2026-10-31",
  };
  assert.equal(finalDates([...steps, extra]).deadline, g.deadline);
  assert.equal(
    milestonesOnDay(
      [{ ...g, checklist: [...steps, extra] }],
      "2026-10-31",
    ).some((m) => m.step.id === "abstract"),
    true,
  );
  const numeric = demoData("2026-09-08").goals[1];
  assert.equal(
    calculatedProgress({ ...numeric, checklist: [{ ...extra, done: true }] }),
    0,
  );
});
test("dateless goal and work are valid without synthesizing today's deadline", () => {
  const rows = prepareImportRows(
    parseTable(
      "kind,title,date,goal_id\nmilestone,Write,,Paper\ngoal,Paper,,",
      "goal",
      "2026-09-08",
    ),
    [],
    "2026-09-08",
  );
  assert.equal(validImportRows(rows, [], "2026-09-08").length, 2);
  assert.equal(goalPayload(rows[0]).deadline, null);
  assert.equal(rows[1].goal_ref, rows[0].ref);
});
test("backup keeps history and exact time; a running clock freezes at export", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const s = {
    id,
    status: "running",
    running_since: "2026-09-08T01:00:00Z",
    elapsed_seconds: 17,
    planned_minutes: 60,
    segments: [{ start: "2026-09-08T00:00:00Z", end: "2026-09-08T00:00:17Z" }],
  } as FocusSession;
  const paused = pauseBackupSession(s, "2026-09-08T01:00:23Z");
  assert.equal(paused.elapsed_seconds, 40);
  assert.equal(paused.status, "paused");
  assert.equal(paused.running_since, null);
  const rows = backupRows({
    sessions: [s],
    activities: [{ id, kind: "progress", duration_minutes: 0, session_id: id }],
    exported_at: "2026-09-08T01:00:23Z",
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[1].data.kind, "progress");
  assert.equal(rows[1].data.session_id, id);
});
