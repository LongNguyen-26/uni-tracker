import type { Activity, Goal, GoalStep, Semester } from "./timeline";
import { goalSteps, finalDates } from "./milestones";
import { localDateTime, validDate, type FocusSession } from "./planning";

export function goalsInSemester(
  goals: Goal[],
  activities: Activity[],
  sessions: FocusSession[],
  semester?: Semester,
): Goal[] {
  if (!semester) return goals;
  const overlaps = (start: string, end: string) =>
    start <= semester.end && end >= semester.start;
  const ids = new Set(
    activities
      .filter((a) => overlaps(a.occurred_on, a.occurred_on))
      .map((a) => a.goal_id),
  );
  for (const s of sessions)
    if (
      overlaps(
        localDateTime(s.scheduled_start).slice(0, 10),
        localDateTime(
          new Date(Date.parse(s.scheduled_end) - 1).toISOString(),
        ).slice(0, 10),
      )
    )
      ids.add(s.goal_id);
  return goals.filter(
    (g) =>
      ids.has(g.id) ||
      goalSteps(g).some(
        (s) => s.date && overlaps(s.date, s.end_date || s.date),
      ),
  );
}

export function confirmMilestoneDate(goal: Goal, stepId: string, day: string) {
  if (!validDate(day)) throw new Error("Hãy chọn một ngày hợp lệ.");
  const steps = goalSteps(goal);
  if (!steps.some((s) => s.id === stepId))
    throw new Error("Cột mốc đã thay đổi. Hãy mở lại mục tiêu.");
  const checklist: GoalStep[] = steps.map((s) =>
    s.id === stepId
      ? { ...s, date: day, end_date: day, timing_mode: "fixed" }
      : s,
  );
  return { checklist, ...finalDates(checklist) };
}

export const showJourneyIntro = (priorVisits: number) => priorVisits < 3;
