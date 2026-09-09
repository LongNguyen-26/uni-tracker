import test from "node:test";
import assert from "node:assert/strict";
import { demoData } from "../src/lib/timeline";
import { setupJourney, setupTerm, setupWeek } from "../src/lib/onboarding";
import { journeySemesters } from "../src/lib/schedule";
import { validateSemesterSettings } from "../src/lib/planning";
import { aiImportPrompt, importTemplate } from "../src/lib/import-guide";
import {
  parseTable,
  prepareImportRows,
  validImportRows,
  importPayload,
} from "../src/lib/importer";
const today = "2026-09-09",
  profile = demoData(today).profile;
test("student's current semester anchors the entry year and only confirms that term", () => {
  const p = setupJourney(profile, 4, 4, "2026-09-01", "2027-01-10");
  assert.equal(p.start_year, 2024);
  assert.equal(p.onboarding_term, 4);
  assert.deepEqual(p.confirmed_semesters, [4]);
  assert.equal(p.semester_settings[4].start, "2026-08-31");
  assert.equal(p.semester_settings[4].end, "2027-01-10");
  assert.equal(setupTerm(p, "2026-07-01").index, 4);
  assert.equal(setupWeek(setupTerm(p, today), today), "2026-09-07");
});
test("integer programs generate two terms per year including 3 years; invalid indices fail", () => {
  for (const years of [3, 4, 5, 6]) {
    const p = setupJourney(
      profile,
      years,
      years * 2 - 1,
      "2027-02-01",
      "2027-06-20",
    );
    assert.equal(journeySemesters(p).length, years * 2);
    validateSemesterSettings(p);
    assert.equal(p.start_year, 2027 - years);
  }
  assert.throws(() => setupJourney(profile, 4.5, 0, today, "2027-01-01"));
  assert.throws(() => setupJourney(profile, 3, 6, today, "2027-01-01"));
  assert.throws(() => setupJourney(profile, 4, 0, today, "2026-01-01"));
});
test("unusual current-term dates move adjacent estimates without overlaps", () => {
  const p = setupJourney(profile, 4, 3, "2026-01-12", "2026-09-20");
  validateSemesterSettings(p);
  assert.equal(p.semester_settings[3].end, "2026-09-20");
  assert.equal(p.semester_settings[4].start, "2026-09-21");
});
test("separate and combined AI templates parse valid linked groups without phantom data", () => {
  const goals = [
    { ...demoData(today).goals[0], title: "Mục tiêu có dấu, và phẩy" },
  ];
  for (const context of ["goals", "timetable", "activities", "all"] as const) {
    const options = { termStart: "2026-09-07", goals };
    const csv = importTemplate(today, "2027-01-10", context, options);
    const rows = prepareImportRows(
      parseTable(csv, "session", today),
      goals,
      today,
    );
    assert.equal(validImportRows(rows, goals, today).length, rows.length);
    assert.ok(
      aiImportPrompt(today, "2027-01-10", context, options).includes(csv),
    );
    if (context === "timetable")
      assert.deepEqual(
        rows.map((r) => r.kind),
        ["timetable"],
      );
    if (context === "activities") {
      assert.equal(rows.length, 1);
      assert.equal(rows[0].goal_id, goals[0].id);
    }
    if (context === "all") {
      assert.deepEqual(
        rows.map((r) => r.kind),
        ["goal", "milestone", "timetable", "session"],
      );
      assert.equal(importPayload(rows).length, 4);
    }
  }
});
