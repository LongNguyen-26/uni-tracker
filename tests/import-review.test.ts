import test from "node:test";
import assert from "node:assert/strict";
import {
  parseTable,
  prepareImportRows,
  validImportRows,
  validateImportRow,
  importPayload,
  repeatImport,
  goalPayload,
  parseJson,
} from "../src/lib/importer";
import {
  aiImportPrompt,
  importTemplate,
  IMPORT_COLUMNS,
} from "../src/lib/import-guide";
import { demoData } from "../src/lib/timeline";
import { weekCapacity, timetableOnDay } from "../src/lib/schedule";
import type { FocusSession } from "../src/lib/planning";
const today = "2026-09-08";
const prepare = (text: string) =>
  prepareImportRows(parseTable(text, "session", today), [], today);

test("fixed event windows retain explicit end dates beyond the current week without time fields", () => {
  const rows = repeatImport(
    prepare(
      "kind,title,date,end_date\nfixed,Conference,2027-08-18,2027-08-22\nfixed,Applications,2027-11-15,2027-12-01",
    ),
    4,
    [],
    false,
  );
  assert.deepEqual(
    rows.map((r) => [r.kind, r.end_date, r.all_day]),
    [
      ["timetable", "2027-08-22", true],
      ["timetable", "2027-12-01", true],
    ],
  );
  rows.forEach((r) => assert.equal(validateImportRow(r, [], rows, today), ""));
  const payload = importPayload(rows);
  assert.equal(payload[0].kind, "timetable");
  assert.ok("all_day" in payload[0] && payload[0].all_day);
});
test("resolve same-file goals before activities regardless of row order, reuse normalized names", () => {
  const rows = prepare(
    "kind,title,date,start_time,end_time,goal_id,current,target\nactivity,Read,2026-09-09,14:30,15:30, IELTS 7.0+ ,,\ngoal,IELTS 7.0+,2026-12-01,,,,6,7\nclass,Class,2026-09-10,14:30,15:30,ielts 7.0+,,",
  );
  assert.equal(rows.length, 3);
  assert.equal(rows[0].kind, "goal");
  assert.equal(rows[0].goal.tracking_mode, "numeric");
  assert.equal(rows[1].goal_ref, rows[0].ref);
  assert.equal(rows[2].goal_ref, rows[0].ref);
  assert.equal(validImportRows(rows, [], today).length, 3);
});
test("unknown goal names create one visible unmeasured goal while unknown UUIDs stay unresolved", () => {
  const rows = prepare(
    "kind,title,date,minutes,goal_id\nactivity,A,2026-09-08,30,Paper\nactivity,B,2026-09-09,45,paper\nactivity,C,2026-09-10,15,11111111-1111-4111-8111-111111111111",
  );
  assert.equal(rows.filter((r) => r.kind === "goal").length, 1);
  assert.equal(rows[0].generated, true);
  assert.equal(rows[0].goal.tracking_mode, "none");
  assert.equal(validImportRows(rows, [], today).length, 3);
});
test("invalid or deselected goals only block their dependent rows", () => {
  const rows = prepare(
    "kind,title,date,minutes,goal_id,current,target\ngoal,Invalid,2026-12-01,,,6,\nactivity,Linked,2026-09-08,30,Invalid,,\nactivity,Independent,2026-09-08,20,,,",
  );
  assert.deepEqual(
    validImportRows(rows, [], today).map((r) => r.title),
    ["Independent"],
  );
  rows[0].goal.metric_target = 7;
  rows[0].goal.tracking_mode = "numeric";
  assert.equal(validImportRows(rows, [], today).length, 3);
  rows[0].selected = false;
  assert.equal(validImportRows(rows, [], today).length, 1);
});
test("status uses date unless explicitly supplied; duration-only intentions have no reserved clock slot", () => {
  const rows = prepare(
    "kind,title,date,minutes,status\nactivity,Past,2026-09-07,10,\nactivity,Today,2026-09-08,20,\nactivity,Future,2026-09-09,30,\nactivity,Missed,2026-09-07,40,planned\nactivity,Invalid,2026-09-09,50,completed",
  );
  assert.deepEqual(
    rows.map((r) => r.kind),
    ["activity", "session", "session", "session", "activity"],
  );
  assert.equal(validImportRows(rows, [], today).length, 4);
  const payload = importPayload([rows[1]])[0];
  assert.ok("is_unscheduled" in payload && payload.is_unscheduled);
  const { profile } = demoData(today);
  const session = {
    ...payload,
    status: "planned",
    goal_id: null,
  } as unknown as FocusSession;
  assert.equal(
    weekCapacity("2026-09-07", profile, [], [session], []).occupied,
    0,
  );
});
test("goals infer numbers or steps; empty fields stay unmeasured; weekly hours are a goal attribute", () => {
  const rows = prepare(
    "kind,title,date,weekly_hours,current,target,steps\ngoal,Count,2026-12-01,6,0,7,\ngoal,Project,2026-12-01,16,,,Draft|Review\ngoal,Later,2026-12-01,,,,",
  );
  assert.deepEqual(
    rows.map((r) => r.goal.tracking_mode),
    ["numeric", "checklist", "none"],
  );
  assert.equal(goalPayload(rows[1]).weekly_hours, 16);
  assert.equal(rows[1].goal.checklist?.length, 2);
});
test("only timetables without an explicit end are extended; fixed single-day events do not repeat", () => {
  const rows = repeatImport(
    prepare(
      "kind,title,date,end_date,start_time,end_time\nclass,Weekly,2026-09-07,,07:00,09:00\nclass,Once,2026-09-07,2026-09-07,07:00,09:00\nfixed,Exam,2026-09-09,,,",
    ),
    4,
    [],
    false,
  );
  assert.equal(rows[0].end_date, "2026-10-04");
  assert.equal(rows[1].end_date, "2026-09-07");
  assert.equal(rows[2].end_date, "2026-09-09");
});
test("AI prompt and downloadable two-row example use the same valid schema", () => {
  const text = importTemplate(today, "2027-01-31");
  const rows = prepare(text);
  assert.equal(rows.length, 2);
  assert.equal(validImportRows(rows, [], today).length, 2);
  assert.equal(goalPayload(rows[0]).starts_on, null);
  assert.equal(goalPayload(rows[0]).deadline, "2027-01-31");
  assert.ok(
    aiImportPrompt(today, "2027-01-31").includes(IMPORT_COLUMNS.join(",")),
  );
});
test("goal dates describe deadlines or event windows, including approximate short windows", () => {
  const rows = prepare(
    "kind,title,date,end_date,timing_mode\ngoal,Deadline,,2026-11-30,\ngoal,Hackathon,2026-11-20,2026-11-22,window\ngoal,Approximate,2026-11-17,2026-11-30,flexible",
  );
  assert.equal(validImportRows(rows, [], today).length, 3);
  assert.deepEqual(
    rows.map((r) => {
      const g = goalPayload(r);
      return [g.starts_on, g.deadline, g.timing_mode];
    }),
    [
      [null, "2026-11-30", "fixed"],
      ["2026-11-20", "2026-11-22", "window"],
      ["2026-11-17", "2026-11-30", "flexible"],
    ],
  );
});
test("unmeasured backup goals do not acquire a numeric measure from default database columns", () => {
  const rows = parseJson(
    JSON.stringify({
      goals: [
        {
          title: "Later",
          deadline: today,
          tracking_mode: "none",
          metric_current: 0,
          metric_target: 1,
          checklist: [],
          progress: 0,
        },
      ],
    }),
    "session",
    today,
  );
  assert.equal(goalPayload(rows[0]).tracking_mode, "none");
  rows[0].goal.weekly_hours = NaN;
  assert.match(validateImportRow(rows[0], [], rows, today), /Quỹ giờ/);
});
test("a malformed row does not block the other CSV records", () => {
  const rows = prepare(
    "kind,title,date,minutes\nactivity,Valid,2026-09-08,30\nactivity,Invalid,2026-09-08,30,extra",
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(
    validImportRows(rows, [], today).map((r) => r.title),
    ["Valid"],
  );
});
test("all-day windows occupy each date, and existing duplicate goal names require review", () => {
  const payload = importPayload(
    prepare("kind,title,date,end_date\nfixed,Conference,2026-09-08,2026-09-10"),
  )[0];
  const entry = { ...payload, kind: "fixed" } as unknown as Parameters<
    typeof timetableOnDay
  >[0][number];
  assert.equal(timetableOnDay([entry], "2026-09-09").length, 1);
  const goal = demoData(today).goals[0];
  const rows = prepareImportRows(
    parseTable(
      `kind,title,date,minutes,goal_id\nactivity,Read,2026-09-08,30,${goal.title}`,
      "session",
      today,
    ),
    [goal, { ...goal, id: "duplicate" }],
    today,
  );
  assert.equal(validImportRows(rows, [goal], today).length, 0);
});
