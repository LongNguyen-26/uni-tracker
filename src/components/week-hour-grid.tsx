"use client";
import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  formatDate,
  todayKey,
  type Activity,
  type Goal,
  type Profile,
} from "@/lib/timeline";
import { sessionElapsed, type FocusSession } from "@/lib/planning";
import { shortClock } from "@/lib/timer";
import { minuteClock, type TimetableEntry } from "@/lib/schedule";
import {
  weekEvents,
  axisBands,
  axisWindow,
  timeY,
  yTime,
  layoutDay,
  type WeekEvent,
} from "@/lib/week-grid";
import { formatMinutes } from "@/lib/focus";
import { CalendarClock, MoreHorizontal, Wand2 } from "lucide-react";

export default function WeekHourGrid({
  week,
  profile,
  goals,
  entries,
  sessions,
  activities,
  onOpen,
  onMenu,
  onCreate,
  onIntent,
  onPlan,
}: {
  week: string;
  profile: Profile;
  goals: Goal[];
  entries: TimetableEntry[];
  sessions: FocusSession[];
  activities: Activity[];
  onOpen: (event: WeekEvent) => void;
  onMenu: (event: WeekEvent) => void;
  onCreate: (day: string, time: string) => void;
  onIntent: (id: string, intent: string) => Promise<void>;
  /** Offered from the empty grid, where an invitation is the useful thing. */
  onPlan?: () => void;
}) {
  const [expanded, setExpanded] = useState<string[]>([]),
    [fullDay, setFullDay] = useState(false);
  const [editing, setEditing] = useState<string | null>(null),
    [error, setError] = useState("");
  const running = sessions.find((s) => s.status === "running");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const events = useMemo(
    () => weekEvents(week, goals, entries, sessions, activities),
    [week, goals, entries, sessions, activities],
  );
  const timed = events.filter((e) => !e.allDay && !e.unscheduled),
    allDay = events.filter((e) => e.allDay),
    unscheduled = events.filter((e) => e.unscheduled);
  // The axis covers the hours this week actually uses, so an empty week is a
  // short invitation rather than a tall blank.
  const axis = useMemo(() => axisWindow(events), [events]);
  const bands = axisBands(
      events,
      fullDay ? 0 : axis.start,
      fullDay ? 1440 : axis.end,
      expanded,
    ),
    height = bands.at(-1)!.top + bands.at(-1)!.height;
  const first = bands[0].start,
    last = bands.at(-1)!.end;
  const compactCard = (e: WeekEvent) => (
    <button
      key={e.key}
      className={`tray-event ${e.planned ? "planned" : ""}`}
      style={{ borderColor: e.color }}
      onClick={() => onOpen(e)}
      title={`${e.title} · ${e.allDay ? "Cả ngày" : formatMinutes(e.end - e.start)}`}
    >
      {e.title}
      {!e.allDay && <small>{formatMinutes(e.end - e.start)}</small>}
    </button>
  );
  return (
    <>
      <div className="hour-grid-controls">
        <span>
          Trục giờ {minuteClock(first)}–{minuteClock(last)} · giờ ngủ có nền xám
        </span>
        <div className="row-actions">
          {expanded.length > 0 && (
            <button className="text-button" onClick={() => setExpanded([])}>
              Gập lại giờ trống
            </button>
          )}
          <button className="text-button" onClick={() => setFullDay(!fullDay)}>
            {fullDay ? "Thu về giờ có việc" : "Hiện 24 giờ"}
          </button>
        </div>
      </div>
      <div className="week-layout">
        <div
          className={`hour-grid-scroll ${timed.length ? "" : "is-empty"}`}
          aria-label="Lịch tuần theo giờ"
        >
          <div className="hour-grid-inner">
            <div className="hour-grid-heading">
              <div className="hour-axis-heading">Giờ</div>
              {days.map((day, i) => (
                <div key={day} className={day === todayKey() ? "current" : ""}>
                  <strong>
                    {["T2", "T3", "T4", "T5", "T6", "T7", "CN"][i]}
                  </strong>{" "}
                  {formatDate(day)}
                </div>
              ))}
            </div>
            {!!allDay.length && (
              <div className="hour-all-day">
                <div className="hour-axis-heading">Cả ngày</div>
                {days.map((day) => (
                  <div key={day}>
                    {allDay.filter((e) => e.day === day).map(compactCard)}
                  </div>
                ))}
              </div>
            )}
            <div className="hour-grid-body" style={{ height }}>
              <div className="hour-axis" style={{ height }}>
                {bands.flatMap((b) =>
                  b.collapsed
                    ? []
                    : Array.from({ length: (b.end - b.start) / 60 }, (_, i) => (
                        <span
                          key={b.start + i * 60}
                          style={{ top: timeY(bands, b.start + i * 60) }}
                        >
                          {minuteClock(b.start + i * 60)}
                        </span>
                      )),
                )}
                <span className="hour-axis-end" style={{ top: height - 15 }}>
                  {minuteClock(last)}
                </span>
              </div>
              <div className="hour-days">
                {days.map((day) => (
                  <div
                    key={day}
                    className="hour-day"
                    style={{ height }}
                    onClick={(e) => {
                      if (e.target !== e.currentTarget) return;
                      const minute = Math.min(
                        last - 15,
                        Math.max(
                          first,
                          Math.floor(
                            yTime(
                              bands,
                              e.clientY -
                                e.currentTarget.getBoundingClientRect().top,
                            ) / 15,
                          ) * 15,
                        ),
                      );
                      onCreate(day, minuteClock(minute));
                    }}
                  >
                    {bands
                      .filter((b) => !b.collapsed)
                      .flatMap((b) =>
                        Array.from(
                          { length: (b.end - b.start) / 60 },
                          (_, i) => {
                            const at = b.start + i * 60;
                            return (
                              <button
                                type="button"
                                className="hour-slot"
                                style={{
                                  top: timeY(bands, at),
                                  height: 60,
                                  backgroundImage: `linear-gradient(to bottom, #edf0ed 0px, #edf0ed ${Math.max(0, Math.min(60, (profile.wake_minutes ?? 420) - at))}px, transparent ${Math.max(0, Math.min(60, (profile.wake_minutes ?? 420) - at))}px, transparent ${Math.max(0, Math.min(60, (profile.sleep_minutes ?? 1380) - at))}px, #edf0ed ${Math.max(0, Math.min(60, (profile.sleep_minutes ?? 1380) - at))}px), linear-gradient(transparent 29px,#eff2ec 29px,#eff2ec 30px,transparent 30px)`,
                                }}
                                key={at}
                                aria-label={`Thêm phiên ${day} ${minuteClock(at)}`}
                                onClick={(e) => {
                                  const offset =
                                    Math.floor(
                                      (e.clientY -
                                        e.currentTarget.getBoundingClientRect()
                                          .top) /
                                        15,
                                    ) * 15;
                                  onCreate(
                                    day,
                                    minuteClock(
                                      at + Math.max(0, Math.min(45, offset)),
                                    ),
                                  );
                                }}
                              />
                            );
                          },
                        ),
                      )}
                    {layoutDay(
                      timed.filter(
                        (e) => e.day === day && e.start < last && e.end > first,
                      ),
                    ).map((e) => {
                      const top = timeY(bands, Math.max(first, e.start)),
                        eventHeight = timeY(bands, Math.min(last, e.end)) - top;
                      const s =
                        e.type === "session"
                          ? sessions.find((s) => s.id === e.id)
                          : undefined;
                      return (
                        <div
                          className={`hour-event ${e.planned ? "planned" : "done"} ${eventHeight < 35 ? "compact" : ""} ${s?.status === "running" ? "running" : ""}`}
                          key={e.key}
                          style={
                            {
                              top,
                              height: eventHeight,
                              left: `${(e.lane / e.lanes) * 100}%`,
                              width: `${100 / e.lanes}%`,
                              "--event-color": e.color,
                            } as React.CSSProperties
                          }
                        >
                          <button
                            className="hour-event-main"
                            onClick={() => onOpen(e)}
                            title={`${e.title} · ${minuteClock(Math.floor(e.start))}–${minuteClock(Math.floor(e.end))} · ${formatMinutes(e.end - e.start)}`}
                            aria-label={
                              s?.status === "running"
                                ? `${e.title}, đang chạy ${shortClock(sessionElapsed(s, now))}, mở đồng hồ`
                                : `${e.title}, ${day}, ${minuteClock(Math.floor(e.start))} đến ${minuteClock(Math.floor(e.end))}`
                            }
                          >
                            <strong>{e.title}</strong>
                            {s?.status === "running" ? (
                              <small className="hour-running">
                                <i className="running-dot" aria-hidden="true" />
                                {shortClock(sessionElapsed(s, now))}
                              </small>
                            ) : (
                              eventHeight >= 35 && (
                                <small>
                                  {minuteClock(Math.floor(e.start))}–
                                  {minuteClock(Math.floor(e.end))}
                                </small>
                              )
                            )}
                          </button>
                          <button
                            className="hour-event-menu"
                            aria-label={`Tùy chọn cho ${e.title}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              onMenu(e);
                            }}
                          >
                            <MoreHorizontal size={14} />
                          </button>
                          {s &&
                            !s.intent &&
                            eventHeight >= 60 &&
                            (editing === s.id ? (
                              <input
                                autoFocus
                                aria-label="Nội dung dự định"
                                maxLength={160}
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") e.currentTarget.blur();
                                  if (e.key === "Escape") setEditing(null);
                                }}
                                onBlur={async (e) => {
                                  const value = e.target.value;
                                  setEditing(null);
                                  try {
                                    await onIntent(s.id, value);
                                  } catch (e) {
                                    setError(
                                      e instanceof Error
                                        ? e.message
                                        : "Chưa lưu được nội dung.",
                                    );
                                  }
                                }}
                              />
                            ) : (
                              <button
                                className="hour-intent"
                                onClick={() => setEditing(s.id)}
                              >
                                Chưa chọn nội dung
                              </button>
                            ))}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              {bands
                .filter((b) => b.collapsed)
                .map((b) => (
                  <button
                    className="collapsed-hours"
                    key={b.key}
                    style={{ top: b.top, height: b.height }}
                    onClick={() => setExpanded((prev) => [...prev, b.key])}
                  >
                    {minuteClock(b.start)}–{minuteClock(b.end)} · trống cả tuần
                    · Mở
                  </button>
                ))}
            </div>
          </div>
          {/* An empty week is a place to start, not a hole. */}
          {!timed.length && (
            <div className="hour-grid-empty">
              <CalendarClock size={26} />
              <strong>
                {unscheduled.length
                  ? `${unscheduled.length} hoạt động chưa được xếp giờ`
                  : "Tuần này chưa có giờ nào được xếp"}
              </strong>
              <p>Chọn một khoảng trống trong lưới, hoặc để app xếp giúp bạn.</p>
              {onPlan && (
                <button className="button primary" onClick={onPlan}>
                  <Wand2 size={16} />
                  Xếp vào khoảng trống
                </button>
              )}
            </div>
          )}
        </div>
        {!!unscheduled.length && (
          <section className="unscheduled-tray">
            <h3>Chưa xếp giờ</h3>
            <p>Kéo dài của tuần, chưa gắn vào giờ nào.</p>
            {days
              .filter((day) => unscheduled.some((e) => e.day === day))
              .map((day) => (
                <div key={day}>
                  <small>{formatDate(day)}</small>
                  <div className="tray-items">
                    {unscheduled.filter((e) => e.day === day).map(compactCard)}
                  </div>
                </div>
              ))}
          </section>
        )}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
