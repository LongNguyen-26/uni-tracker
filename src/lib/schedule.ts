import {
  addDays,
  buildSemesters,
  dateKey,
  daysBetween,
  parseDate,
  type Activity,
  type Goal,
  type Profile,
  type SemesterSettings,
} from "./timeline";
import {
  localDateTime,
  monday,
  validateSemesterSettings,
  type FocusSession,
  type SessionInput,
} from "./planning";
import { isWork, splitColor } from "./focus";

import { milestonesOnDay } from "./milestones";
export type TimetableEntry = {
  id: string;
  user_id: string;
  title: string;
  kind: "class" | "fixed";
  semester_index: number | null;
  weekday: number;
  start_minute: number;
  end_minute: number;
  valid_from: string;
  valid_until: string;
  notes: string;
  goal_id?: string | null;
  all_day?: boolean;
};
export type TimetableInput = Omit<TimetableEntry, "id" | "user_id">;
export type TimeSlot = { day: string; start: number; end: number };
export const clockMinutes = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
};
export const minuteClock = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
export function academicSettings(
  year: number,
  years: number,
): SemesterSettings[] {
  const firstMonday = (y: number, m: number) => {
    const first = dateKey(new Date(y, m, 1, 12));
    return addDays(first, (8 - parseDate(first).getDay()) % 7);
  };
  return Array.from({ length: years * 2 }, (_, index) => {
    const y = year + Math.floor(index / 2),
      term = index % 2;
    const start = term ? firstMonday(y + 1, 1) : firstMonday(y, 7);
    const end = term
      ? addDays(monday(dateKey(new Date(y + 1, 6, 1, 12))), -1)
      : addDays(firstMonday(y + 1, 1), -1);
    return { index, start, end, label: `Học kỳ ${term + 1}`, breaks: [] };
  });
}
export function journeySettings(profile: Profile): SemesterSettings[] {
  const defaults = academicSettings(profile.start_year, profile.study_years);
  const terms = defaults.map((s) => {
    const saved = profile.semester_settings.find((x) => x.index === s.index);
    if (!saved) return s;
    return { ...saved, start: monday(saved.start), breaks: [] };
  });
  return terms.map((s, i) =>
    terms[i + 1] && s.end >= terms[i + 1].start
      ? { ...s, end: addDays(terms[i + 1].start, -1) }
      : s,
  );
}
export const journeySemesters = (profile: Profile) =>
  buildSemesters(
    profile.start_year,
    8,
    profile.study_years,
    journeySettings(profile),
  );
