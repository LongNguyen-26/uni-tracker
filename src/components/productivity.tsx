"use client";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import {
  formatMinutes,
  periodBounds,
  productivity,
  shiftPeriod,
} from "@/lib/focus";
import { formatDate, type Activity, type Goal } from "@/lib/timeline";

export default function ProductivityPanel({
  activities,
  goals,
  today,
  onDay,
}: {
  activities: Activity[];
  goals: Goal[];
  today: string;
  onDay: (day: string) => void;
}) {
  const [mode, setMode] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(today);
  const { start, end } = periodBounds(anchor, mode);
  const report = useMemo(
    () => productivity(activities, goals, start, end, today),
    [activities, goals, start, end, today],
  );
  const maxMinutes = Math.max(60, ...report.days.map((d) => d.minutes));
  return (
    <section className="focus-panel" aria-label="Nhịp học và làm việc">
      <div className="focus-heading">
        <div>
          <span className="eyebrow">ĐỀU ĐẶN TẠO NÊN KHÁC BIỆT</span>
          <h2>Nhịp học & làm việc</h2>
        </div>
        <div className="segmented" aria-label="Khoảng thống kê">
          {(
            [
              ["week", "Tuần"],
              ["month", "Tháng"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              aria-pressed={mode === id}
              className={mode === id ? "selected" : ""}
              onClick={() => setMode(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="period-nav">
        <button
          className="icon-button"
          aria-label="Kỳ trước"
          onClick={() => setAnchor(shiftPeriod(anchor, mode, -1))}
        >
          <ChevronLeft size={17} />
        </button>
        <strong>
          {formatDate(start, true)} – {formatDate(end, true)}
        </strong>
        <button
          className="icon-button"
          aria-label="Kỳ sau"
          disabled={end >= today}
          onClick={() => setAnchor(shiftPeriod(anchor, mode, 1))}
        >
          <ChevronRight size={17} />
        </button>
        <button className="text-button" onClick={() => setAnchor(today)}>
          Hiện tại
        </button>
      </div>
      <div className="focus-body">
        <div className="focus-overview">
          <div className="focus-numbers">
            <div>
              <span>Thời gian đã ghi</span>
              <strong>
                <Clock3 size={18} />
                {formatMinutes(report.minutes)}
              </strong>
            </div>
            <div>
              <span>Ngày duy trì</span>
              <strong>
                {report.activeDays}
                <small>/ {report.elapsedDays} ngày đã qua</small>
              </strong>
            </div>
          </div>
          <div
            className={`focus-chart ${mode}`}
            aria-label="Thời gian theo ngày"
          >
            {report.days.map((d) => (
              <button
                key={d.date}
                className={d.date > today ? "future-bar" : ""}
                aria-label={`${formatDate(d.date, true)}: ${formatMinutes(d.minutes)}, ${d.count} hoạt động`}
                title={`${formatDate(d.date, true)} · ${formatMinutes(d.minutes)} · ${d.count} hoạt động`}
                onClick={() => onDay(d.date)}
              >
                <span className="bar-slot">
                  <i
                    style={{
                      height: `${d.minutes ? Math.max(5, (d.minutes / maxMinutes) * 100) : d.count ? 4 : 0}%`,
                    }}
                  />
                </span>
                <span className="bar-day">{Number(d.date.slice(8))}</span>
              </button>
            ))}
          </div>
          <p className="muted small">
            Ngày có ghi hoạt động được tính vào độ đều đặn.{" "}
            {report.untimed
              ? `${report.untimed} hoạt động chưa ghi thời lượng.`
              : "Chỉ cộng thời gian bạn nhập; không quy đổi từ % tiến độ."}
          </p>
        </div>
        <div className="time-allocation">
          <h3>Thời gian dành cho điều gì?</h3>
          {report.allocation.length ? (
            <>
              <div className="allocation-strip" aria-hidden="true">
                {report.allocation.map((item) => (
                  <span
                    key={item.id}
                    style={{
                      background: item.color,
                      width: `${(item.minutes / report.minutes) * 100}%`,
                    }}
                  />
                ))}
              </div>
              <div className="allocation-list">
                {report.allocation.map((item) => (
                  <div className="allocation-item" key={item.id}>
                    <span
                      className="color-dot"
                      style={{ background: item.color }}
                    />
                    <span>{item.title}</span>
                    <strong>
                      {formatMinutes(item.minutes)}
                      <small>
                        {Math.round((item.minutes / report.minutes) * 100)}%
                      </small>
                    </strong>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="muted small allocation-empty">
              Ghi thời lượng và gắn hoạt động với IELTS, Paper hoặc dự án để
              thấy cách bạn phân bổ thời gian.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
