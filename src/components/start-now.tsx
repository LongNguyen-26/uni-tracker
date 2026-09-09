"use client";
import { useState } from "react";
import { Play, SlidersHorizontal } from "lucide-react";
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
// record the hours it actually took. Everything that can be asked afterwards is
// asked afterwards, so the way from wanting to grind to a running clock is one
// choice and one button.
const OPEN_ENDED_MINUTES = 60;

export default function StartNow({
  goals,
  initialGoalId,
  userId,
  memoryKey,
  onMode,
  onStarted,
  onClose,
}: {
  goals: Goal[];
  initialGoalId?: string;
  userId: string;
  memoryKey: string;
  onMode: (mode: TimerMode) => void;
  onStarted: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const open = goals.filter((g) => g.progress < 100);
  const choices = open.length ? open : goals;
  const [goalId, setGoalId] = useState(
    initialGoalId && goals.some((g) => g.id === initialGoalId)
      ? initialGoalId
      : choices[0]?.id || "",
  );
  const [intent, setIntent] = useState("");
  const [showIntent, setShowIntent] = useState(false);
  const [showModes, setShowModes] = useState(false);
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
    if (busy) return;
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
      description="Chọn việc rồi chạy. Phần còn lại ghi sau."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="form start-now"
        onSubmit={(e) => {
          e.preventDefault();
          void start();
        }}
      >
        <div className="goal-chips" role="group" aria-label="Mục tiêu">
          {choices.map((g) => (
            <button
              type="button"
              key={g.id}
              className={`goal-chip ${goalId === g.id ? "selected" : ""}`}
              aria-pressed={goalId === g.id}
              onClick={() => setGoalId(g.id)}
            >
              <span className="color-dot" style={{ background: g.color }} />
              {g.title}
            </button>
          ))}
          <button
            type="button"
            className={`goal-chip ${goalId === "" ? "selected" : ""}`}
            aria-pressed={goalId === ""}
            onClick={() => setGoalId("")}
          >
            Không gắn mục tiêu
          </button>
        </div>
        {showIntent && (
          <label>
            Định làm gì trong phiên này?
            <input
              autoFocus
              value={intent}
              maxLength={160}
              placeholder="Ví dụ: đọc 2 paper về layout parsing"
              onChange={(e) => setIntent(e.target.value)}
            />
          </label>
        )}
        {showModes && (
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
        )}
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
            <button type="submit" className="button primary" disabled={busy}>
              <Play size={18} />
              Bắt đầu
            </button>
          </div>
        </div>
        <div className="start-extras">
          {!showIntent && (
            <button
              type="button"
              className="text-button"
              onClick={() => setShowIntent(true)}
            >
              Thêm ý định (tùy chọn)
            </button>
          )}
          {!showModes && (
            <button
              type="button"
              className="text-button"
              onClick={() => setShowModes(true)}
            >
              <SlidersHorizontal size={14} />
              {mode.kind === "up"
                ? "Đếm lên · đổi kiểu"
                : `Đếm ngược ${mode.minutes} phút · đổi kiểu`}
            </button>
          )}
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
