"use client";
import { useId, useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import Dialog from "./dialog";
import SessionEditor from "./session-editor";
import { getSupabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/errors";
export { errorMessage } from "@/lib/errors";
import {
  GOAL_COLORS,
  MILESTONE_LABELS,
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

export function ActivityForm(props: {
  activity?: Activity;
  goals: Goal[];
  defaultDate: string;
  onClose: () => void;
  onSave: (data: ActivityInput, id?: string) => Promise<void>;
}) {
  return props.activity && props.activity.kind !== "event" ? (
    <ProgressEntryEditor
      activity={props.activity}
      onClose={props.onClose}
      onSave={props.onSave}
    />
  ) : (
    <SessionEditor
      activity={props.activity}
      goals={props.goals}
      defaultDate={props.defaultDate}
      onClose={props.onClose}
      onSaveActivity={props.onSave}
    />
  );
}
function ProgressEntryEditor({
  activity,
  onClose,
  onSave,
}: {
  activity: Activity;
  onClose: () => void;
  onSave: (data: ActivityInput, id?: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Dialog
      title="Sửa nội dung cập nhật tiến độ"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          try {
            await onSave(
              {
                ...activity,
                title: String(f.get("title")).trim(),
                notes: String(f.get("notes")).trim(),
              },
              activity.id,
            );
            onClose();
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="muted small">
          Chỉ sửa nội dung lịch sử. Kết quả và thước đo được chỉnh trong mục
          tiêu.
        </p>
        <label>
          Nội dung
          <input
            name="title"
            defaultValue={activity.title}
            required
            maxLength={160}
          />
        </label>
        <label>
          Ghi chú
          <textarea
            name="notes"
            defaultValue={activity.notes}
            maxLength={4000}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button disabled={busy} className="button primary">
          Lưu nội dung
        </button>
      </form>
    </Dialog>
  );
}
