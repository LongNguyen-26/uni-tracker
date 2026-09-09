import {
  addDays,
  dateKey,
  daysBetween,
  parseDate,
  type Activity,
  type Goal,
} from "./timeline";

export type HeatmapMode = "goals" | "focus";
export type DaySummary = {
  activities: Activity[];
  deadlines: Goal[];
  minutes: number;
  workCount: number;
  colors: string[];
  marker: string;
  label: string;
};
export const isWork = (a: Activity) =>
  a.kind === "event" && (!a.is_milestone || a.duration_minutes > 0);
export const formatMinutes = (minutes: number) => {
  const seconds = Math.max(0, Math.round(Number(minutes) * 60)),
    m = Math.floor(seconds / 60),
    h = Math.floor(m / 60);
  if (seconds < 60) return seconds ? `${seconds} giây` : "0 phút";
  return `${h ? `${h} giờ ` : ""}${m % 60 || !h ? `${m % 60} phút` : ""}${seconds % 60 ? ` ${seconds % 60} giây` : ""}`.trim();
};
export const activityLabel = (a: Activity) =>
  a.kind === "completion"
    ? "Hoàn thành mục tiêu"
    : a.kind === "progress"
      ? "Cập nhật tiến độ"
      : a.is_milestone
        ? "Cột mốc đã đạt"
        : "Hoạt động";
