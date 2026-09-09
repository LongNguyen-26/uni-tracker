"use client";
import { useState } from "react";
import { Play } from "lucide-react";
import Dialog from "./dialog";
import { getSupabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/errors";
import { clockText } from "@/lib/planning";
import type { Goal } from "@/lib/timeline";
import {
  COUNTDOWN_PRESETS,
  parseMemory,
  timerMode,
  type TimerMode,
} from "@/lib/timer";

// A session with no plan behind it: pick what it is, start, and let the grid
// record the hours it actually took.
const OPEN_ENDED_MINUTES = 60;

export default function StartNow({
  goals,
  userId,
  memoryKey,
  onMode,
  onStarted,
  onClose,
}: {
  goals: Goal[];
  userId: string;
  memoryKey: string;
  onMode: (mode: TimerMode) => void;
  onStarted: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const [goalId, setGoalId] = useState(goals[0]?.id || "");
  const [intent, setIntent] = useState("");
  const [mode, setMode] = useState<TimerMode>(() => {
    try {
      return timerMode(
        { planned_minutes: OPEN_ENDED_MINUTES, instant: true },
        parseMemory(localStorage.getItem(memoryKey)),
      );
    } catch {
      return { kind: "up" };
    }
  });
  const [custom, setCustom] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const goal = goals.find((g) => g.id === goalId);
  const minutes = mode.kind === "down" ? mode.minutes : OPEN_ENDED_MINUTES;
  function choose(next: TimerMode) {
    setMode(next);
    setCustom(
      next.kind === "down" && !COUNTDOWN_PRESETS.includes(next.minutes as 25),
    );
    onMode(next);
  }
  async function start() {
    setBusy(true);
    setError("");
    try {
      const db = getSupabase();
      if (!db) throw new Error("Hãy đăng nhập để lưu hành trình của bạn.");
      const at = new Date();
      const title = intent.trim() || goal?.title || "Phiên tập trung";
      const created = await db
        .from("focus_sessions")
        .insert({
          user_id: userId,
          goal_id: goalId || null,
          title,
          intent: intent.trim(),
          notes: "",
          // Given a real slot from the moment it starts, so it shows up in the
          // grid at the hour it is being worked.
          is_unscheduled: false,
          scheduled_start: at.toISOString(),
          scheduled_end: new Date(at.getTime() + minutes * 60000).toISOString(),
          planned_minutes: minutes,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        })
        .select("id")
        .single();
      if (created.error) throw created.error;
      const started = await db.rpc("transition_session", {
        p_id: created.data.id,
        p_action: "start",
      });
      if (started.error) throw started.error;
      await onStarted(created.data.id);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="Bắt đầu ngay"
      description="Không có phiên đặt trước — chọn việc rồi chạy."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="form start-now">
        <label>
          Mục tiêu
          <select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
            <option value="">Không gắn mục tiêu</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Định làm gì trong phiên này?
          <input
            value={intent}
            maxLength={160}
            placeholder="Ví dụ: đọc 2 paper về layout parsing"
            onChange={(e) => setIntent(e.target.value)}
          />
        </label>
        <div className="timer-modes" role="group" aria-label="Kiểu đồng hồ">
          <button
            type="button"
            className={mode.kind === "up" ? "selected" : ""}
            aria-pressed={mode.kind === "up"}
            onClick={() => choose({ kind: "up" })}
          >
            Đếm lên
          </button>
          <button
            type="button"
            className={mode.kind === "down" ? "selected" : ""}
            aria-pressed={mode.kind === "down"}
            onClick={() => choose({ kind: "down", minutes: 25 })}
          >
            Đếm ngược
          </button>
          {mode.kind === "down" && (
            <>
              {COUNTDOWN_PRESETS.map((m) => (
                <button
                  type="button"
                  key={m}
                  className={!custom && mode.minutes === m ? "selected" : ""}
                  aria-pressed={!custom && mode.minutes === m}
                  onClick={() => choose({ kind: "down", minutes: m })}
                >
                  {m} phút
                </button>
              ))}
              <button
                type="button"
                className={custom ? "selected" : ""}
                aria-pressed={custom}
                onClick={() => setCustom(true)}
              >
                Khác
              </button>
              {custom && (
                <input
                  type="number"
                  min={1}
                  max={1440}
                  aria-label="Số phút đếm ngược"
                  value={mode.minutes}
                  onChange={(e) => {
                    const m = Number(e.target.value);
                    if (Number.isInteger(m) && m >= 1 && m <= 1440)
                      choose({ kind: "down", minutes: m });
                  }}
                />
              )}
            </>
          )}
        </div>
        <div className="timer-surface">
          <span className="eyebrow">
            {mode.kind === "up" ? "THỰC LÀM" : "CÒN LẠI"}
          </span>
          <div className="countdown">
            {clockText(mode.kind === "up" ? 0 : minutes * 60)}
          </div>
          <p>
            {mode.kind === "up"
              ? "Chạy tới khi bạn dừng."
              : "Hết giờ vẫn ghi tiếp nếu bạn chưa dừng."}
          </p>
          <div className="timer-actions">
            <button
              type="button"
              className="button primary"
              disabled={busy}
              onClick={() => void start()}
            >
              <Play size={18} />
              Bắt đầu
            </button>
          </div>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
