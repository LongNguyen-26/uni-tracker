import { addDays, type Activity, type Goal } from "./timeline";
import { localDateTime, type FocusSession } from "./planning";
import { timetableOnDay, type TimetableEntry } from "./schedule";

export type WeekEvent = {
  key: string;
  day: string;
  start: number;
  end: number;
  title: string;
  color: string;
  type: "fixed" | "session" | "activity";
  id: string;
  planned: boolean;
  allDay?: boolean;
  unscheduled?: boolean;
};
export type AxisBand = {
  start: number;
  end: number;
  top: number;
  height: number;
  collapsed: boolean;
  key: string;
};
const minute = (date: Date) =>
  date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;

export function weekEvents(
  week: string,
  goals: Goal[],
  fixed: TimetableEntry[],
  sessions: FocusSession[],
  activities: Activity[],
): WeekEvent[] {
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const out: WeekEvent[] = [];
  const color = (id?: string | null) =>
    goals.find((g) => g.id === id)?.color || "#64748b";
  function timed(
    base: Omit<WeekEvent, "day" | "start" | "end">,
    start: string,
    end: string,
  ) {
    const a = new Date(start),
      b = new Date(end);
    if (
      !Number.isFinite(a.getTime()) ||
      !Number.isFinite(b.getTime()) ||
      b <= a
    )
      return;
    const first = localDateTime(start).slice(0, 10),
      last = localDateTime(end).slice(0, 10);
    for (const day of days) {
      if (day < first || day > last) continue;
      const startMinute = day === first ? minute(a) : 0,
        endMinute = day === last ? minute(b) : 1440;
      if (endMinute > startMinute)
        out.push({
          ...base,
          key: base.key + ":" + day,
          day,
          start: startMinute,
          end: endMinute,
        });
    }
  }
  for (const day of days)
    for (const f of timetableOnDay(fixed, day))
      out.push({
        key: `fixed:${f.id}:${day}`,
        id: f.id,
        type: "fixed",
        day,
        start: f.start_minute,
        end: f.end_minute,
        title: f.title,
        color: color(f.goal_id),
        planned: false,
        allDay: f.all_day,
      });
  for (const s of sessions) {
    if (s.status === "completed") continue;
    const base = {
      key: `session:${s.id}`,
      id: s.id,
      type: "session" as const,
      title:
        s.intent || goals.find((g) => g.id === s.goal_id)?.title || s.title,
      color: color(s.goal_id),
      planned: true,
    };
    const day = localDateTime(s.scheduled_start).slice(0, 10);
    if (s.is_unscheduled) {
      if (days.includes(day))
        out.push({
          ...base,
          day,
          start: 0,
          end: s.planned_minutes,
          unscheduled: true,
        });
    } else timed(base, s.scheduled_start, s.scheduled_end);
  }
  for (const a of activities) {
    if (a.kind !== "event" || a.duration_minutes <= 0) continue;
    const base = {
      key: `activity:${a.id}`,
      id: a.id,
      type: "activity" as const,
      title: a.title,
      color: color(a.goal_id),
      planned: false,
    };
    const linked = sessions.find((s) => s.id === a.session_id);
    const logSegments =
      linked?.segments.flatMap((segment) => {
        const lo = new Date(`${a.occurred_on}T00:00`).getTime();
        const hi = new Date(`${addDays(a.occurred_on, 1)}T00:00`).getTime();
        const start = Math.max(lo, Date.parse(segment.start)),
          end = Math.min(hi, Date.parse(segment.end));
        return end > start ? [{ start, end }] : [];
      }) || [];
    const originalTiming =
      logSegments.length > 0 &&
      a.started_at &&
      a.ended_at &&
      Math.min(...logSegments.map((s) => s.start)) ===
        Date.parse(a.started_at) &&
      Math.max(...logSegments.map((s) => s.end)) === Date.parse(a.ended_at);
    if (linked?.segments.length && originalTiming) {
      linked.segments.forEach((segment, i) => {
        const before = out.length;
        timed({ ...base, key: base.key + ":" + i }, segment.start, segment.end);
        // A timer can have one log per day; each log owns only its day's slices.
        for (let j = out.length - 1; j >= before; j--)
          if (out[j].day !== a.occurred_on) out.splice(j, 1);
      });
    } else if (a.started_at && a.ended_at)
      timed(base, a.started_at, a.ended_at);
    else if (days.includes(a.occurred_on))
      out.push({
        ...base,
        day: a.occurred_on,
        start: 0,
        end: a.duration_minutes,
        unscheduled: true,
      });
  }
  return out;
}

export function axisBands(
  events: WeekEvent[],
  start = 360,
  end = 1380,
  expanded: string[] = [],
): AxisBand[] {
  const timed = events.filter((e) => !e.allDay && !e.unscheduled);
  const raw: { start: number; end: number; empty: boolean }[] = [];
  for (let at = start; at < end; at += 60) {
    const empty =
      timed.length > 0 && !timed.some((e) => e.start < at + 60 && e.end > at);
    const last = raw.at(-1);
    if (empty && last?.empty) last.end = at + 60;
    else raw.push({ start: at, end: at + 60, empty });
  }
  let top = 0;
  return raw.map((r) => {
    const key = `${r.start}-${r.end}`,
      collapsed = r.empty && r.end - r.start >= 120 && !expanded.includes(key);
    const height = collapsed ? 28 : r.end - r.start;
    const band = { ...r, key, collapsed, top, height };
    top += height;
    return band;
  });
}

export function timeY(bands: AxisBand[], minute: number): number {
  if (!bands.length) return 0;
  if (minute <= bands[0].start) return 0;
  const band =
    bands.find((b) => minute >= b.start && minute <= b.end) || bands.at(-1)!;
  return (
    band.top +
    Math.min(1, (minute - band.start) / (band.end - band.start)) * band.height
  );
}
export function yTime(bands: AxisBand[], y: number): number {
  const band =
    bands.find((b) => y >= b.top && y < b.top + b.height) || bands.at(-1)!;
  return (
    band.start +
    Math.max(0, Math.min(1, (y - band.top) / band.height)) *
      (band.end - band.start)
  );
}

/** Separate connected overlap groups so a single clash does not narrow a whole day. */
export function layoutDay(events: WeekEvent[]) {
  const sorted = [...events].sort(
    (a, b) => a.start - b.start || b.end - a.end || a.key.localeCompare(b.key),
  );
  const result: (WeekEvent & { lane: number; lanes: number })[] = [];
  let group: typeof result = [],
    ends: number[] = [],
    until = 0;
  const flush = () => {
    for (const e of group) result.push({ ...e, lanes: ends.length });
    group = [];
    ends = [];
  };
  for (const event of sorted) {
    if (group.length && event.start >= until) flush();
    let lane = ends.findIndex((end) => end <= event.start);
    if (lane < 0) lane = ends.length;
    ends[lane] = event.end;
    group.push({ ...event, lane, lanes: 0 });
    until = Math.max(...ends);
  }
  flush();
  return result;
}
