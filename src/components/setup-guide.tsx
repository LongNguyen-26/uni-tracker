"use client";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import {
  setupGuidance,
  type SetupCounts,
  type SetupPart,
} from "@/lib/onboarding";
const copy = {
  timetable: {
    title: "Thời khóa biểu",
    hint: "Để biết bạn còn trống giờ nào.",
    unit: "lịch cố định",
    action: "Nhập TKB",
  },
  goals: {
    title: "Mục tiêu học kỳ",
    hint: "Điều bạn muốn đạt được, cùng các việc và cột mốc.",
    unit: "mục tiêu",
    action: "Nhập mục tiêu",
  },
  activities: {
    title: "Kế hoạch tự học",
    hint: "Đưa mục tiêu vào những giờ còn trống.",
    unit: "hoạt động",
    action: "Lập kế hoạch",
  },
};
export default function SetupGuide({
  userId,
  page,
  counts,
  onOpen,
}: {
  userId: string;
  page: "goals" | "planning";
  counts: SetupCounts;
  onOpen: (part: SetupPart | "all") => void;
}) {
  const { order, done, next, title, canPlan } = setupGuidance(counts, page);
  const key = "unitracker:setup-complete:" + userId;
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(key) === "yes";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (done !== 3 || hidden) return;
    const timer = window.setTimeout(() => {
      setHidden(true);
      try {
        localStorage.setItem(key, "yes");
      } catch {
        /* Dismissal still works in this view. */
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, [done, hidden, key]);
  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(key, "yes");
    } catch {
      /* Optional preference. */
    }
  }
  if (done === 3)
    return hidden ? null : (
      <section className="setup-guide-complete" role="status">
        <Check size={18} />
        <p>
          <strong>Xong thiết lập</strong> · {counts.timetable} lịch cố định ·{" "}
          {counts.goals} mục tiêu · {counts.activities} hoạt động
        </p>
        <button className="text-button" onClick={dismiss}>
          Ẩn
        </button>
      </section>
    );
  return (
    <section
      className={`setup-guide ${done === 0 ? "setup-guide-new" : ""}`}
      aria-label="Hoàn tất thiết lập"
    >
      <header>
        <div>
          <h2>{title}</h2>
          {done === 0 && (
            <p>
              Đã có file cả ba?{" "}
              <button className="text-button" onClick={() => onOpen("all")}>
                Nhập một lần <ArrowRight size={14} />
              </button>
            </p>
          )}
        </div>
        <span className="setup-guide-progress">{done}/3</span>
      </header>
      <ol>
        {order.map((part) => {
          const item = copy[part],
            count = counts[part];
          const crossPage =
            part === "goals" ? page !== "goals" : page !== "planning";
          const disabled = part === "activities" && !canPlan;
          const hint = disabled
            ? !counts.goals && !counts.timetable
              ? "Cần thời khóa biểu và mục tiêu trước."
              : !counts.goals
                ? "Thêm mục tiêu trước để xếp giờ."
                : "Thêm thời khóa biểu trước để tìm giờ trống."
            : item.hint;
          return (
            <li key={part} className={count ? "is-done" : ""}>
              <span
                className="setup-guide-check"
                aria-label={count ? "Đã có" : "Chưa có"}
              >
                {count ? <Check size={15} /> : null}
              </span>
              <div className="setup-guide-copy">
                <h3>
                  {item.title}
                  {count ? (
                    <span>
                      {" "}
                      · {count} {item.unit}
                    </span>
                  ) : null}
                </h3>
                {!count && <p>{hint}</p>}
              </div>
              {!disabled && (
                <button
                  className={
                    count
                      ? "text-button"
                      : `button ${next === part ? "primary" : ""}`
                  }
                  onClick={() => onOpen(part)}
                >
                  {count
                    ? "Bổ sung"
                    : part === "goals" && crossPage
                      ? "Thêm mục tiêu"
                      : item.action}
                  {crossPage && (
                    <ArrowUpRight size={15} aria-label="Chuyển trang" />
                  )}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
