"use client";
import { useId, useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import Dialog from "./dialog";
import { getSupabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/errors";
export { errorMessage } from "@/lib/errors";
import {
  CATEGORIES,
  GOAL_COLORS,
  MILESTONE_COLORS,
  MILESTONE_LABELS,
  todayKey,
  type MilestoneKind,
  type GoalInput,
  type ActivityInput,
  type Goal,
  type Activity,
  type Profile,
} from "@/lib/timeline";

const authEmailEnabled = process.env.NEXT_PUBLIC_AUTH_EMAIL_ENABLED === "true";

function ColorPicker({
  color,
  onChange,
}: {
  color: string;
  onChange: (color: string) => void;
}) {
  return (
    <fieldset className="color-picker">
      <legend>Màu trên timeline</legend>
      <div>
        {GOAL_COLORS.map((value) => (
          <button
            type="button"
            key={value}
            style={{ background: value }}
            aria-label={`Chọn màu ${value}`}
            aria-pressed={color.toLowerCase() === value}
            onClick={() => onChange(value)}
          >
            {color.toLowerCase() === value ? "✓" : ""}
          </button>
        ))}
        <label className="custom-color">
          Tùy chọn
          <input
            type="color"
            aria-label="Màu tùy chọn"
            value={color}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      </div>
    </fieldset>
  );
}
function MilestoneSelect({
  value,
  onChange,
}: {
  value: MilestoneKind;
  onChange: (value: MilestoneKind) => void;
}) {
  return (
    <label>
      Loại cột mốc
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as MilestoneKind)}
      >
        {Object.entries(MILESTONE_LABELS).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

function PasswordField({ login }: { login: boolean }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-field">
      <label htmlFor={id}>Mật khẩu</label>
      <div className="password-control">
        <input
          id={id}
          name="password"
          type={visible ? "text" : "password"}
          autoComplete={login ? "current-password" : "new-password"}
          placeholder={login ? "Nhập mật khẩu" : "Tối thiểu 8 ký tự"}
          minLength={login ? undefined : 8}
          required
          maxLength={128}
        />
        <button
          className="password-toggle icon-button"
          type="button"
          aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
          aria-pressed={visible}
          aria-controls={id}
          title={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
          onClick={() => setVisible((previous) => !previous)}
        >
          {visible ? (
            <EyeOff size={19} aria-hidden="true" />
          ) : (
            <Eye size={19} aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}
function Submit({
  busy,
  children,
}: {
  busy: boolean;
  children: React.ReactNode;
}) {
  return (
    <button className="button primary" type="submit" disabled={busy}>
      {busy ? <LoaderCircle className="spin" size={17} /> : null}
      {children}
    </button>
  );
}

export function AuthForm({
  onClose,
  recovery = false,
}: {
  onClose: () => void;
  recovery?: boolean;
}) {
  const [mode, setMode] = useState<"login" | "signup" | "forgot" | "recovery">(
    recovery ? "recovery" : "login",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const data = new FormData(e.currentTarget);
    try {
      const db = getSupabase();
      if (!db)
        throw new Error(
          "Đăng nhập chưa được cấu hình. Bạn có thể khám phá bản xem thử trong lúc chờ.",
        );
      const email = String(data.get("email") || "").trim();
      const password = String(data.get("password") || "");
      if (mode === "login") {
        const result = await db.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
        onClose();
      }
      if (mode === "signup") {
        const result = await db.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: String(data.get("name")).trim() },
            emailRedirectTo: window.location.origin,
          },
        });
        if (result.error) throw result.error;
        if (result.data.session) onClose();
        else
          setMessage(
            "Hãy mở email xác nhận tài khoản, rồi quay lại đây đăng nhập. Nếu chưa thấy, kiểm tra thư rác.",
          );
      }
      if (mode === "forgot") {
        const result = await db.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (result.error) throw result.error;
        setMessage(
          "Nếu email đã đăng ký, bạn sẽ nhận được liên kết đặt lại mật khẩu.",
        );
      }
      if (mode === "recovery") {
        const result = await db.auth.updateUser({ password });
        if (result.error) throw result.error;
        onClose();
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  const title = {
    login: "Chào mừng bạn trở lại",
    signup: "Bắt đầu hành trình của bạn",
    forgot: "Quên mật khẩu?",
    recovery: "Đặt mật khẩu mới",
  }[mode];
  return (
    <Dialog
      title={title}
      description="Lưu hành trình riêng và tiếp tục trên mọi thiết bị."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="form" onSubmit={submit}>
        {mode === "signup" && (
          <label>
            Tên của bạn
            <input
              name="name"
              autoComplete="name"
              placeholder="Nguyễn Minh Anh"
              required
              maxLength={80}
            />
          </label>
        )}
        {mode !== "recovery" && (
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              placeholder="ban@example.com"
              required
            />
          </label>
        )}
        {mode !== "forgot" && (
          <PasswordField key={mode} login={mode === "login"} />
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="form-success" role="status">
            {message}
          </p>
        )}
        <Submit busy={busy}>
          {mode === "signup"
            ? "Tạo tài khoản"
            : mode === "login"
              ? "Đăng nhập"
              : mode === "forgot"
                ? "Gửi liên kết"
                : "Lưu mật khẩu"}
          <ArrowRight size={17} />
        </Submit>
        {mode === "login" && authEmailEnabled && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setMode("forgot");
              setError("");
              setMessage("");
            }}
          >
            Quên mật khẩu?
          </button>
        )}
        {!authEmailEnabled && mode === "login" && (
          <p className="muted small">
            Khôi phục mật khẩu qua email tạm chưa khả dụng.
          </p>
        )}
        {mode !== "recovery" && (
          <p className="form-switch">
            {mode === "login" ? "Chưa có tài khoản? " : "Đã có tài khoản? "}
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setError("");
                setMessage("");
              }}
            >
              {mode === "login" ? "Đăng ký" : "Đăng nhập"}
            </button>
          </p>
        )}
      </form>
    </Dialog>
  );
}

