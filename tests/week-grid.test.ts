import test from "node:test";
import assert from "node:assert/strict";
import {
  axisBands,
  layoutDay,
  timeY,
  weekEvents,
  type WeekEvent,
} from "../src/lib/week-grid";
import { demoData } from "../src/lib/timeline";
import type { FocusSession } from "../src/lib/planning";
const event = (
  key: string,
  start: number,
  end: number,
  day = "2026-09-07",
): WeekEvent => ({
  key,
  id: key,
  day,
  start,
  end,
  title: key,
  color: "#2563eb",
  type: "session",
  planned: true,
});
test("hour positions are shared across weekdays; folding changes no event duration", () => {
  const events = [
    event("morning", 420, 480),
    event("afternoon", 870, 960, "2026-09-08"),
  ];
  const bands = axisBands(events);
  assert.ok(timeY(bands, 870) > timeY(bands, 420));
  assert.equal(timeY(bands, 480) - timeY(bands, 420), 60);
  assert.equal(timeY(bands, 960) - timeY(bands, 870), 90);
  assert.ok(bands.some((b) => b.collapsed && b.start === 480 && b.end === 840));
  const open = axisBands(
    events,
    360,
    1380,
    bands.filter((b) => b.collapsed).map((b) => b.key),
  );
  assert.equal(timeY(open, 870) - timeY(open, 420), 450);
  assert.equal(timeY(axisBands([]), 1380), 1020);
});
test("overlap lanes share only connected groups and short sessions retain true height", () => {
  const rows = layoutDay([
    event("a", 420, 480),
    event("b", 450, 510),
    event("c", 500, 520),
    event("d", 600, 600.5),
  ]);
  assert.deepEqual(
    rows.map((e) => [e.lane, e.lanes]),
    [
      [0, 2],
      [1, 2],
      [0, 2],
      [0, 1],
    ],
  );
  const bands = axisBands(rows);
  assert.equal(timeY(bands, 600.5) - timeY(bands, 600), 0.5);
});
test("midnight actual timer segments appear once and replace the completed intention", () => {
  const { goals, activities } = demoData("2026-09-08");
  const s = {
    id: "s",
    goal_id: goals[0].id,
    title: "Timer",
    status: "completed",
    scheduled_start: "2026-09-07T09:00:00",
    scheduled_end: "2026-09-07T10:00:00",
    planned_minutes: 60,
    segments: [
      { start: "2026-09-07T23:50:00", end: "2026-09-08T00:00:00" },
      { start: "2026-09-08T00:10:00", end: "2026-09-08T00:20:00" },
    ],
  } as FocusSession;
  const logs = ["2026-09-07", "2026-09-08"].map((day, i) => ({
    ...activities[0],
    id: "a" + i,
    kind: "event" as const,
    session_id: "s",
    occurred_on: day,
    duration_minutes: 10,
    started_at: s.segments[i].start,
    ended_at: s.segments[i].end,
  }));
  const events = weekEvents("2026-09-07", goals, [], [s], logs);
  assert.equal(events.length, 2);
  assert.ok(events.every((e) => e.type === "activity"));
  assert.deepEqual(
    events.map((e) => [e.day, e.start, e.end]),
    [
      ["2026-09-07", 1430, 1440],
      ["2026-09-08", 10, 20],
    ],
  );
  const moved = {
    ...logs[1],
    occurred_on: "2026-09-09",
    started_at: "2026-09-09T14:30:00",
    ended_at: "2026-09-09T14:40:00",
  };
  const movedEvents = weekEvents("2026-09-07", goals, [], [s], [moved]);
  assert.deepEqual(
    movedEvents.map((e) => [e.day, e.start, e.end]),
    [["2026-09-09", 870, 880]],
  );
});