export function moveSemester(
  s: SemesterSettings,
  day: string,
): SemesterSettings {
  const start = monday(day);
  return {
    ...s,
    start,
    end: addDays(start, daysBetween(s.start, s.end)),
    breaks: [],
  };
}
export function timingMode(g: Goal) {
  return (
    g.timing_mode ||
    (g.starts_on && g.starts_on !== g.deadline ? "window" : "fixed")
  );
}
export function sessionsOnDay(sessions: FocusSession[], day: string) {
  return sessions.filter(
    (s) =>
      localDateTime(s.scheduled_start).slice(0, 10) <= day &&
      localDateTime(s.scheduled_end) > `${day}T00:00`,
  );
}
export function indexSessionsByDay(sessions: FocusSession[]) {
  const byDay = new Map<string, FocusSession[]>();
  for (const session of sessions) {
    const first = localDateTime(session.scheduled_start).slice(0, 10);
    const last = localDateTime(session.scheduled_end).slice(0, 10);
    for (let day = first; day <= last; day = addDays(day, 1)) {
      if (!sessionsOnDay([session], day).length) continue;
      const rows = byDay.get(day) || [];
      rows.push(session);
      byDay.set(day, rows);
    }
  }
  return byDay;
}
export function isGreen(color: string) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return false;
  const r = parseInt(color.slice(1, 3), 16) / 255,
    g = parseInt(color.slice(3, 5), 16) / 255,
    b = parseInt(color.slice(5, 7), 16) / 255;
  const hi = Math.max(r, g, b),
    lo = Math.min(r, g, b),
    d = hi - lo;
  if (d < 0.12) return false;
  let h =
    hi === r ? ((g - b) / d) % 6 : hi === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return h >= 70 && h <= 170;
}
export function timetableOnDay(entries: TimetableEntry[], day: string) {
  const weekday = (parseDate(day).getDay() + 6) % 7;
  return entries.filter(
    (e) =>
      (e.all_day || e.weekday === weekday) &&
      day >= e.valid_from &&
      day <= e.valid_until,
  );
}
export function mergeIntervals(intervals: { start: number; end: number }[]) {
  const result: { start: number; end: number }[] = [];
  for (const x of [...intervals].sort((a, b) => a.start - b.start)) {
    if (x.end <= x.start) continue;
    const last = result.at(-1);
    if (last && x.start <= last.end) last.end = Math.max(last.end, x.end);
    else result.push({ ...x });
  }
  return result;
}
export function weekCapacity(
  week: string,
  profile: Profile,
  entries: TimetableEntry[],
  sessions: FocusSession[],
  goals: Goal[],
  from?: Date,
) {
  const wake = profile.wake_minutes ?? 420,
    sleep = profile.sleep_minutes ?? 1380,
    days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  let fixed = 0,
    occupied = 0;
  const slots: TimeSlot[] = [];
  for (const day of days) {
    const blocks = timetableOnDay(entries, day).map((e) => ({
      start: Math.max(wake, e.start_minute),
      end: Math.min(sleep, e.end_minute),
    }));
    fixed += mergeIntervals(blocks).reduce((n, b) => n + b.end - b.start, 0);
    for (const s of sessionsOnDay(sessions, day)) {
      if (s.is_unscheduled || s.status === "completed") continue;
      const a = localDateTime(s.scheduled_start),
        b = localDateTime(s.scheduled_end);
      blocks.push({
        start: Math.max(
          wake,
          a.slice(0, 10) < day ? 0 : clockMinutes(a.slice(11)),
        ),
        end: Math.min(
          sleep,
          b.slice(0, 10) > day ? 1440 : clockMinutes(b.slice(11)),
        ),
      });
    }
    const merged = mergeIntervals(blocks);
    occupied += merged.reduce((n, b) => n + b.end - b.start, 0);
    let cursor = wake;
    for (const b of merged) {
      if (b.start > cursor) slots.push({ day, start: cursor, end: b.start });
      cursor = Math.max(cursor, b.end);
    }
    if (cursor < sleep) slots.push({ day, start: cursor, end: sleep });
  }
  const exams = goals.filter(
    (g) =>
      (g.reserved_hours || 0) > 0 &&
      g.progress < 100 &&
      !!g.deadline &&
      g.deadline >= week &&
      (g.starts_on || g.deadline) <= addDays(week, 6),
  );
  const reserved = Math.round(
    exams.reduce(
      (n, g) =>
        n +
        ((g.reserved_hours || 0) *
          60 *
          days.filter(
            (d) =>
              !!g.deadline &&
              d >= (g.starts_on || g.deadline) &&
              d <= g.deadline,
          ).length) /
          7,
      0,
    ),
  );
  const awake = (sleep - wake) * 7;
  const fromDay = from ? dateKey(from) : null,
    fromMinute = from
      ? Math.ceil(
          (from.getHours() * 60 + from.getMinutes() + from.getSeconds() / 60) /
            15,
        ) * 15
      : 0;
  const availableSlots = slots
    .filter((s) => !fromDay || s.day >= fromDay)
    .map((s) => ({
      ...s,
      start: s.day === fromDay ? Math.max(s.start, fromMinute) : s.start,
    }))
    .filter((s) => s.end > s.start);
  return {
    awake,
    fixed,
    occupied,
    reserved,
    available: Math.max(
      0,
      availableSlots.reduce((n, s) => n + s.end - s.start, 0) - reserved,
    ),
    slots: availableSlots,
    exams,
  };
}
export function distributeWeek(
  week: string,
  profile: Profile,
  entries: TimetableEntry[],
  sessions: FocusSession[],
  goals: Goal[],
  hours: Record<string, number>,
  now: Date = new Date(),
): { sessions: SessionInput[]; unallocated: number } {
  const capacity = weekCapacity(week, profile, entries, sessions, goals, now);
  const slots = capacity.slots.map((s) => ({ ...s }));
  const rows: SessionInput[] = [];
  let remaining = capacity.available;
  let unallocated = 0;
  for (const g of goals
    .filter((g) => g.progress < 100)
    .sort((a, b) =>
      (a.deadline || "9999").localeCompare(b.deadline || "9999"),
    )) {
    const fixedForGoal = daysForWeek(week).reduce(
      (n, day) =>
        n +
        mergeIntervals(
          timetableOnDay(entries, day)
            .filter((e) => e.goal_id === g.id && !e.all_day)
            .map((e) => ({ start: e.start_minute, end: e.end_minute })),
        ).reduce((m, interval) => m + interval.end - interval.start, 0),
      0,
    );
    const already =
      fixedForGoal +
      sessions
        .filter(
          (s) =>
            s.goal_id === g.id &&
            localDateTime(s.scheduled_start).slice(0, 10) >= week &&
            localDateTime(s.scheduled_start).slice(0, 10) <= addDays(week, 6),
        )
        .reduce((n, s) => n + s.planned_minutes, 0);
    let need = Math.max(0, Math.round((hours[g.id] || 0) * 60) - already);
    while (need >= 15 && remaining >= 15) {
      const perDay = new Map<string, number>();
      rows.forEach((r) => {
        const d = localDateTime(r.scheduled_start).slice(0, 10);
        perDay.set(d, (perDay.get(d) || 0) + r.planned_minutes);
      });
      const slot = slots
        .filter((s) => s.end - s.start >= 15)
        .sort(
          (a, b) =>
            (perDay.get(a.day) || 0) - (perDay.get(b.day) || 0) ||
            a.day.localeCompare(b.day) ||
            a.start - b.start,
        )[0];
      if (!slot) break;
      const duration =
        Math.floor(Math.min(need, remaining, 120, slot.end - slot.start) / 15) *
        15;
      if (duration < 15) break;
      rows.push({
        title: g.title,
        intent: "",
        goal_id: g.id,
        notes: "Phân bổ từ kế hoạch tuần",
        scheduled_start: new Date(
          `${slot.day}T${minuteClock(slot.start)}`,
        ).toISOString(),
        scheduled_end: new Date(
          `${slot.day}T${minuteClock(slot.start + duration)}`,
        ).toISOString(),
        planned_minutes: duration,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      slot.start += duration;
      need -= duration;
      remaining -= duration;
    }
    unallocated += need;
  }
  return { sessions: rows, unallocated };
}
const daysForWeek = (week: string) =>
  Array.from({ length: 7 }, (_, i) => addDays(week, i));
export function dayVisual(
  day: string,
  goals: Goal[],
  activities: Activity[],
  sessions: FocusSession[],
) {
  const logs = activities.filter(
      (a) => a.occurred_on === day && isWork(a) && a.duration_minutes > 0,
    ),
    minutes = logs.reduce((n, a) => n + Number(a.duration_minutes), 0);
  const alpha =
    minutes >= 180 ? "ee" : minutes >= 90 ? "b8" : minutes >= 30 ? "88" : "55";
  const colors = [
    ...new Set(
      logs.map(
        (a) =>
          (goals.find((g) => g.id === a.goal_id)?.color || a.color) + alpha,
      ),
    ),
  ];
  const plans = sessionsOnDay(sessions, day).filter(
    (s) => s.status !== "completed",
  );
  const plannedColors = [
    ...new Set(
      plans.map(
        (s) =>
          (goals.find((g) => g.id === s.goal_id)?.color || "#64748b") + "22",
      ),
    ),
  ];
  const markers = milestonesOnDay(goals, day);
  const ranges = markers
    .filter((m) => m.start !== m.end)
    .map((m) => ({
      ...m.goal,
      title: m.step.title,
      starts_on: m.start,
      deadline: m.end,
      timing_mode: m.step.timing_mode,
    }));
  const fixed = goals.filter(
    (g) => timingMode(g) === "fixed" && g.deadline === day,
  );
  return {
    markers,
    intermediate: markers.filter((m) => !m.step.is_final),
    finalMarkers: markers.filter((m) => m.step.is_final && m.end === day),
    minutes,
    plans,
    ranges,
    fixed,
    background: splitColor(colors.length ? colors : plannedColors),
    corner: splitColor(fixed.map((g) => g.color)),
    planned: plans.length > 0,
    rangeBackground: splitColor(
      markers.filter((m) => m.start !== m.end).map((m) => m.goal.color + "20"),
    ),
    uncertain: markers.some((m) => m.step.timing_mode === "flexible"),
  };
}

export function parseCalendarPreset(raw: string): Partial<Profile> {
  if (raw.length > 16000) throw new Error("Mẫu lịch quá dài.");
  const data = JSON.parse(raw);
  if (
    !data ||
    ![4, 5, 6].includes(data.study_years) ||
    !Number.isInteger(data.start_year) ||
    data.start_year < 2000 ||
    data.start_year > 2100 ||
    !Array.isArray(data.semester_settings) ||
    data.semester_settings.length !== data.study_years * 2
  )
    throw new Error("Mẫu lịch không hợp lệ.");
  const candidate = {
    study_years: data.study_years,
    start_year: data.start_year,
    start_month: 8,
    confirmed_semesters: [],
    semester_settings: data.semester_settings.map((x: SemesterSettings) => ({
      index: x.index,
      start: x.start,
      end: x.end,
      label: String(x.label || "Học kỳ").slice(0, 80),
      breaks: [],
    })),
  };
  validateSemesterSettings(candidate);
  if (
    candidate.semester_settings.some(
      (s: SemesterSettings) => parseDate(s.start).getDay() !== 1,
    )
  )
    throw new Error("Học kỳ phải bắt đầu thứ Hai.");
  return candidate;
}