export function GoalForm({
  goal,
  defaultDate,
  onClose,
  onSave,
}: {
  goal?: Goal;
  defaultDate: string;
  onClose: () => void;
  onSave: (data: GoalInput, id?: string) => Promise<void>;
}) {
  const [progress, setProgress] = useState(goal?.progress || 0);
  const [trackingMode, setTrackingMode] = useState<Goal["tracking_mode"]>(
    goal?.tracking_mode || "progress",
  );
  const [milestoneKind, setMilestoneKind] = useState<MilestoneKind>(
    goal?.milestone_kind || "general",
  );
  const [color, setColor] = useState(goal?.color || GOAL_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const title = String(data.get("title")).trim();
      if (!title) throw new Error("Hãy nhập tên mục tiêu.");
      await onSave(
        {
          title,
          description: String(data.get("description")).trim(),
          category: String(data.get("category")),
          deadline: String(data.get("deadline")),
          progress,
          color,
          tracking_mode: trackingMode,
          milestone_kind:
            trackingMode === "milestone" ? milestoneKind : "general",
          completed_on:
            progress === 100 ? String(data.get("completed_on")) : null,
        },
        goal?.id,
      );
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={goal ? "Cập nhật mục tiêu" : "Một mục tiêu mới"}
      description="Mỗi bước nhỏ đều đưa bạn tiến về phía trước."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="form" onSubmit={submit}>
        <label>
          Tên mục tiêu
          <input
            name="title"
            defaultValue={goal?.title}
            placeholder="Bạn muốn đạt được điều gì?"
            required
            maxLength={160}
          />
        </label>
        <fieldset className="tracking-choice">
          <legend>Cách theo dõi</legend>
          <div>
            {(
              [
                ["progress", "Theo tiến độ", "IELTS, viết Paper, dự án…"],
                ["milestone", "Một cột mốc", "GPA, thi GK/CK, giải thưởng…"],
              ] as const
            ).map(([mode, label, hint]) => (
              <button
                type="button"
                key={mode}
                className={trackingMode === mode ? "selected" : ""}
                aria-pressed={trackingMode === mode}
                onClick={() => {
                  setTrackingMode(mode);
                  if (mode === "milestone") {
                    setProgress(progress === 100 ? 100 : 0);
                    setColor(MILESTONE_COLORS[milestoneKind]);
                  }
                }}
              >
                <strong>{label}</strong>
                <span>{hint}</span>
              </button>
            ))}
          </div>
        </fieldset>
        {trackingMode === "milestone" && (
          <MilestoneSelect
            value={milestoneKind}
            onChange={(kind) => {
              setMilestoneKind(kind);
              setColor(MILESTONE_COLORS[kind]);
            }}
          />
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
            Hạn hoàn thành
            <input
              name="deadline"
              type="date"
              required
              defaultValue={goal?.deadline || defaultDate}
            />
          </label>
        </div>
        <label>
          Ghi chú
          <textarea
            name="description"
            defaultValue={goal?.description}
            placeholder="Kế hoạch, các bước thực hiện…"
            rows={3}
            maxLength={4000}
          />
        </label>
        {trackingMode === "progress" ? (
          <label className="range-label">
            <span>
              Tiến độ hiện tại <strong>{progress}%</strong>
            </span>
            <input
              aria-label="Tiến độ hiện tại"
              type="range"
              min={0}
              max={100}
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
            />
          </label>
        ) : (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={progress === 100}
              onChange={(e) => setProgress(e.target.checked ? 100 : 0)}
            />
            Đã đạt cột mốc này
          </label>
        )}
        {progress === 100 && (
          <label>
            Ngày hoàn thành
            <input
              name="completed_on"
              type="date"
              defaultValue={goal?.completed_on || todayKey()}
              max={todayKey()}
              required
            />
          </label>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            type="button"
            className="button"
            onClick={onClose}
            disabled={busy}
          >
            Hủy
          </button>
          <Submit busy={busy}>Lưu mục tiêu</Submit>
        </div>
      </form>
    </Dialog>
  );
}

export function ActivityForm({
  activity,
  goals,
  defaultDate,
  onClose,
  onSave,
}: {
  activity?: Activity;
  goals: Goal[];
  defaultDate: string;
  onClose: () => void;
  onSave: (data: ActivityInput, id?: string) => Promise<void>;
}) {
  const [goalId, setGoalId] = useState(activity?.goal_id || "");
  const [color, setColor] = useState(activity?.color || GOAL_COLORS[0]);
  const [isMilestone, setIsMilestone] = useState(
    activity?.is_milestone || false,
  );
  const [milestoneKind, setMilestoneKind] = useState<MilestoneKind>(
    activity?.milestone_kind || "achievement",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const title = String(data.get("title")).trim();
      if (!title) throw new Error("Hãy nhập tên hoạt động.");
      await onSave(
        {
          title,
          notes: String(data.get("notes")).trim(),
          occurred_on: String(data.get("occurred_on")),
          goal_id: goalId || null,
          color,
          duration_minutes: Number(data.get("duration_minutes") || 0),
          is_milestone: isMilestone,
          milestone_kind: isMilestone ? milestoneKind : "general",
        },
        activity?.id,
      );
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={activity ? "Chỉnh sửa hoạt động" : "Ghi lại một bước tiến"}
      description="Một buổi học, một cột mốc, hay một điều đáng nhớ."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="form" onSubmit={submit}>
        <label>
          Hoạt động đã hoàn thành
          <input
            name="title"
            required
            maxLength={160}
            placeholder="Hôm nay bạn đã làm được gì?"
            defaultValue={activity?.title}
          />
        </label>
        <label>
          Gắn với mục tiêu
          <select
            value={goalId}
            onChange={(e) => {
              setGoalId(e.target.value);
              const goal = goals.find((g) => g.id === e.target.value);
              if (goal) setColor(goal.color);
            }}
          >
            <option value="">Không gắn mục tiêu</option>
            {goals.map((g) => (
              <option value={g.id} key={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </label>
        {activity?.goal_title && !activity.goal_id && (
          <p className="muted small">
            Lịch sử từ mục tiêu đã xóa: {activity.goal_title}
          </p>
        )}
        <div className="form-row">
          <label>
            Ngày diễn ra
            <input
              name="occurred_on"
              type="date"
              required
              max={todayKey()}
              defaultValue={activity?.occurred_on || defaultDate}
            />
          </label>
          <label>
            Thời lượng (phút)
            <input
              type="number"
              name="duration_minutes"
              min={0}
              max={1440}
              step={1}
              defaultValue={activity?.duration_minutes || ""}
              placeholder="Ví dụ: 60"
            />
          </label>
        </div>
        <p className="muted small">
          Nhập thời gian thực tế đã dành cho việc này. Để trống nếu chỉ muốn ghi
          chú.
        </p>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={isMilestone}
            onChange={(e) => {
              setIsMilestone(e.target.checked);
              if (e.target.checked && !goalId)
                setColor(MILESTONE_COLORS[milestoneKind]);
            }}
          />
          Đánh dấu đây là cột mốc đã đạt ★
        </label>
        {isMilestone && (
          <MilestoneSelect
            value={milestoneKind}
            onChange={(kind) => {
              setMilestoneKind(kind);
              if (!goalId) setColor(MILESTONE_COLORS[kind]);
            }}
          />
        )}
        {goalId ? (
          <p className="inherited-color">
            <span className="color-dot" style={{ background: color }} />
            Dùng màu của mục tiêu đã chọn.
          </p>
        ) : (
          <ColorPicker color={color} onChange={setColor} />
        )}
        <label>
          Ghi chú
          <textarea
            name="notes"
            rows={4}
            maxLength={4000}
            placeholder="Lưu lại điều bạn đã học được…"
            defaultValue={activity?.notes}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            type="button"
            className="button"
            onClick={onClose}
            disabled={busy}
          >
            Hủy
          </button>
          <Submit busy={busy}>Lưu hoạt động</Submit>
        </div>
      </form>
    </Dialog>
  );
}

export function SettingsForm({
  profile,
  onClose,
  onSave,
}: {
  profile: Profile;
  onClose: () => void;
  onSave: (data: Profile) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const name = String(data.get("display_name")).trim();
      if (!name) throw new Error("Hãy nhập tên của bạn.");
      await onSave({
        ...profile,
        display_name: name,
        start_year: Number(data.get("start_year")),
        start_month: Number(data.get("start_month")),
      });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="Hành trình của bạn"
      description="Timeline gồm 4 năm, mỗi năm 2 học kỳ liên tiếp, mỗi kỳ 6 tháng."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="form" onSubmit={submit}>
        <label>
          Tên hiển thị
          <input
            name="display_name"
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
              name="start_year"
              min={2000}
              max={2100}
              required
              defaultValue={profile.start_year}
            />
          </label>
          <label>
            Tháng bắt đầu
            <select name="start_month" defaultValue={profile.start_month}>
              {Array.from({ length: 12 }, (_, i) => (
                <option value={i + 1} key={i}>
                  Tháng {i + 1}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted small">
          Đổi mốc nhập học sẽ sắp xếp lại timeline. Mục tiêu và nhật ký đã lưu
          vẫn được giữ nguyên.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <Submit busy={busy}>Lưu thay đổi</Submit>
      </form>
    </Dialog>
  );
}
