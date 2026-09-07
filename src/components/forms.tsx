"use client";
import { useId, useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import Dialog from "./dialog";
import DatePicker from "./date-picker";
import { localDateTime } from "@/lib/planning";
import { getSupabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/errors";
export { errorMessage } from "@/lib/errors";
import {
  GOAL_COLORS,
  MILESTONE_COLORS,
  MILESTONE_LABELS,
  todayKey,
  addDays,
  type MilestoneKind,
  type ActivityInput,
  type Goal,
  type Activity,
} from "@/lib/timeline";

const authEmailEnabled = process.env.NEXT_PUBLIC_AUTH_EMAIL_ENABLED === "true";

export function ColorPicker({
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
export function MilestoneSelect({
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
  const [day, setDay] = useState(activity?.occurred_on || defaultDate);
  const [start, setStart] = useState(
    activity?.started_at ? localDateTime(activity.started_at, true) : "",
  );
  const [end, setEnd] = useState(
    activity?.ended_at ? localDateTime(activity.ended_at, true) : "",
  );
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
      if (
        (start && !end) ||
        (!start && end) ||
        (start &&
          (end <= start ||
            start.slice(0, 10) !== day ||
            (end.slice(0, 10) !== day &&
              end !== `${addDays(day, 1)}T00:00:00`)))
      )
        throw new Error(
          "Giờ bắt đầu và kết thúc cần nằm trong ngày ghi nhận, kết thúc sau bắt đầu.",
        );
      const duration =
        activity && activity.kind !== "event"
          ? 0
          : Number(data.get("duration_minutes") || 0) +
            Number(data.get("duration_seconds") || 0) / 60;
      if (
        duration > 1440 ||
        (start &&
          duration * 60000 >
            new Date(end).getTime() - new Date(start).getTime() + 1000)
      )
        throw new Error(
          "Thời gian thực làm không thể dài hơn khoảng giờ đã nhập.",
        );
      await onSave(
        {
          title,
          started_at: start
            ? activity?.started_at &&
              start === localDateTime(activity.started_at, true)
              ? activity.started_at
              : new Date(start).toISOString()
            : null,
          ended_at: end
            ? activity?.ended_at &&
              end === localDateTime(activity.ended_at, true)
              ? activity.ended_at
              : new Date(end).toISOString()
            : null,
          notes: String(data.get("notes")).trim(),
          occurred_on: day,
          goal_id: goalId || null,
          color,
          duration_minutes: duration,
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
        {activity && activity.kind !== "event" && (
          <p className="muted small">
            Đây là lịch sử cập nhật mục tiêu. Bạn có thể sửa nội dung ghi nhận;
            mức hiện tại được chỉnh trong mục tiêu tương ứng. Bản ghi này không
            cộng vào giờ làm việc.
          </p>
        )}
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
          <DatePicker
            label="Ngày diễn ra"
            value={day}
            onChange={setDay}
            max={todayKey()}
          />
          <label>
            Thời lượng (phút)
            <input
              type="number"
              name="duration_minutes"
              disabled={Boolean(activity && activity.kind !== "event")}
              min={0}
              max={1440}
              step="any"
              defaultValue={
                activity?.duration_minutes
                  ? Math.floor(Math.round(activity.duration_minutes * 60) / 60)
                  : ""
              }
              placeholder="Ví dụ: 60"
            />
          </label>
          <label>
            Giây lẻ
            <input
              type="number"
              name="duration_seconds"
              min={0}
              max={59}
              step={1}
              defaultValue={
                Math.round((activity?.duration_minutes || 0) * 60) % 60
              }
              disabled={Boolean(activity && activity.kind !== "event")}
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            Bắt đầu thực tế (tùy chọn)
            <input
              type="datetime-local"
              step={1}
              value={start}
              onChange={(e) => {
                const next = e.target.value;
                const span =
                  start && end
                    ? new Date(end).getTime() - new Date(start).getTime()
                    : Math.max(1, activity?.duration_minutes || 60) * 60000;
                setStart(next);
                if (next && Number.isFinite(new Date(next).getTime()))
                  setEnd(
                    localDateTime(
                      new Date(new Date(next).getTime() + span).toISOString(),
                      true,
                    ),
                  );
              }}
            />
          </label>
          <label>
            Kết thúc thực tế
            <input
              type="datetime-local"
              step={1}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
        <p className="muted small">
          Nhập thời gian thực tế đã dành cho việc này. Để trống nếu chỉ muốn ghi
          chú. Thời lượng là số phút thực sự làm việc, không tính thời gian nghỉ
          giữa hai mốc giờ.
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
