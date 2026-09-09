"use client";
import { useEffect, useRef, useState } from "react";
import { CircleHelp } from "lucide-react";
import type { Goal, Profile, Semester } from "@/lib/timeline";
import { showJourneyIntro } from "@/lib/journey-view";

const HELP = "Mỗi ô là một ngày. Bấm vào ô để xem mọi hoạt động và deadline.";
export default function JourneyToolbar({
  profile,
  semesters,
  currentSemester,
  zoom,
  onZoom,
  goals,
  hidden,
  onHidden,
}: {
  profile: Profile;
  semesters: Semester[];
  currentSemester?: Semester;
  zoom: string;
  onZoom: (value: string) => void;
  goals: Goal[];
  hidden: string[];
  onHidden: (value: string[]) => void;
}) {
  const [intro, setIntro] = useState(false),
    [help, setHelp] = useState(false),
    [open, setOpen] = useState(false);
  const counted = useRef(false);
  useEffect(() => {
    if (counted.current) return;
    const timer = window.setTimeout(() => {
      if (counted.current) return;
      counted.current = true;
      try {
        const key = "unitracker:journey-visits:" + profile.id,
          prior = Number(localStorage.getItem(key) || 0);
        setIntro(showJourneyIntro(prior));
        localStorage.setItem(key, String(Math.min(3, prior + 1)));
      } catch {
        setIntro(true);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [profile.id]);
  const active = goals.filter((g) => g.progress < 100),
    completed = goals.filter((g) => g.progress === 100);
  const selected = goals.filter((g) => !hidden.includes(g.id));
  const item = (g: Goal) => (
    <label key={g.id}>
      <input
        type="checkbox"
        checked={!hidden.includes(g.id)}
        onChange={(e) =>
          onHidden(
            e.target.checked
              ? hidden.filter((id) => id !== g.id)
              : [...hidden, g.id],
          )
        }
      />
      <span className="color-dot" style={{ background: g.color }} />
      {g.title}
    </label>
  );
  return (
    <>
      <div className="journey-toolbar">
        <div className="journey-heading">
          <div>
            <h2>
              {zoom === "all"
                ? `Toàn cảnh ${profile.study_years} năm`
                : "Tiến trình kỳ học"}
            </h2>
            <span>
              {profile.start_year} – {profile.start_year + profile.study_years}
            </span>
          </div>
          <button
            className="icon-button"
            aria-label="Hướng dẫn đọc hành trình"
            aria-expanded={help}
            title={HELP}
            onClick={() => setHelp(!help)}
          >
            <CircleHelp size={17} />
          </button>
        </div>
        <select
          aria-label="Hành trình hoặc học kỳ"
          value={zoom}
          onChange={(e) => onZoom(e.target.value)}
        >
          <option value="all">Toàn bộ hành trình</option>
          {semesters.map((s) => (
            <option key={s.index} value={s.index}>
              Năm {s.year} · HK{s.term}
            </option>
          ))}
        </select>
        <div
          className="goal-filter-menu"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          <button
            className="button"
            aria-label="Lọc mục tiêu và xem chú thích màu"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {selected.length === goals.length
              ? "Tất cả mục tiêu"
              : `${selected.length}/${goals.length} mục tiêu`}{" "}
            ▾
          </button>
          {open && (
            <div className="goal-filter-options">
              <div className="row-actions">
                <button
                  className="text-button"
                  onClick={() =>
                    onHidden(
                      hidden.filter((id) => !goals.some((g) => g.id === id)),
                    )
                  }
                >
                  Chọn tất cả
                </button>
                <button
                  className="text-button"
                  onClick={() =>
                    onHidden([
                      ...new Set([...hidden, ...goals.map((g) => g.id)]),
                    ])
                  }
                >
                  Bỏ chọn
                </button>
              </div>
              {active.map(item)}
              {!!completed.length && (
                <details>
                  <summary>+{completed.length} mục tiêu đã hoàn thành</summary>
                  {completed.map(item)}
                </details>
              )}
              {!goals.length && (
                <p className="muted small">Chưa có mục tiêu trong kỳ này.</p>
              )}
            </div>
          )}
        </div>
        {currentSemester && (
          <button
            className="text-button"
            onClick={() => onZoom(String(currentSemester.index))}
          >
            Về kỳ hiện tại
          </button>
        )}
      </div>
      {(intro || help) && <p className="muted small journey-intro">{HELP}</p>}
    </>
  );
}
