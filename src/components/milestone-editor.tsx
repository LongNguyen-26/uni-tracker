"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import DatePicker from "./date-picker";
import type { GoalStep } from "@/lib/timeline";

export default function MilestoneEditor({
  value,
  onChange,
  checklist = false,
}: {
  value: GoalStep[];
  onChange: (steps: GoalStep[]) => void;
  checklist?: boolean;
}) {
  const [expanded, setExpanded] = useState(
    checklist || value.some((s) => !s.is_final),
  );
  const final = value.find((s) => s.is_final) || {
    id: "final-deadline",
    title: "Hạn hoàn thành",
    done: false,
    is_final: true,
    counts_for_progress: false,
  };
  function update(step: GoalStep, patch: Partial<GoalStep>) {
    const next = { ...step, ...patch };
    onChange(
      value.some((s) => s.id === step.id)
        ? value.map((s) => (s.id === step.id ? next : s))
        : [...value, next],
    );
  }
  function dates(step: GoalStep) {
    const mode = step.timing_mode || "fixed";
    return (
      <>
        <label>
          Thời gian
          <select
            value={mode}
            onChange={(e) =>
              update(step, {
                timing_mode: e.target.value as GoalStep["timing_mode"],
                end_date:
                  e.target.value === "fixed" ? step.date : step.end_date,
              })
            }
          >
            <option value="fixed">Ngày đã chốt</option>
            <option value="window">Khoảng đã xác định</option>
            <option value="flexible">Khoảng dự kiến, chưa chốt ngày</option>
          </select>
        </label>
        <div className="form-row">
          <DatePicker
            label={
              step.is_final ? "Hạn hoàn thành (tùy chọn)" : "Ngày (tùy chọn)"
            }
            optional
            value={step.date || ""}
            onChange={(date) =>
              update(step, {
                date: date || null,
                end_date: !date
                  ? null
                  : mode === "fixed" || !step.end_date || step.end_date < date
                    ? date
                    : step.end_date,
              })
            }
          />
          {mode !== "fixed" && (
            <DatePicker
              label="Đến ngày"
              value={step.end_date || step.date || ""}
              min={step.date || undefined}
              onChange={(end_date) => update(step, { end_date })}
            />
          )}
        </div>
        {step.date && (
          <button
            type="button"
            className="text-button"
            onClick={() => update(step, { date: null, end_date: null })}
          >
            Bỏ ngày
          </button>
        )}
      </>
    );
  }
  return (
    <section className="milestone-editor">
      {dates(final)}
      {!final.date && (
        <p className="muted small">
          Chưa chốt hạn. Việc chưa có ngày vẫn theo dõi được trong mục tiêu.
        </p>
      )}
      <p className="muted small">
        Chỉ chọn ngày hoặc khoảng diễn ra: Hackathon 3 ngày, hoặc 1–2 tuần cuối
        tháng nếu chưa có lịch chính xác.
      </p>
      <button
        type="button"
        className="text-button"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded
          ? "Thu gọn danh sách việc & cột mốc"
          : "+ Thêm cột mốc trung gian"}
      </button>
      {expanded && (
        <div className="step-editor">
          {value
            .filter((s) => !s.is_final)
            .map((step, i) => (
              <div className="milestone-edit-row" key={step.id}>
                <div className="step-row">
                  <input
                    type="checkbox"
                    aria-label={`Hoàn thành việc ${i + 1}`}
                    checked={step.done}
                    onChange={(e) => update(step, { done: e.target.checked })}
                  />
                  <input
                    aria-label={`Tên việc ${i + 1}`}
                    placeholder="Abstract, vòng loại, chuẩn bị hồ sơ…"
                    required
                    maxLength={160}
                    value={step.title}
                    onChange={(e) => update(step, { title: e.target.value })}
                  />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Xóa việc ${i + 1}`}
                    onClick={() =>
                      onChange(value.filter((s) => s.id !== step.id))
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <details open={!!step.date}>
                  <summary>
                    {step.date ? "Ngày & ghi chú" : "+ Thêm ngày hoặc ghi chú"}
                  </summary>
                  {dates(step)}
                  <label>
                    Ghi chú
                    <input
                      maxLength={1000}
                      value={step.notes || ""}
                      onChange={(e) => update(step, { notes: e.target.value })}
                    />
                  </label>
                </details>
              </div>
            ))}
          <button
            type="button"
            className="button"
            disabled={value.length >= 100}
            onClick={() =>
              onChange([
                ...value,
                { id: crypto.randomUUID(), title: "", done: false },
              ])
            }
          >
            <Plus size={16} />
            Thêm việc / cột mốc
          </button>
          <p className="muted small">
            {checklist
              ? "Tick hoàn thành cập nhật tiến độ danh sách việc."
              : "Tick cột mốc không thay đổi kết quả số của mục tiêu."}
          </p>
        </div>
      )}
    </section>
  );
}
