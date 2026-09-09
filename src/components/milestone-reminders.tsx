"use client";
import type { Goal, GoalStep } from "@/lib/timeline";
import { goalSteps, milestoneReminder } from "@/lib/milestones";

export default function MilestoneReminders({
  goals,
  today,
  onConfirm,
}: {
  goals: Goal[];
  today: string;
  onConfirm: (goal: Goal, step: GoalStep) => void;
}) {
  const reminders = goals
    .filter((g) => g.progress < 100)
    .flatMap((goal) =>
      goalSteps(goal).flatMap((step) => {
        const state = milestoneReminder(step, today);
        return state ? [{ goal, step, state }] : [];
      }),
    );
  if (!reminders.length) return null;
  return (
    <div className="milestone-reminders">
      {reminders.map(({ goal, step, state }) => (
        <button
          className="milestone-reminder"
          key={goal.id + ":" + step.id}
          onClick={() => onConfirm(goal, step)}
          style={{ borderLeftColor: goal.color }}
        >
          {state === "overdue"
            ? "Khoảng dự kiến đã qua. Cập nhật ngày cho"
            : "Đã có lịch chưa? Chốt ngày cho"}{" "}
          {goal.title}
          {!step.is_final ? ` · ${step.title}` : ""}.
        </button>
      ))}
    </div>
  );
}
