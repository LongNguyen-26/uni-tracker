"use client";
import { addDays, type Activity, type Goal } from "@/lib/timeline";
import { localDateTime, type FocusSession } from "@/lib/planning";
import { formatMinutes, isWork } from "@/lib/focus";
export default function WeekGoalLegend({
  week,
  goals,
  sessions,
  activities,
  onGoal,
}: {
  week: string;
  goals: Goal[];
  sessions: FocusSession[];
  activities: Activity[];
  onGoal?: (g: Goal) => void;
}) {
  if (!goals.length) return null;
  const end = addDays(week, 6);
  const values = goals.map((g) => {
    const planned = sessions
      .filter(
        (s) =>
          s.goal_id === g.id &&
          s.status !== "completed" &&
          localDateTime(s.scheduled_start).slice(0, 10) >= week &&
          localDateTime(s.scheduled_start).slice(0, 10) <= end,
      )
      .reduce((n, s) => n + s.planned_minutes, 0);
    const actual = activities
      .filter(
        (a) =>
          a.goal_id === g.id &&
          isWork(a) &&
          a.occurred_on >= week &&
          a.occurred_on <= end,
      )
      .reduce((n, a) => n + Number(a.duration_minutes), 0);
    return { goal: g, planned, actual };
  });
  const empty = values.filter(
    (v) => !v.planned && !v.actual && v.goal.progress < 100,
  ).length;
  return (
    <div className="week-goal-summary">
      <ul aria-label="Mục tiêu trong lịch tuần">
        {values.map(({ goal, planned, actual }) => {
          const content = (
            <>
              <i style={{ backgroundColor: goal.color }} aria-hidden="true" />
              <span className="week-goal-name">{goal.title}</span>
              <span className="week-goal-time">
                {planned
                  ? formatMinutes(planned) + " dự định"
                  : actual
                    ? formatMinutes(actual) + " đã làm"
                    : "0 giờ"}
              </span>
            </>
          );
          const title = `${goal.title}: ${formatMinutes(planned)} dự định, ${formatMinutes(actual)} đã làm trong tuần`;
          return (
            <li key={goal.id}>
              {onGoal ? (
                <button
                  type="button"
                  title={title}
                  onClick={() => onGoal(goal)}
                >
                  {content}
                </button>
              ) : (
                <span className="week-goal-chip" title={title}>
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {empty > 0 && (
        <p>
          {empty} mục tiêu chưa có giờ trong tuần này. Thêm kế hoạch tự học để
          xếp chúng vào khoảng trống bên dưới.
        </p>
      )}
    </div>
  );
}
