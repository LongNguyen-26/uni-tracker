"use client";
import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import Dialog from "./dialog";
import DatePicker from "./date-picker";
import { ColorPicker, MilestoneSelect } from "./forms";
import { errorMessage } from "@/lib/errors";
import {
  isGreen,
  academicSettings,
  journeySettings,
  moveSemester,
  timingMode,
  clockMinutes,
  minuteClock,
} from "@/lib/schedule";
import {
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
  const [timing, setTiming] = useState<"fixed" | "window" | "flexible">(
    goal ? timingMode(goal) : "fixed",
  );
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
      if (timing !== "fixed" && !start)
        throw new Error("Hãy chọn ngày đầu của khoảng thời gian.");
      if (
        mode === "checklist" &&
        (!steps.length || steps.some((s) => !s.title.trim()))
      )
        throw new Error("Hãy đặt tên cho ít nhất một cột mốc dự án.");
      if (isGreen(color))
        throw new Error(
          "Hãy chọn màu khác xanh lá; xanh lá được dành cho thương hiệu.",
        );
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
          timing_mode: timing,
          reserved_hours: Number(form.get("reserved_hours") || 0),
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
        <label>
          Thời gian cột mốc
          <select
            value={timing}
            onChange={(e) => setTiming(e.target.value as typeof timing)}
          >
            <option value="fixed">Ngày đã chốt · dấu góc</option>
            <option value="window">Khoảng đã xác định · ví dụ tuần thi</option>
            <option value="flexible">
              Ngày chưa chốt trong khoảng · ví dụ đầu tháng 12
            </option>
          </select>
        </label>
        <div className="form-row">
          <DatePicker
            label={
              timing === "fixed"
                ? "Bắt đầu mục tiêu (tùy chọn)"
                : "Khoảng bắt đầu"
            }
            value={start}
            onChange={(day) => {
              setStart(day);
              if (day && day > end) setEnd(day);
            }}
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
          Nền ô thể hiện giờ đã làm. Cột mốc dùng dấu góc hoặc dải nền riêng,
          không cộng vào năng suất.
        </p>
        {timing !== "fixed" && (
          <label>
            Giờ cần giữ lại mỗi tuần trong khoảng này
            <input
              name="reserved_hours"
              type="number"
              min={0}
              max={168}
              step={0.5}
              defaultValue={goal?.reserved_hours || 0}
            />
            <small>
              Ví dụ giữ 8 giờ/tuần khi có đợt thi. Quỹ này giảm giờ còn trống,
              không tự tạo nhật ký ôn thi.
            </small>
          </label>
        )}
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
  const [years, setYears] = useState(profile.study_years),
    [year, setYear] = useState(profile.start_year);
  const [terms, setTerms] = useState<SemesterSettings[]>(
    journeySettings(profile),
  );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [share, setShare] = useState("");
  const [confirmed, setConfirmed] = useState(profile.confirmed_semesters || []);
  const patch = (i: number, value: Partial<SemesterSettings>) => {
    setTerms((prev) =>
      prev.map((s) => (s.index === i ? { ...s, ...value, breaks: [] } : s)),
    );
    setConfirmed((prev) => [...new Set([...prev, i])]);
  };
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const wake = clockMinutes(String(f.get("wake"))),
        sleep = clockMinutes(String(f.get("sleep")));
      if (sleep <= wake)
        throw new Error("Giờ kết thúc ngày phải sau giờ thức dậy.");
      const p = {
        ...profile,
        display_name: String(f.get("name")).trim(),
        start_year: year,
        start_month: 8,
        study_years: years,
        semester_settings: terms,
        confirmed_semesters: confirmed,
        wake_minutes: wake,
        sleep_minutes: sleep,
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
      description="Các kỳ được ước tính từ năm nhập học. Chỉ cần chỉnh chính xác kỳ bạn đang học."
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
            Năm nhập học
            <input
              type="number"
              min={2000}
              max={2100}
              required
              value={year}
              onChange={(e) => {
                const y = Number(e.target.value);
                setYear(y);
                if (y >= 2000 && y <= 2100) {
                  setTerms(academicSettings(y, years));
                  setConfirmed([]);
                }
              }}
            />
          </label>
          <label>
            Số năm học
            <select
              value={years}
              onChange={(e) => {
                const n = Number(e.target.value);
                setYears(n);
                setTerms(
                  academicSettings(year, n).map((s, i) => terms[i] || s),
                );
                setConfirmed((prev) => prev.filter((i) => i < n * 2));
              }}
            >
              {[4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n} năm
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted small">
          Mẫu ước tính: HK1 tháng 8–1, HK2 tháng 2–6. Ngày bắt đầu luôn là thứ
          Hai. Khi đổi ngày bắt đầu, ngày kết thúc dịch theo cùng thời lượng;
          bạn vẫn có thể sửa ngày kết thúc.
        </p>
        <div className="form-row">
          <label>
            Thức dậy
            <input
              type="time"
              name="wake"
              required
              defaultValue={minuteClock(profile.wake_minutes ?? 420)}
            />
          </label>
          <label>
            Kết thúc ngày
            <input
              type="time"
              name="sleep"
              required
              defaultValue={minuteClock(profile.sleep_minutes ?? 1380)}
            />
          </label>
        </div>
        <div className="semester-settings">
          {terms.map((s, i) => (
            <details
              key={i}
              open={
                todayKey() >= s.start && todayKey() <= s.end ? true : undefined
              }
            >
              <summary>
                Năm {Math.floor(i / 2) + 1} · {s.label} · HK{i + 1} ·{" "}
                {confirmed.includes(i) ? "Đã xác nhận" : "Ước tính, chỉnh được"}
              </summary>
              <div className="form">
                <label>
                  Tên học kỳ
                  <input
                    value={s.label}
                    required
                    maxLength={80}
                    onChange={(e) => patch(i, { label: e.target.value })}
                  />
                </label>
                <div className="form-row">
                  <DatePicker
                    label={`Bắt đầu HK${i + 1}`}
                    value={s.start}
                    onChange={(d) => patch(i, moveSemester(s, d))}
                  />
                  <DatePicker
                    label={`Kết thúc HK${i + 1}`}
                    value={s.end}
                    min={s.start}
                    onChange={(end) => patch(i, { end })}
                  />
                </div>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    setConfirmed((prev) => [...new Set([...prev, i])])
                  }
                >
                  Xác nhận ngày kỳ này
                </button>
              </div>
            </details>
          ))}
        </div>
        <button
          type="button"
          className="button"
          onClick={() => {
            const preset = {
              study_years: years,
              start_year: year,
              semester_settings: terms,
            };
            try {
              validateSemesterSettings(preset);
              setError("");
            } catch (e) {
              setError(errorMessage(e));
              return;
            }
            setShare(
              window.location.origin +
                "/?calendar=" +
                encodeURIComponent(JSON.stringify(preset)),
            );
          }}
        >
          Tạo liên kết mẫu lịch cho bạn cùng trường
        </button>
        {share && (
          <label>
            Liên kết mẫu lịch
            <textarea
              readOnly
              value={share}
              onFocus={(e) => e.target.select()}
            />
            <small>
              Liên kết chỉ chứa lịch học kỳ; không chứa tài khoản, mục tiêu hay
              hoạt động.
            </small>
          </label>
        )}
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
