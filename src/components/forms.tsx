"use client";
import { useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import Dialog from "./dialog";
import { getSupabase } from "@/lib/supabase";
import {
  CATEGORIES,
  todayKey,
  type Goal,
  type Activity,
  type Profile,
} from "@/lib/timeline";

export function errorMessage(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : String((error as { message?: string })?.message || error);
  if (message.includes("Invalid login"))
    return "Email hoặc mật khẩu chưa đúng.";
  if (message.includes("Email not confirmed"))
    return "Bạn hãy xác nhận email trước khi đăng nhập.";
  if (message.includes("rate limit"))
    return "Bạn thao tác quá nhanh. Hãy thử lại sau ít phút.";
  if (message.includes("Failed to fetch") || message.includes("fetch failed"))
    return "Không thể kết nối. Hãy kiểm tra mạng và thử lại.";
  if (message.includes("already registered"))
    return "Email này đã đăng ký. Hãy đăng nhập.";
  return message;
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
          <label>
            Mật khẩu
            <input
              name="password"
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              placeholder="Tối thiểu 8 ký tự"
              minLength={8}
              required
              maxLength={128}
            />
          </label>
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
        {mode === "login" && (
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
  onSave: (
    data: Pick<
      Goal,
      | "title"
      | "description"
      | "category"
      | "deadline"
      | "progress"
      | "completed_on"
    >,
    id?: string,
  ) => Promise<void>;
}) {
  const [progress, setProgress] = useState(goal?.progress || 0);
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
  defaultDate,
  onClose,
  onSave,
}: {
  activity?: Activity;
  defaultDate: string;
  onClose: () => void;
  onSave: (
    data: Pick<Activity, "title" | "notes" | "occurred_on">,
    id?: string,
  ) => Promise<void>;
}) {
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