export function splitColor(colors: string[]): string {
  const visible = colors.slice(0, 4);
  if (!visible.length) return "#edf0eb";
  if (visible.length === 1) return visible[0];
  if (visible.length === 2)
    return `linear-gradient(135deg, ${visible[0]} 0% 50%, ${visible[1]} 50% 100%)`;
  return `conic-gradient(from 45deg, ${visible.map((color, i) => `${color} ${(i * 100) / visible.length}% ${((i + 1) * 100) / visible.length}%`).join(", ")})`;
}
export function dayBackground(day: DaySummary | undefined, mode: HeatmapMode) {
  if (!day) return "#edf0eb";
  if (mode === "focus")
    return ["#edf0eb", "#c5dfc3", "#85bb86", "#489563", "#236b46"][
      day.minutes >= 180
        ? 4
        : day.minutes >= 90
          ? 3
          : day.minutes >= 30
            ? 2
            : day.workCount
              ? 1
              : 0
    ];
  return splitColor(day.colors);
}
export function summarizeDays(goals: Goal[], activities: Activity[]) {
  const map = new Map<string, DaySummary>();
  const goalMap = new Map(goals.map((g) => [g.id, g]));
  function get(day: string) {
    if (!map.has(day))
      map.set(day, {
        activities: [],
        deadlines: [],
        minutes: 0,
        workCount: 0,
        colors: [],
        marker: "",
        label: "",
      });
    return map.get(day)!;
  }
  goals.forEach((g) => {
    if (g.deadline) get(g.deadline).deadlines.push(g);
  });
  activities.forEach((a) => {
    const day = get(a.occurred_on);
    day.activities.push(a);
    if (isWork(a)) {
      day.minutes += a.duration_minutes;
      day.workCount++;
    }
  });
  map.forEach((day) => {
    const important = day.activities.filter(
      (a) => a.is_milestone || a.kind === "completion",
    );
    // One segment per goal, with deadlines/milestones taking priority over ordinary work.
    const segments = new Map<string, string>();
    day.deadlines.forEach((g) => segments.set(g.id, g.color));
    [...important, ...day.activities].forEach((a) => {
      const key =
        a.goal_id || (a.is_milestone ? a.id : `unassigned:${a.color}`);
      if (!segments.has(key)) {
        const color = (a.goal_id && goalMap.get(a.goal_id)?.color) || a.color;
        segments.set(key, important.includes(a) ? color : `${color}80`);
      }
    });
    day.colors = [...segments.values()];
    day.marker = important.length
      ? "★"
      : day.deadlines.some((g) => g.milestone_kind === "final")
        ? "C"
        : day.deadlines.some((g) => g.milestone_kind === "midterm")
          ? "G"
          : day.deadlines.some((g) => g.tracking_mode === "milestone")
            ? "◆"
            : "";
    day.label = [
      ...day.deadlines.map((g) => `Hạn: ${g.title}`),
      ...day.activities.map(
        (a) =>
          `${activityLabel(a)}: ${a.title}${a.duration_minutes ? ` (${formatMinutes(a.duration_minutes)})` : ""}`,
      ),
    ].join(" · ");
  });
  return map;
}
export function periodBounds(anchor: string, mode: "week" | "month") {
  const date = parseDate(anchor);
  const start =
    mode === "week"
      ? addDays(anchor, -((date.getDay() + 6) % 7))
      : dateKey(new Date(date.getFullYear(), date.getMonth(), 1, 12));
  const end =
    mode === "week"
      ? addDays(start, 6)
      : dateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0, 12));
  return { start, end };
}
export function shiftPeriod(
  anchor: string,
  mode: "week" | "month",
  direction: number,
) {
  if (mode === "week") return addDays(anchor, 7 * direction);
  const date = parseDate(anchor);
  return dateKey(
    new Date(date.getFullYear(), date.getMonth() + direction, 1, 12),
  );
}
export function productivity(
  activities: Activity[],
  goals: Goal[],
  start: string,
  end: string,
  today: string,
) {
  const effectiveEnd = end < today ? end : today;
  const logs = activities.filter(
    (a) => isWork(a) && a.occurred_on >= start && a.occurred_on <= effectiveEnd,
  );
  const days = Array.from({ length: daysBetween(start, end) + 1 }, (_, i) => ({
    date: addDays(start, i),
    minutes: 0,
    count: 0,
  }));
  const dayMap = new Map(days.map((day) => [day.date, day]));
  const goalMap = new Map(goals.map((g) => [g.id, g]));
  const allocation = new Map<
    string,
    { id: string; title: string; color: string; minutes: number }
  >();
  logs.forEach((a) => {
    const day = dayMap.get(a.occurred_on)!;
    day.minutes += a.duration_minutes;
    day.count++;
    if (!a.duration_minutes) return;
    const goal = a.goal_id ? goalMap.get(a.goal_id) : undefined;
    const id =
      a.goal_id || (a.goal_title ? `archived:${a.goal_title}` : "unassigned");
    const item = allocation.get(id) || {
      id,
      title: goal?.title || a.goal_title || "Chưa gắn mục tiêu",
      color: goal?.color || a.color,
      minutes: 0,
    };
    item.minutes += a.duration_minutes;
    allocation.set(id, item);
  });
  return {
    days,
    minutes: logs.reduce((sum, a) => sum + a.duration_minutes, 0),
    activeDays: days.filter((d) => d.count > 0).length,
    elapsedDays: Math.max(0, daysBetween(start, effectiveEnd) + 1),
    untimed: logs.filter((a) => !a.duration_minutes).length,
    allocation: [...allocation.values()].sort((a, b) => b.minutes - a.minutes),
  };
}
export type RhythmSegment = {
  id: string;
  title: string;
  color: string;
  minutes: number;
};
export type RhythmWeek = {
  key: string;
  start: string;
  end: string;
  minutes: number;
  future: boolean;
  segments: RhythmSegment[];
};
// One bar per column of the semester heatmap, so both read on the same axis.
export function semesterRhythm(
  activities: Activity[],
  goals: Goal[],
  days: (string | null)[],
  today: string,
) {
  const goalMap = new Map(goals.map((g) => [g.id, g]));
  const identify = (a: Activity) => ({
    id: a.goal_id || (a.goal_title ? `archived:${a.goal_title}` : "unassigned"),
    title:
      (a.goal_id ? goalMap.get(a.goal_id)?.title : undefined) ||
      a.goal_title ||
      "Chưa gắn mục tiêu",
    color: (a.goal_id ? goalMap.get(a.goal_id)?.color : undefined) || a.color,
  });
  const columns: { start: string; end: string }[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const week = days.slice(i, i + 7).filter((d): d is string => !!d);
    if (week.length)
      columns.push({ start: week[0], end: week[week.length - 1] });
  }
  const first = columns[0]?.start,
    last = columns.at(-1)?.end;
  const logs =
    first && last
      ? activities.filter(
          (a) =>
            isWork(a) &&
            Number(a.duration_minutes) > 0 &&
            a.occurred_on >= first &&
            a.occurred_on <= last,
        )
      : [];
  const totals = new Map<string, RhythmSegment>();
  logs.forEach((a) => {
    const { id, title, color } = identify(a);
    const item = totals.get(id) || { id, title, color, minutes: 0 };
    item.minutes += Number(a.duration_minutes);
    totals.set(id, item);
  });
  // One order for the strip, the legend and every stack, so colours never swap.
  const allocation = [...totals.values()].sort((a, b) => b.minutes - a.minutes);
  const rank = new Map(allocation.map((item, i) => [item.id, i]));
  const weeks: RhythmWeek[] = columns.map((column) => {
    const inside = logs.filter(
      (a) => a.occurred_on >= column.start && a.occurred_on <= column.end,
    );
    const parts = new Map<string, RhythmSegment>();
    inside.forEach((a) => {
      const { id, title, color } = identify(a);
      const item = parts.get(id) || { id, title, color, minutes: 0 };
      item.minutes += Number(a.duration_minutes);
      parts.set(id, item);
    });
    return {
      key: column.start,
      start: column.start,
      end: column.end,
      future: column.start > today,
      minutes: inside.reduce((sum, a) => sum + Number(a.duration_minutes), 0),
      segments: [...parts.values()].sort(
        (a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0),
      ),
    };
  });
  return {
    weeks,
    allocation,
    minutes: allocation.reduce((sum, item) => sum + item.minutes, 0),
    peak: Math.max(60, ...weeks.map((w) => w.minutes)),
  };
}
