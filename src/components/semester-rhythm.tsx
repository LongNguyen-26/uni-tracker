"use client";
import { useMemo, type CSSProperties } from "react";
import { formatMinutes, semesterRhythm } from "@/lib/focus";
import {
  formatDate,
  type Activity,
  type Goal,
  type Semester,
} from "@/lib/timeline";

// Same column count, gutter and month labels as the heatmap above, so the eye
// reads both as one stretch of time seen two ways.
export default function SemesterRhythm({
  semester,
  activities,
  goals,
  today,
  zoomed,
  onWeek,
}: {
  semester: Semester;
  activities: Activity[];
  goals: Goal[];
  today: string;
  zoomed: boolean;
  onWeek: (day: string) => void;
}) {
  const rhythm = useMemo(
    () => semesterRhythm(activities, goals, semester.days, today),
    [activities, goals, semester.days, today],
  );
  return (
    <section
      className={`rhythm-panel ${zoomed ? "zoomed" : ""}`}
      aria-label="Thời gian đã ghi trong kỳ"
    >
      <div className="rhythm-head">
        <h2>Thời gian dành cho điều gì</h2>
        <span>{formatMinutes(rhythm.minutes)} trong kỳ này</span>
      </div>
      {rhythm.allocation.length ? (
        <>
          <div className="allocation-strip" aria-hidden="true">
            {rhythm.allocation.map((item) => (
              <span
                key={item.id}
                style={{
                  background: item.color,
                  width: `${(item.minutes / rhythm.minutes) * 100}%`,
                }}
              />
            ))}
          </div>
          <div className="allocation-list">
            {rhythm.allocation.map((item) => (
              <div className="allocation-item" key={item.id}>
                <span
                  className="color-dot"
                  style={{ background: item.color }}
                />
                <span>{item.title}</span>
                <strong>{formatMinutes(item.minutes)}</strong>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="muted small">
          Chưa có giờ nào được ghi trong kỳ này. Bấm một ô trên lưới để bắt đầu
          một phiên.
        </p>
      )}
      <h3>Giờ theo tuần</h3>
      <div className="heatmap-scroll">
        <div
          className="heatmap-inner"
          style={{ "--weeks": rhythm.weeks.length } as CSSProperties}
        >
          <div className="rhythm-bars">
            {rhythm.weeks.map((week) => (
              <button
                key={week.key}
                className={week.future ? "future-bar" : ""}
                title={`${formatDate(week.start)} – ${formatDate(week.end, true)} · ${formatMinutes(week.minutes)}`}
                aria-label={`Tuần ${formatDate(week.start, true)}: ${formatMinutes(week.minutes)}`}
                onClick={() => onWeek(week.start)}
              >
                <span className="bar-stack">
                  {week.segments.map((segment) => (
                    <i
                      key={segment.id}
                      style={{
                        background: segment.color,
                        height: `${(segment.minutes / rhythm.peak) * 100}%`,
                      }}
                    />
                  ))}
                </span>
              </button>
            ))}
          </div>
          <div className="month-labels rhythm-months">
            {semester.months.map((month, i) => (
              <span key={i} style={{ gridColumn: month.column }}>
                {month.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
