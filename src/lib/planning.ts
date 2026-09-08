import {
  addDays,
  dateKey,
  daysBetween,
  formatDate,
  parseDate,
  type Goal,
  type Profile,
  type SemesterSettings,
} from "./timeline";
export type WeeklyBudget = {
  id: string;
  user_id: string;
  goal_id: string;
  week_start: string;
  planned_minutes: number;
};
export type FocusSession = {
  id: string;
  user_id: string;
  goal_id: string | null;
  title: string;
  notes: string;
  scheduled_start: string;
  scheduled_end: string;
  is_unscheduled?: boolean;
  planned_minutes: number;
  timezone: string;
  elapsed_seconds: number;
  running_since: string | null;
  status: "planned" | "running" | "paused" | "review" | "completed";
  segments: { start: string; end: string }[];
  created_at: string;
};
export type SessionInput = Pick<
  FocusSession,
  | "title"
  | "notes"
  | "goal_id"
  | "scheduled_start"
  | "scheduled_end"
  | "planned_minutes"
  | "timezone"
  | "is_unscheduled"
>;
export const goalProgressText = (goal: Goal) =>
  goal.tracking_mode === "none"
    ? "Chưa đặt thước đo"
    : goal.tracking_mode === "numeric"
      ? `${goal.metric_current} → ${goal.metric_target}${goal.metric_unit ? ` ${goal.metric_unit}` : ""}`
      : goal.tracking_mode === "checklist"
        ? `${goal.checklist.filter((s) => s.done).length}/${goal.checklist.length} cột mốc`
        : goal.tracking_mode === "milestone"
          ? goal.progress === 100
            ? "Đã đạt"
            : "Chưa đạt"
          : `${goal.progress}%`;
export function calculatedProgress(
  goal: Pick<
    Goal,
    | "tracking_mode"
    | "metric_current"
    | "metric_target"
    | "metric_direction"
    | "checklist"
    | "progress"
  >,
) {
  if (goal.tracking_mode === "none") return goal.progress === 100 ? 100 : 0;
  if (goal.tracking_mode === "numeric")
    return (
      goal.metric_direction === "decrease"
        ? goal.metric_current <= goal.metric_target
        : goal.metric_current >= goal.metric_target
    )
      ? 100
      : 0;
  if (goal.tracking_mode === "checklist")
    return goal.checklist.length
      ? Math.floor(
          (goal.checklist.filter((s) => s.done).length /
            goal.checklist.length) *
            100,
        )
      : 0;
  return goal.progress;
}
export const goalDateText = (g: Goal) =>
  g.starts_on && g.starts_on !== g.deadline
    ? `${formatDate(g.starts_on)} – ${formatDate(g.deadline, true)}`
    : formatDate(g.deadline, true);
export function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) && dateKey(parseDate(value)) === value
  );
}
export function validateSemesterSettings(
  profile: Pick<Profile, "study_years" | "semester_settings">,
) {
  if (![4, 5, 6].includes(profile.study_years))
    throw new Error("Chọn hành trình 4, 5 hoặc 6 năm.");
  const settings = [...profile.semester_settings].sort(
    (a, b) => a.index - b.index,
  );
  if (settings.length && settings.length !== profile.study_years * 2)
    throw new Error("Hãy cấu hình đủ các học kỳ.");
  settings.forEach((s, i) => {
    if (
      s.index !== i ||
      !validDate(s.start) ||
      !validDate(s.end) ||
      s.end < s.start ||
      daysBetween(s.start, s.end) > 370
    )
      throw new Error(
        `Học kỳ ${i + 1}: khoảng ngày chưa hợp lệ (tối đa 371 ngày).`,
      );
    if (i && settings[i - 1].end >= s.start)
      throw new Error(`Học kỳ ${i + 1} đang chồng ngày với kỳ trước.`);
    s.breaks.forEach((b) => {
      if (
        !validDate(b.start) ||
        !validDate(b.end) ||
        b.end < b.start ||
        b.start < s.start ||
        b.end > s.end
      )
        throw new Error(
          `Kỳ nghỉ ở học kỳ ${i + 1} phải nằm trong thời gian học kỳ.`,
        );
    });
  });
}
export function sessionElapsed(session: FocusSession, now = Date.now()) {
  const extra =
    session.status === "running" && session.running_since
      ? Math.max(
          0,
          Math.floor((now - new Date(session.running_since).getTime()) / 1000),
        )
      : 0;
  return Math.min(
    session.planned_minutes * 60,
    session.elapsed_seconds + extra,
  );
}
export function clockText(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
export function localDateTime(iso: string, seconds = false) {
  const d = new Date(iso);
  return `${dateKey(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}${seconds ? `:${String(d.getSeconds()).padStart(2, "0")}` : ""}`;
}
export function repeatedSessions(
  input: SessionInput,
  weeks: number,
  breaks: SemesterSettings[] = [],
  skipBreaks = false,
) {
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52)
    throw new Error("Số tuần lặp phải từ 1 đến 52.");
  const start = new Date(input.scheduled_start),
    end = new Date(input.scheduled_end);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end <= start ||
    end.getTime() - start.getTime() > 86400000
  )
    throw new Error(
      "Phiên làm việc cần giờ kết thúc sau giờ bắt đầu, tối đa 24 giờ.",
    );
  const rows: SessionInput[] = [];
  for (let i = 0; i < weeks; i++) {
    const a = new Date(start),
      b = new Date(end);
    a.setDate(a.getDate() + 7 * i);
    b.setDate(b.getDate() + 7 * i);
    if (
      skipBreaks &&
      breaks.some((s) =>
        s.breaks.some((h) => dateKey(a) <= h.end && dateKey(b) >= h.start),
      )
    )
      continue;
    rows.push({
      ...input,
      scheduled_start: a.toISOString(),
      scheduled_end: b.toISOString(),
    });
  }
  return rows;
}
export const monday = (date: string) =>
  addDays(date, -((parseDate(date).getDay() + 6) % 7));
