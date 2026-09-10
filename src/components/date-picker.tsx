"use client";
import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  addDays,
  dateKey,
  formatDate,
  parseDate,
  todayKey,
} from "@/lib/timeline";
import { monday, validDate } from "@/lib/planning";

export default function DatePicker({
  label,
  name,
  value,
  onChange,
  min,
  max,
  optional = false,
  defaultOpen = false,
  hideLabel = false,
  display,
}: {
  label: string;
  name?: string;
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  optional?: boolean;
  defaultOpen?: boolean;
  /** Hide the label when the trigger text already says what the field is. */
  hideLabel?: boolean;
  /** Trigger text, when the value alone would not read as the whole answer. */
  display?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(defaultOpen);
  const [month, setMonth] = useState((value || todayKey()).slice(0, 7));
  const grid = useRef<HTMLDivElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLDivElement>(null);
  const [up, setUp] = useState(false);
  // Open upwards when the month would run past the viewport, so the last rows
  // stay reachable even inside a card that clips its overflow.
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = field.current?.getBoundingClientRect();
      const height = popover.current?.offsetHeight;
      if (!anchor || !height) return;
      const below = window.innerHeight - anchor.bottom;
      setUp(below < height + 12 && anchor.top > below);
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);
  const first = `${month}-01`,
    start = monday(first);
  const move = (delta: number) => {
    const d = parseDate(first);
    d.setMonth(d.getMonth() + delta);
    setMonth(dateKey(d).slice(0, 7));
  };
  const choose = (day: string) => {
    onChange(day);
    setOpen(false);
  };
  return (
    <div
      className={`date-field ${hideLabel ? "label-hidden" : ""}`}
      ref={field}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <span id={`${id}-label`} className={hideLabel ? "sr-only" : ""}>
        {label}
      </span>
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        className="date-trigger"
        aria-labelledby={`${id}-label ${id}-value`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setMonth((value || todayKey()).slice(0, 7));
          setOpen(!open);
        }}
      >
        <CalendarDays size={17} />
        <span id={`${id}-value`}>
          {display || (value ? formatDate(value, true) : "Chọn ngày")}
        </span>
      </button>
      {open && (
        <div
          className={`date-popover ${up ? "drop-up" : ""}`}
          id={id}
          ref={popover}
          role="group"
          aria-label={`Lịch ${label}`}
        >
          <div className="calendar-nav">
            <button
              type="button"
              aria-label="Tháng trước"
              onClick={() => move(-1)}
            >
              <ChevronLeft size={18} />
            </button>
            <input
              aria-label="Tháng và năm"
              type="month"
              value={month}
              onChange={(e) => {
                if (e.target.value) setMonth(e.target.value);
              }}
            />
            <button
              type="button"
              aria-label="Tháng sau"
              onClick={() => move(1)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="calendar-grid weekdays">
            {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="calendar-grid" ref={grid}>
            {Array.from({ length: 42 }, (_, i) => addDays(start, i)).map(
              (day) => (
                <button
                  key={day}
                  type="button"
                  data-day={day}
                  disabled={Boolean((min && day < min) || (max && day > max))}
                  aria-label={formatDate(day, true)}
                  aria-pressed={value === day}
                  className={`${day.slice(0, 7) !== month ? "outside" : ""} ${value === day ? "picked" : ""} ${day === todayKey() ? "is-today" : ""}`}
                  onClick={() => choose(day)}
                  onKeyDown={(e) => {
                    const delta: Record<string, number> = {
                      ArrowLeft: -1,
                      ArrowRight: 1,
                      ArrowUp: -7,
                      ArrowDown: 7,
                    };
                    if (e.key in delta) {
                      e.preventDefault();
                      const next = addDays(day, delta[e.key]);
                      grid.current
                        ?.querySelector<HTMLButtonElement>(
                          `[data-day="${next}"]`,
                        )
                        ?.focus();
                    }
                  }}
                >
                  {Number(day.slice(-2))}
                </button>
              ),
            )}
          </div>
          <div className="calendar-bottom">
            <button
              type="button"
              disabled={Boolean(
                (min && todayKey() < min) || (max && todayKey() > max),
              )}
              onClick={() => choose(todayKey())}
            >
              Hôm nay
            </button>
            {optional && (
              <button type="button" onClick={() => choose("")}>
                Bỏ ngày
              </button>
            )}
          </div>
          <input
            aria-label={`Nhập ${label}`}
            type="date"
            value={value}
            min={min}
            max={max}
            onChange={(e) => {
              if (validDate(e.target.value)) onChange(e.target.value);
            }}
          />
        </div>
      )}
    </div>
  );
}
