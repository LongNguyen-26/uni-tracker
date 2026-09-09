export type TimerMode = { kind: "up" } | { kind: "down"; minutes: number };
// What the student keeps choosing, and how many times in a row they chose it.
export type TimerMemory = { mode: TimerMode; streak: number };
export const COUNTDOWN_PRESETS = [25, 50] as const;
// Three deliberate changes in a row, so the fourth session opens that way.
export const LEARN_AFTER = 3;

export const sameMode = (a: TimerMode, b: TimerMode) =>
  a.kind === b.kind &&
  (a.kind === "up" || b.kind === "up" || a.minutes === b.minutes);

// A session picked off the grid already carries an intended length, so it
// counts down to it. One started on the spot has no plan, so it counts up.
export type TimerContext = { planned_minutes: number; instant: boolean };
export function contextMode(session: TimerContext): TimerMode {
  return session.instant
    ? { kind: "up" }
    : { kind: "down", minutes: session.planned_minutes };
}

export function timerMode(
  session: TimerContext,
  memory: TimerMemory | null,
): TimerMode {
  const context = contextMode(session);
  if (!memory || memory.streak < LEARN_AFTER) return context;
  // A learned countdown keeps the length the student kept picking; a learned
  // count-up applies anywhere.
  return memory.mode;
}

// Only deliberate switches are recorded — accepting the default teaches nothing.
export function rememberChoice(
  memory: TimerMemory | null,
  chosen: TimerMode,
): TimerMemory {
  return memory && sameMode(memory.mode, chosen)
    ? { mode: chosen, streak: memory.streak + 1 }
    : { mode: chosen, streak: 1 };
}

export function parseMemory(raw: string | null): TimerMemory | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object") return null;
    const { mode, streak } = value as { mode?: unknown; streak?: unknown };
    if (!mode || typeof mode !== "object") return null;
    const { kind, minutes } = mode as { kind?: unknown; minutes?: unknown };
    if (!Number.isInteger(streak) || (streak as number) < 1) return null;
    if (kind === "up") return { mode: { kind: "up" }, streak: streak as number };
    if (
      kind === "down" &&
      Number.isInteger(minutes) &&
      (minutes as number) >= 1 &&
      (minutes as number) <= 1440
    )
      return {
        mode: { kind: "down", minutes: minutes as number },
        streak: streak as number,
      };
    return null;
  } catch {
    return null;
  }
}

export type TimerReading = {
  elapsed: number;
  display: number;
  label: string;
  overtime: boolean;
};
// Zero is not a wall. Past it the clock keeps going and says so.
export function timerReading(mode: TimerMode, elapsed: number): TimerReading {
  const worked = Math.max(0, Math.floor(elapsed));
  if (mode.kind === "up")
    return { elapsed: worked, display: worked, label: "THỰC LÀM", overtime: false };
  const remaining = mode.minutes * 60 - worked;
  // Hitting the target reads as zero left; only the next second is overflow.
  return remaining >= 0
    ? { elapsed: worked, display: remaining, label: "CÒN LẠI", overtime: false }
    : {
        elapsed: worked,
        display: -remaining,
        label: "VƯỢT",
        overtime: true,
      };
}

// Hours only once they exist, so a pomodoro reads "32:14" and not "00:32:14".
export function shortClock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds)),
    h = Math.floor(s / 3600);
  const rest = `${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return h ? `${h}:${rest}` : rest;
}
