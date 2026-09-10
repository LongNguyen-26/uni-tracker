import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSemesters,
  addDays,
  daysBetween,
  formatDate,
  streak,
  demoData,
  type Activity,
} from "../src/lib/timeline";

test("eight semesters contain every day once including leap day", () => {
  const semesters = buildSemesters(2023, 9);
  assert.equal(semesters.length, 8);
  assert.equal(semesters[0].start, "2023-09-01");
  assert.equal(semesters[7].end, "2027-08-31");
  const days = semesters.flatMap((s) =>
    s.days.filter((d) => d && d >= s.start && d <= s.end),
  );
  assert.equal(days.length, 1461);
  assert.equal(new Set(days).size, 1461);
  assert.ok(days.includes("2024-02-29"));
  semesters.forEach((s, i) => {
    assert.equal(s.days.length % 7, 0);
    assert.ok(s.months.length >= 6);
    if (i > 0) assert.equal(s.start, addDays(semesters[i - 1].end, 1));
  });
});
test("custom start months cross year boundaries without gaps", () => {
  for (let month = 1; month <= 12; month++) {
    const semesters = buildSemesters(2024, month);
    const days = semesters.flatMap((s) =>
      s.days.filter((d) => d && d >= s.start && d <= s.end),
    );
    assert.equal(new Set(days).size, days.length);
    assert.equal(
      days.length,
      daysBetween(semesters[0].start, semesters[7].end) + 1,
    );
    assert.equal(
      semesters[0].start,
      `2024-${String(month).padStart(2, "0")}-01`,
    );
  }
});
test("calendar starts on Monday and padding matches weekday", () => {
  const sem = buildSemesters(2024, 9)[0];
  assert.equal(sem.days[0], "2024-08-26");
  assert.equal(sem.days[6], "2024-09-01");
  assert.equal(sem.days[7], "2024-09-02");
});
test("date arithmetic handles month boundaries and DST as calendar days", () => {
  assert.equal(addDays("2024-03-01", -1), "2024-02-29");
  assert.equal(daysBetween("2026-03-07", "2026-03-09"), 2);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});
test("streak tolerates not yet logging today, deduplicates entries, ignores future", () => {
  const rows = (dates: string[]) =>
    dates.map((occurred_on) => ({ occurred_on }) as Activity);
  assert.equal(
    streak(
      rows(["2026-09-05", "2026-09-05", "2026-09-04", "2026-09-07"]),
      "2026-09-06",
    ),
    2,
  );
  assert.equal(
    streak(rows(["2026-09-06", "2026-09-05", "2026-09-03"]), "2026-09-06"),
    2,
  );
  assert.equal(streak(rows(["2026-09-04"]), "2026-09-06"), 0);
  assert.equal(streak([], "2026-09-06"), 0);
});
test("demo history is labeled separately and has no future activities", () => {
  const demo = demoData("2026-09-06");
  assert.equal(demo.profile.id, "demo");
  assert.ok(
    demo.activities.every(
      (a) => a.occurred_on <= "2026-09-06" && a.user_id === "demo",
    ),
  );
});

test("dates read the same with or without the year", () => {
  assert.equal(formatDate("2026-09-07"), "07/09");
  assert.equal(formatDate("2026-09-07", true), "07/09/2026");
  assert.equal(formatDate("2026-01-01"), "01/01");
  assert.equal(formatDate("2026-12-31", true), "31/12/2026");
});
