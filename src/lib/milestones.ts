import { addDays, type Goal, type GoalStep } from "./timeline";

export function goalSteps(
  goal: Pick<
    Goal,
    "checklist" | "deadline" | "starts_on" | "timing_mode" | "progress"
  >,
): GoalStep[] {
  const steps = goal.checklist || [];
  if (!goal.deadline || steps.some((s) => s.is_final)) return steps;
  return [
    ...steps,
    {
      id: "final-deadline",
      title: "Hạn hoàn thành",
      done: goal.progress === 100,
      date: goal.starts_on || goal.deadline,
      end_date: goal.deadline,
      timing_mode: goal.timing_mode || (goal.starts_on ? "window" : "fixed"),
      is_final: true,
      counts_for_progress: false,
    },
  ];
}

export const measuredSteps = (steps: GoalStep[]) =>
  steps.filter((s) => s.counts_for_progress !== false);

export function finalDates(steps: GoalStep[]) {
  const final = steps.find((s) => s.is_final);
  const deadline = final?.end_date || final?.date || null;
  const timing_mode = final?.timing_mode || "fixed";
  return {
    deadline,
    starts_on: timing_mode !== "fixed" && final?.date ? final.date : null,
    timing_mode,
  };
}

export function datedMilestones(goals: Goal[]) {
  return goals.flatMap((goal) =>
    goalSteps(goal)
      .filter((step) => step.date)
      .map((step) => ({
        goal,
        step,
        start: step.date!,
        end: step.end_date || step.date!,
      })),
  );
}

export function milestonesOnDay(goals: Goal[], day: string) {
  return datedMilestones(goals).filter((m) => m.start <= day && m.end >= day);
}

export function milestoneReminder(
  step: GoalStep,
  today: string,
): "upcoming" | "overdue" | null {
  if (
    step.done ||
    step.timing_mode !== "flexible" ||
    !step.date ||
    today < addDays(step.date, -14)
  )
    return null;
  return today > (step.end_date || step.date) ? "overdue" : "upcoming";
}
