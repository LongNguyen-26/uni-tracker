import { isWork } from "./focus";
import { goalSteps } from "./milestones";
import { monday } from "./planning";
import {
  addDays,
  daysBetween,
  streak,
  type Activity,
  type Goal,
  type GoalStep,
} from "./timeline";

// Twelve weeks is about one term of showing up: long enough to read as a habit,
// short enough to sit beside a goal title.
export const STRIP_WEEKS = 12;
// A week away is a pause, not a broken promise. Past this the card leads with
// what is still there rather than with what was missed.
export const AWAY_DAYS = 7;

export type JourneyWeek = { start: string; minutes: number };

export type GoalJourney = {
  /** Every minute ever logged against this goal. */
  minutes: number;
  sessions: number;
  /** Days the user showed up. This never resets, which is the point. */
  activeDays: number;
  longestMinutes: number;
  firstDay: string | null;
  lastDay: string | null;
  daysSinceFirst: number | null;
  daysSinceLast: number | null;
  weekMinutes: number;
  weeks: JourneyWeek[];
  streak: number;
  last: Activity | null;
  phase: GoalStep | null;
};

// Only logged time counts as effort: an undated milestone or a zero-minute note
// is a record of something else.
const effort = (activities: Activity[], goalId: string) =>
  activities.filter(
    (a) => a.goal_id === goalId && isWork(a) && Number(a.duration_minutes) > 0,
  );

/** The step the user is on right now, so a card can say what this time is for. */
export function currentPhase(goal: Goal, today: string): GoalStep | null {
  const open = goalSteps(goal).filter((s) => !s.done);
  const steps = open.filter((s) => !s.is_final);
  const within = steps.find(
    (s) => !!s.date && s.date <= today && (s.end_date || s.date) >= today,
  );
  if (within) return within;
  const ahead = steps
    .filter((s) => !!s.date && (s.end_date || s.date!) > today)
    .sort((a, b) => a.date!.localeCompare(b.date!));
  return ahead[0] || steps[0] || open.find((s) => s.is_final) || null;
}

export function goalJourney(
  goal: Goal,
  activities: Activity[],
  today: string,
  weeks = STRIP_WEEKS,
): GoalJourney {
  const rows = effort(activities, goal.id);
  const sorted = [...rows].sort(
    (a, b) =>
      a.occurred_on.localeCompare(b.occurred_on) ||
      a.created_at.localeCompare(b.created_at),
  );
  const firstDay = sorted[0]?.occurred_on ?? null;
  const last = sorted[sorted.length - 1] ?? null;
  const lastDay = last?.occurred_on ?? null;
  const thisWeek = monday(today);
  const start = addDays(thisWeek, -7 * (weeks - 1));
  const buckets = new Map<string, number>();
  for (const a of rows) {
    if (a.occurred_on < start) continue;
    const key = monday(a.occurred_on);
    buckets.set(key, (buckets.get(key) || 0) + Number(a.duration_minutes));
  }
  return {
    minutes: rows.reduce((n, a) => n + Number(a.duration_minutes), 0),
    sessions: rows.length,
    activeDays: new Set(rows.map((a) => a.occurred_on)).size,
    longestMinutes: rows.reduce(
      (n, a) => Math.max(n, Number(a.duration_minutes)),
      0,
    ),
    firstDay,
    lastDay,
    daysSinceFirst: firstDay ? daysBetween(firstDay, today) : null,
    daysSinceLast: lastDay ? daysBetween(lastDay, today) : null,
    weekMinutes: buckets.get(thisWeek) || 0,
    weeks: Array.from({ length: weeks }, (_, i) => {
      const week = addDays(start, i * 7);
      return { start: week, minutes: buckets.get(week) || 0 };
    }),
    streak: streak(rows, today),
    last,
    phase: currentPhase(goal, today),
  };
}

/** True once a goal with real history has been left alone for a while. */
export const isAway = (journey: GoalJourney) =>
  journey.minutes > 0 && (journey.daysSinceLast ?? 0) >= AWAY_DAYS;

/** Height of one bar in the week strip, as a 0–1 share of the busiest week. */
export function stripHeights(weeks: JourneyWeek[]) {
  const peak = weeks.reduce((n, w) => Math.max(n, w.minutes), 0);
  return weeks.map((w) => (peak ? w.minutes / peak : 0));
}

export function lastEffortDays(activities: Activity[]) {
  const map = new Map<string, string>();
  for (const a of activities) {
    if (!a.goal_id || !isWork(a) || Number(a.duration_minutes) <= 0) continue;
    const seen = map.get(a.goal_id);
    if (!seen || a.occurred_on > seen) map.set(a.goal_id, a.occurred_on);
  }
  return map;
}

export type GoalOrder = "recent" | "deadline";

/**
 * Continuing beats starting over, so the goal you last worked sits first.
 * Goals never worked fall to the end, newest first.
 */
export function orderGoals(
  goals: Goal[],
  activities: Activity[],
  order: GoalOrder,
): Goal[] {
  if (order === "deadline")
    return [...goals].sort(
      (a, b) =>
        (a.deadline || "9999-12-31").localeCompare(
          b.deadline || "9999-12-31",
        ) || a.id.localeCompare(b.id),
    );
  const last = lastEffortDays(activities);
  return [...goals].sort(
    (a, b) =>
      (last.get(b.id) || "").localeCompare(last.get(a.id) || "") ||
      b.created_at.localeCompare(a.created_at) ||
      a.id.localeCompare(b.id),
  );
}

/** The goal to preselect when someone just wants to start. */
export function lastWorkedGoal(goals: Goal[], activities: Activity[]) {
  const open = goals.filter((g) => g.progress < 100);
  return (
    orderGoals(open.length ? open : goals, activities, "recent")[0] || null
  );
}
