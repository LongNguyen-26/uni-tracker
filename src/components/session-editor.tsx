"use client";
import { useRef, useState, type FormEvent } from "react";
import Dialog from "./dialog";
import DatePicker from "./date-picker";
import {
  addDays,
  todayKey,
  type Goal,
  type Activity,
  type ActivityInput,
} from "@/lib/timeline";
import {
  localDateTime,
  repeatedSessions,
  type FocusSession,
  type SessionInput,
} from "@/lib/planning";
import { getSupabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/errors";
import { formatMinutes } from "@/lib/focus";

export const GOAL_REQUIRED =
  "Gắn một mục tiêu để biết thời gian này đang giúp bạn tiến tới điều gì.";

export default function SessionEditor({
  session,
  activity,
  goals,
  defaultDate = todayKey(),
  defaultTime,
  userId,
  onClose,
  onSaved,
  onSaveActivity,
}: {
  session?: FocusSession;
  activity?: Activity;
  goals: Goal[];
  defaultDate?: string;
  defaultTime?: string;
  userId?: string;
  onClose: () => void;
  onSaved?: () => Promise<void>;
  onSaveActivity?: (data: ActivityInput, id?: string) => Promise<void>;
}) {
  const originalStart = activity?.started_at || session?.scheduled_start;
  const originalEnd = activity?.ended_at || session?.scheduled_end;
  const initialDay =
    activity?.occurred_on ||
    (session
      ? localDateTime(session.scheduled_start).slice(0, 10)
      : defaultDate);
  const [day, setDay] = useState(initialDay);
  const [status, setStatus] = useState<"planned" | "completed">(
    activity ||
      session?.status === "completed" ||
      (!session && initialDay < todayKey())
      ? "completed"
      : "planned",
  );
  const [goalId, setGoalId] = useState(
    activity?.goal_id || session?.goal_id || "",
  );
  const initialTimed = activity
    ? !!activity.started_at
    : session
      ? !session.is_unscheduled
      : !!defaultTime;
  const [timed, setTimed] = useState(initialTimed);
  const initialStart = originalStart
    ? localDateTime(originalStart).slice(11, 16)
    : defaultTime || "09:00";
  const initialEnd = originalEnd
    ? localDateTime(originalEnd).slice(11, 16)
    : "10:00";
  const [start, setStart] = useState(initialStart),
    [end, setEnd] = useState(initialEnd);
  const initialMinutes = Math.ceil(
    activity?.duration_minutes || session?.planned_minutes || 60,
  );
  const [minutes, setMinutes] = useState(initialMinutes),
    [weeks, setWeeks] = useState(1);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const batch = useRef("");
  const old = !!session || !!activity;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!goalId && (!old || !!(activity?.goal_id || session?.goal_id)))
        throw new Error(GOAL_REQUIRED);
      const goal = goals.find((g) => g.id === goalId);
      const content = String(
        new FormData(e.currentTarget).get("content") || "",
      ).trim();
      const title =
        content || goal?.title || activity?.title || session?.title || "Phiên";
      const endDay = end <= start ? addDays(day, 1) : day;
      const timesUnchanged =
        old &&
        timed === initialTimed &&
        day === initialDay &&
        start === initialStart &&
        end === initialEnd;
      const started_at = timed
        ? timesUnchanged && originalStart
          ? originalStart
          : new Date(`${day}T${start}`).toISOString()
        : null;
      const ended_at = timed
        ? timesUnchanged && originalEnd
          ? originalEnd
          : new Date(`${endDay}T${end}`).toISOString()
        : null;
      const span =
        started_at && ended_at
          ? (Date.parse(ended_at) - Date.parse(started_at)) / 60000
          : minutes;
      const duration =
        activity && timesUnchanged && minutes === initialMinutes
          ? Number(activity.duration_minutes)
          : timed
            ? span
            : minutes;
      if (!Number.isFinite(duration) || duration <= 0 || duration > 1440)
        throw new Error("Phiên cần thời lượng lớn hơn 0, tối đa 24 giờ.");
      if (status === "completed" && day > todayKey())
        throw new Error("Ngày đã làm không được ở tương lai.");
      const db = getSupabase();
      if (!db) throw new Error("Hãy đăng nhập để lưu phiên.");
      if (activity && onSaveActivity) {
        await onSaveActivity(
          {
            title,
            goal_id: goalId || null,
            occurred_on: day,
            started_at,
            ended_at,
            duration_minutes: duration,
            notes: activity.notes,
            color: goal?.color || activity.color,
            is_milestone: activity.is_milestone,
            milestone_kind: activity.milestone_kind,
          },
          activity.id,
        );
      } else if (status === "completed" && !session) {
        const uid = userId || (await db.auth.getUser()).data.user?.id;
        if (!uid) throw new Error("Hãy đăng nhập.");
        const rows = [];
        if (started_at && ended_at && endDay !== day) {
          const midnight = new Date(`${endDay}T00:00`).toISOString();
          rows.push({
            kind: "activity",
            title,
            goal_id: goalId,
            date: day,
            minutes: (Date.parse(midnight) - Date.parse(started_at)) / 60000,
            started_at,
            ended_at: midnight,
          });
          if (Date.parse(ended_at) > Date.parse(midnight))
            rows.push({
              kind: "activity",
              title,
              goal_id: goalId,
              date: endDay,
              minutes: (Date.parse(ended_at) - Date.parse(midnight)) / 60000,
              started_at: midnight,
              ended_at,
            });
        } else
          rows.push({
            kind: "activity",
            title,
            goal_id: goalId,
            date: day,
            minutes: duration,
            started_at,
            ended_at,
          });
        batch.current ||= crypto.randomUUID();
        const r = await db.rpc("import_tracker", {
          p_batch_id: batch.current,
          p_items: rows,
        });
        if (r.error) throw r.error;
      } else {
        const uid = userId || (await db.auth.getUser()).data.user?.id;
        if (!uid) throw new Error("Hãy đăng nhập.");
        const at = started_at || new Date(`${day}T00:00`).toISOString();
        const input: SessionInput = {
          title,
          goal_id: goalId || null,
          notes: session?.notes || "",
          is_unscheduled: !timed,
          scheduled_start: at,
          scheduled_end:
            ended_at ||
            new Date(Date.parse(at) + duration * 60000).toISOString(),
          planned_minutes: Math.ceil(span),
          timezone:
            session?.timezone ||
            Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
        if (session) {
          const r = await db
            .from("focus_sessions")
            .update(input)
            .eq("id", session.id)
            .eq("user_id", uid);
          if (r.error) throw r.error;
        } else {
          batch.current ||= crypto.randomUUID();
          const r = await db.rpc("import_tracker", {
            p_batch_id: batch.current,
            p_items: repeatedSessions(input, weeks).map((s) => ({
              kind: "session",
              ...s,
            })),
          });
          if (r.error) throw r.error;
        }
      }
      await onSaved?.();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={old ? "Sửa phiên" : "Thêm phiên"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="form" onSubmit={submit}>
        <fieldset
          className="form"
          disabled={busy}
          style={{ border: 0, padding: 0, margin: 0 }}
        >
          <label>
            Trạng thái
            <select
              value={status}
              disabled={old}
              onChange={(e) => setStatus(e.target.value as typeof status)}
            >
              <option value="planned">Dự định</option>
              <option value="completed">Đã làm</option>
            </select>
          </label>
          <label>
            Mục tiêu
            <select
              required={!old || !!(activity?.goal_id || session?.goal_id)}
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
            >
              <option value="">Chọn mục tiêu</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
            <small>{GOAL_REQUIRED}</small>
          </label>
          <label>
            Nội dung ngắn (tùy chọn)
            <input
              name="content"
              maxLength={160}
              defaultValue={activity?.title || session?.title || ""}
              placeholder="Chưa chọn nội dung"
            />
          </label>
          <DatePicker
            label="Ngày"
            value={day}
            max={status === "completed" ? todayKey() : undefined}
            onChange={setDay}
          />
          <div className="row-actions">
            <button
              className="button"
              type="button"
              aria-pressed={timed}
              onClick={() => setTimed(true)}
            >
              Khung giờ
            </button>
            <button
              className="button"
              type="button"
              aria-pressed={!timed}
              onClick={() => setTimed(false)}
            >
              Chỉ thời lượng
            </button>
          </div>
          {timed ? (
            <div className="form-row">
              {(["Bắt đầu", "Kết thúc"] as const).map((label, i) => (
                <label key={label}>
                  {label}
                  <input
                    required
                    type="text"
                    inputMode="numeric"
                    placeholder="HH:mm"
                    pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
                    value={i ? end : start}
                    onChange={(e) =>
                      i ? setEnd(e.target.value) : setStart(e.target.value)
                    }
                  />
                </label>
              ))}
            </div>
          ) : (
            <label>
              Thời lượng (phút)
              <input
                required
                type="number"
                min={1}
                max={1440}
                step={1}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
              />
            </label>
          )}
          {activity && (
            <p className="muted small">
              Đã ghi {formatMinutes(activity.duration_minutes)}. Sửa nội dung
              giữ nguyên thời gian chính xác.
            </p>
          )}
          {timed && end <= start && (
            <p className="muted small">Kết thúc vào ngày kế tiếp.</p>
          )}
          {!old && status === "planned" && (
            <details>
              <summary>Lặp hằng tuần</summary>
              <label>
                Số tuần
                <input
                  type="number"
                  min={1}
                  max={52}
                  value={weeks}
                  onChange={(e) => setWeeks(Number(e.target.value))}
                />
              </label>
            </details>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button className="button primary">
            {busy ? "Đang lưu…" : "Lưu phiên"}
          </button>
        </fieldset>
      </form>
    </Dialog>
  );
}
