import test from "node:test";
import assert from "node:assert/strict";
import {
  LEARN_AFTER,
  contextMode,
  parseMemory,
  rememberChoice,
  sameMode,
  shortClock,
  timerMode,
  timerReading,
  type TimerMemory,
} from "../src/lib/timer";

const scheduled = { planned_minutes: 90, instant: false };
const instant = { planned_minutes: 25, instant: true };

test("the default comes from context, never from a question", () => {
  assert.deepEqual(contextMode(scheduled), { kind: "down", minutes: 90 });
  assert.deepEqual(contextMode(instant), { kind: "up" });
  // With no history the context default stands for both kinds of session.
  assert.deepEqual(timerMode(scheduled, null), { kind: "down", minutes: 90 });
  assert.deepEqual(timerMode(instant, null), { kind: "up" });
});

test("a repeated choice takes over only on the fourth session", () => {
  const pick = { kind: "down", minutes: 25 } as const;
  let memory: TimerMemory | null = null;
  for (let i = 1; i < LEARN_AFTER; i++) {
    memory = rememberChoice(memory, pick);
    assert.equal(memory.streak, i);
    // Still the context default while the habit is only forming.
    assert.deepEqual(timerMode(instant, memory), { kind: "up" });
  }
  memory = rememberChoice(memory, pick);
  assert.equal(memory.streak, LEARN_AFTER);
  assert.deepEqual(timerMode(instant, memory), pick);
  assert.deepEqual(timerMode(scheduled, memory), pick);
});

test("switching to something else restarts the count", () => {
  let memory: TimerMemory | null = null;
  for (let i = 0; i < LEARN_AFTER; i++)
    memory = rememberChoice(memory, { kind: "down", minutes: 25 });
  memory = rememberChoice(memory, { kind: "down", minutes: 50 });
  assert.deepEqual(memory, { mode: { kind: "down", minutes: 50 }, streak: 1 });
  assert.deepEqual(timerMode(instant, memory), { kind: "up" });
  // A different length is a different habit, but count-up is one single habit.
  assert.equal(sameMode({ kind: "up" }, { kind: "up" }), true);
  assert.equal(
    sameMode({ kind: "down", minutes: 25 }, { kind: "down", minutes: 50 }),
    false,
  );
});

test("reaching zero does not stop the clock; the overflow is named", () => {
  const down = { kind: "down", minutes: 50 } as const;
  assert.deepEqual(timerReading(down, 1066), {
    elapsed: 1066,
    display: 1934,
    label: "CÒN LẠI",
    overtime: false,
  });
  assert.deepEqual(timerReading(down, 3000), {
    elapsed: 3000,
    display: 0,
    label: "CÒN LẠI",
    overtime: false,
  });
  // One second past the target the reading flips and keeps growing.
  assert.deepEqual(timerReading(down, 3262), {
    elapsed: 3262,
    display: 262,
    label: "VƯỢT",
    overtime: true,
  });
  assert.equal(timerReading({ kind: "up" }, 3262).label, "THỰC LÀM");
  assert.equal(timerReading({ kind: "up" }, 3262).display, 3262);
  // Real worked time is reported unchanged in every mode.
  assert.equal(timerReading(down, 3262).elapsed, 3262);
});

test("stored preferences are treated as untrusted input", () => {
  assert.equal(parseMemory(null), null);
  assert.equal(parseMemory("not json"), null);
  assert.equal(parseMemory('{"mode":{"kind":"sideways"},"streak":9}'), null);
  assert.equal(parseMemory('{"mode":{"kind":"down"},"streak":9}'), null);
  assert.equal(
    parseMemory('{"mode":{"kind":"down","minutes":0},"streak":9}'),
    null,
  );
  assert.equal(
    parseMemory('{"mode":{"kind":"down","minutes":1441},"streak":9}'),
    null,
  );
  assert.equal(parseMemory('{"mode":{"kind":"up"},"streak":0}'), null);
  assert.deepEqual(parseMemory('{"mode":{"kind":"up"},"streak":4}'), {
    mode: { kind: "up" },
    streak: 4,
  });
  assert.deepEqual(
    parseMemory('{"mode":{"kind":"down","minutes":25},"streak":3}'),
    { mode: { kind: "down", minutes: 25 }, streak: 3 },
  );
});

test("the clock shows hours only once there are hours", () => {
  assert.equal(shortClock(0), "00:00");
  assert.equal(shortClock(1934), "32:14");
  assert.equal(shortClock(3599), "59:59");
  assert.equal(shortClock(3600), "1:00:00");
  assert.equal(shortClock(-5), "00:00");
});
