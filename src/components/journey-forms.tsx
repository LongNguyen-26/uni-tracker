"use client";
import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import Dialog from "./dialog";
import DatePicker from "./date-picker";
import { ColorPicker, MilestoneSelect } from "./forms";
import { errorMessage } from "@/lib/errors";
import {
  buildSemesters,
  CATEGORIES,
  GOAL_COLORS,
  MILESTONE_COLORS,
  todayKey,
  type Goal,
  type GoalInput,
  type GoalStep,
  type MilestoneKind,
  type Profile,
  type Semester,
  type SemesterSettings,
} from "@/lib/timeline";
import {
  calculatedProgress,
  validDate,
  validateSemesterSettings,
} from "@/lib/planning";

export function GoalForm({
  goal,
  defaultDate,
  semesters,
  onClose,
  onSave,
}: {
  goal?: Goal;
  defaultDate: string;
  semesters: Semester[];
  onClose: () => void;
  onSave: (data: GoalInput, id?: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<Goal["tracking_mode"]>(
    goal?.tracking_mode || "numeric",
  );
  const [color, setColor] = useState(goal?.color || GOAL_COLORS[0]);
  const [kind, setKind] = useState<MilestoneKind>(
    goal?.milestone_kind || "general",
  );
  const [progress, setProgress] = useState(goal?.progress || 0);
  const [current, setCurrent] = useState(goal?.metric_current ?? 0);
  const [target, setTarget] = useState(goal?.metric_target ?? 7);
  const [direction, setDirection] = useState<Goal["metric_direction"]>(
    goal?.metric_direction || "increase",
  );
  const [steps, setSteps] = useState<GoalStep[]>(goal?.checklist || []);
  const [start, setStart] = useState(goal?.starts_on || "");
  const [end, setEnd] = useState(goal?.deadline || defaultDate);
  const [completed, setCompleted] = useState(goal?.completed_on || todayKey());
  const [scope, setScope] = useState(goal?.semester_index?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const derived = calculatedProgress({
    tracking_mode: mode,
    metric_current: current,
    metric_target: target,
    metric_direction: direction,
    checklist: steps,
    progress,
  });
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (!validDate(end) || (start && (!validDate(start) || start > end)))
        throw new Error("Khoảng thời gian chưa hợp lệ.");
      if (
        mode === "checklist" &&
        (!steps.length || steps.some((s) => !s.title.trim()))
      )
        throw new Error("Hãy đặt tên cho ít nhất một cột mốc dự án.");
      const title = String(form.get("title")).trim();
      if (!title) throw new Error("Hãy nhập tên mục tiêu.");
      await onSave(
        {
          title,
          description: String(form.get("description")).trim(),
          category: String(form.get("category")),
          color,
          tracking_mode: mode,
          milestone_kind: mode === "milestone" ? kind : "general",
          starts_on: start || null,
          deadline: end,
          semester_index: scope === "" ? null : Number(scope),
          metric_current: current,
          metric_target: target,
          metric_unit: String(form.get("unit") || "").trim(),
          metric_direction: direction,
          checklist: steps.map((s) => ({ ...s, title: s.title.trim() })),
          progress: derived,
          completed_on: derived === 100 ? completed : null,
        },
        goal?.id,
      );
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={goal ? "Cập nhật mục tiêu" : "Một mục tiêu mới"}
      description="Chọn thước đo phù hợp với điều bạn muốn đạt được."
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <form className="form" onSubmit={submit}>
        <label>
          Tên mục tiêu
          <input
            name="title"
            required
            maxLength={160}
            defaultValue={goal?.title}
            placeholder="IELTS 7.0, GPA 3.5+ HK3, Paper ICDAR…"
          />
        </label>
        <fieldset className="tracking-choice">
          <legend>Cách theo dõi</legend>
          <div>
            {(
              [
                [
                  "numeric",
                  "Mức hiện tại → mục tiêu",
                  "IELTS, GPA, số bài đọc",
                ],
                [
                  "checklist",
                  "Dự án có cột mốc",
                  "Tự tính từ các bước đã xong",
                ],
                ["progress", "Phần trăm tự nhập", "Khi bạn có cách đo riêng"],
                [
                  "milestone",
                  "Một sự kiện / thành tựu",
                  "Thi GK, CK, giải Hackathon",
                ],
              ] as const
            ).map(([value, label, hint]) => (
              <button
                key={value}
                type="button"
                className={mode === value ? "selected" : ""}
                aria-pressed={mode === value}
                onClick={() => {
                  setMode(value);
                  if (value === "milestone")
                    setProgress(progress === 100 ? 100 : 0);
                }}
              >
                <strong>{label}</strong>
                <span>{hint}</span>
              </button>
            ))}
          </div>
        </fieldset>
        {mode === "numeric" && (
          <>
            <div className="form-row">
              <label>
                Mức hiện tại
                <input
                  type="number"
                  step="any"
                  min={-1e9}
                  max={1e9}
                  required
                  value={current}
                  onChange={(e) => setCurrent(Number(e.target.value))}
                />
              </label>
              <label>
                Mức mục tiêu
                <input
                  type="number"
                  step="any"
                  min={-1e9}
                  max={1e9}
                  required
                  value={target}
                  onChange={(e) => setTarget(Number(e.target.value))}
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                Đơn vị
                <input
                  name="unit"
                  maxLength={30}
                  defaultValue={goal?.metric_unit}
                  placeholder="band, GPA, bài…"
                />
              </label>
              <label>
                Đạt khi
                <select
                  value={direction}
                  onChange={(e) =>
                    setDirection(e.target.value as typeof direction)
                  }
                >
                  <option value="increase">Bằng hoặc cao hơn mục tiêu</option>
                  <option value="decrease">Bằng hoặc thấp hơn mục tiêu</option>
                </select>
              </label>
            </div>
          </>
        )}
        {mode === "checklist" && (
          <div className="step-editor">
            <div className="section-row">
              <strong>Cột mốc dự án · {derived}%</strong>
              <button
                className="text-button"
                type="button"
                onClick={() =>
                  setSteps(
                    [
                      "Đề cương",
                      "Thực nghiệm",
                      "Viết bản thảo",
                      "Nộp Paper",
                    ].map((title) => ({
                      id: crypto.randomUUID(),
                      title,
                      done: false,
                    })),
                  )
                }
              >
                Dùng mẫu Paper
              </button>
            </div>
            {steps.map((s, i) => (
              <div className="step-row" key={s.id}>
                <input
                  aria-label={`Hoàn thành bước ${i + 1}`}
                  type="checkbox"
                  checked={s.done}
                  onChange={(e) =>
                    setSteps(
                      steps.map((x) =>
                        x.id === s.id ? { ...x, done: e.target.checked } : x,
                      ),
                    )
                  }
                />
                <input
                  aria-label={`Tên bước ${i + 1}`}
                  required
                  maxLength={160}
                  value={s.title}
                  onChange={(e) =>
                    setSteps(
                      steps.map((x) =>
                        x.id === s.id ? { ...x, title: e.target.value } : x,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Xóa bước ${i + 1}`}
                  onClick={() => setSteps(steps.filter((x) => x.id !== s.id))}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <button
              className="button"
              type="button"
              disabled={steps.length >= 100}
              onClick={() =>
                setSteps([
                  ...steps,
                  { id: crypto.randomUUID(), title: "", done: false },
                ])
              }
            >
              <Plus size={16} />
              Thêm cột mốc
            </button>
          </div>
        )}
        {mode === "progress" && (
          <label>
            Tiến độ hiện tại · {progress}%
            <input
              aria-label="Tiến độ hiện tại"
              type="range"
              min={0}
              max={100}
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
            />
          </label>
        )}
        {mode === "milestone" && (
          <>
            <MilestoneSelect
              value={kind}
              onChange={(v) => {
                setKind(v);
                setColor(MILESTONE_COLORS[v]);
              }}
            />
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={progress === 100}
                onChange={(e) => setProgress(e.target.checked ? 100 : 0)}
              />
              Đã đạt cột mốc này
            </label>
          </>
        )}
        <ColorPicker color={color} onChange={setColor} />
        <div className="form-row">
          <label>
            Lĩnh vực
            <select
              name="category"
              defaultValue={goal?.category || CATEGORIES[0]}
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Phạm vi học kỳ
            <select
              value={scope}
              onChange={(e) => {
                setScope(e.target.value);
                const s = semesters[Number(e.target.value)];
                if (e.target.value !== "" && s) {
                  setStart(s.start);
                  setEnd(s.end);
                }
              }}
            >
              <option value="">Nhiều kỳ / tự chọn khoảng ngày</option>
              {semesters.map((s) => (
                <option key={s.index} value={s.index}>
                  Năm {s.year} · {s.label} (HK{s.index + 1})
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-row">
          <DatePicker
            label="Bắt đầu (tùy chọn)"
            value={start}
            onChange={setStart}
            max={end}
            optional
          />
          <DatePicker
            label="Hạn hoàn thành"
            value={end}
            onChange={setEnd}
            min={start || undefined}
          />
        </div>
        <p className="muted small">
          Chọn hai ngày để thể hiện khoảng thực hiện. Chỉ chọn hạn nếu đây là
          một mốc duy nhất.
        </p>
        {derived === 100 && (
          <DatePicker
            label="Ngày hoàn thành"
            value={completed}
            onChange={setCompleted}
            max={todayKey()}
          />
        )}
        <label>
          Ghi chú
          <textarea
            name="description"
            rows={3}
            maxLength={4000}
            defaultValue={goal?.description}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            className="button"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            Hủy
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Đang lưu…" : "Lưu mục tiêu"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function SettingsForm({
  profile,
  onSave,
  onClose,
}: {
  profile: Profile;
  onSave: (data: Profile) => Promise<void>;
  onClose: () => void;
}) {
  const [years, setYears] = useState(profile.study_years);
  const [year, setYear] = useState(profile.start_year);
  const [month, setMonth] = useState(profile.start_month);
  const defaults = (y: number, m: number, n: number) =>
    buildSemesters(y, m, n).map(({ index, start, end, label, breaks }) => ({
      index,
      start,
      end,
      label,
      breaks,
    }));
  const [terms, setTerms] = useState<SemesterSettings[]>(
    profile.semester_settings.length
      ? profile.semester_settings
      : defaults(year, month, years),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const patch = (i: number, value: Partial<SemesterSettings>) =>
    setTerms(terms.map((s, j) => (i === j ? { ...s, ...value } : s)));
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const p = {
        ...profile,
        display_name: String(form.get("name")).trim(),
        start_year: year,
        start_month: month,
        study_years: years,
        semester_settings: terms,
      };
      validateSemesterSettings(p);
      await onSave(p);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="Cài đặt hành trình"
      description="Giữ ngày học thực tế của trường. Khung lịch luôn đủ tuần T2–CN."
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <form className="form" onSubmit={submit}>
        <label>
          Tên hiển thị
          <input
            name="name"
            required
            maxLength={80}
            defaultValue={profile.display_name}
          />
        </label>
        <div className="form-row">
          <label>
            Số năm học
            <select
              value={years}
              onChange={(e) => {
                const n = Number(e.target.value);
                setYears(n);
                const d = defaults(year, month, n);
                setTerms(d.map((s, i) => terms[i] || s));
              }}
            >
              {[4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n} năm · {n * 2} học kỳ
                </option>
              ))}
            </select>
          </label>
          <label>
            Năm nhập học
            <input
              type="number"
              required
              min={2000}
              max={2100}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </label>
          <label>
            Tháng nhập học
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i + 1}>
                  Tháng {i + 1}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          className="button"
          type="button"
          onClick={() => setTerms(defaults(year, month, years))}
        >
          Tạo lại các kỳ 6 tháng từ mốc nhập học
        </button>
        <p className="muted small">
          Chỉnh riêng từng kỳ bên dưới; có thể để khoảng nghỉ giữa hai kỳ. Đổi
          số năm hoặc lịch không xóa mục tiêu và nhật ký.
        </p>
        <div className="semester-settings">
          {terms.map((s, i) => (
            <details key={i} open={i === 0 ? true : undefined}>
              <summary>
                Năm {Math.floor(i / 2) + 1} · {s.label} · HK{i + 1}
              </summary>
              <div className="form">
                <label>
                  Tên học kỳ
                  <input
                    required
                    maxLength={80}
                    value={s.label}
                    onChange={(e) => patch(i, { label: e.target.value })}
                  />
                </label>
                <div className="form-row">
                  <DatePicker
                    label={`Bắt đầu HK${i + 1}`}
                    value={s.start}
                    onChange={(start) => patch(i, { start })}
                  />
                  <DatePicker
                    label={`Kết thúc HK${i + 1}`}
                    value={s.end}
                    onChange={(end) => patch(i, { end })}
                    min={s.start}
                  />
                </div>
                {s.breaks.map((b, j) => (
                  <div key={j} className="holiday-editor">
                    <label>
                      Tên kỳ nghỉ
                      <input
                        required
                        maxLength={80}
                        value={b.label}
                        onChange={(e) =>
                          patch(i, {
                            breaks: s.breaks.map((h, k) =>
                              k === j ? { ...h, label: e.target.value } : h,
                            ),
                          })
                        }
                      />
                    </label>
                    <div className="form-row">
                      <DatePicker
                        label="Nghỉ từ"
                        value={b.start}
                        onChange={(start) =>
                          patch(i, {
                            breaks: s.breaks.map((h, k) =>
                              k === j ? { ...h, start } : h,
                            ),
                          })
                        }
                        min={s.start}
                        max={s.end}
                      />
                      <DatePicker
                        label="Nghỉ đến"
                        value={b.end}
                        onChange={(end) =>
                          patch(i, {
                            breaks: s.breaks.map((h, k) =>
                              k === j ? { ...h, end } : h,
                            ),
                          })
                        }
                        min={b.start}
                        max={s.end}
                      />
                    </div>
                    <button
                      className="text-button"
                      type="button"
                      onClick={() =>
                        patch(i, { breaks: s.breaks.filter((_, k) => k !== j) })
                      }
                    >
                      Xóa kỳ nghỉ
                    </button>
                  </div>
                ))}
                <button
                  className="button"
                  type="button"
                  disabled={s.breaks.length >= 30}
                  onClick={() =>
                    patch(i, {
                      breaks: [
                        ...s.breaks,
                        { label: "Nghỉ lễ", start: s.start, end: s.start },
                      ],
                    })
                  }
                >
                  <Plus size={15} />
                  Thêm kỳ nghỉ
                </button>
              </div>
            </details>
          ))}
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary" disabled={busy}>
          {busy ? "Đang lưu…" : "Lưu thay đổi"}
        </button>
      </form>
    </Dialog>
  );
}
