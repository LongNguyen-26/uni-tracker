"use client";
import { useEffect, useState } from "react";
import type { FocusSession } from "@/lib/planning";
import { formatMinutes } from "@/lib/focus";

export default function SessionRecap({
  session,
  recent,
  total,
  goalTitle,
  onSave,
  onClose,
  onDisable,
}: {
  session: FocusSession;
  recent: string[];
  /** Every minute on this goal including the session that just ended. */
  total?: number;
  goalTitle?: string;
  onSave: (value: string) => Promise<void>;
  onClose: () => void;
  onDisable: () => void;
}) {
  const [value, setValue] = useState(session.actual || ""),
    [focused, setFocused] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (focused || busy) return;
    const timer = window.setTimeout(onClose, 8000);
    return () => clearTimeout(timer);
  }, [focused, busy, value, onClose]);
  return (
    <aside
      className="session-recap"
      aria-label="Bổ sung nội dung phiên vừa ghi"
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
    >
      {/* The moment a session lands is the moment the total means something,
          so the two numbers are said in the same breath. */}
      <strong role="status">
        Đã ghi {formatMinutes(session.elapsed_seconds / 60)}
        {total ? (
          <span className="recap-total">
            {goalTitle ? `${goalTitle} giờ là ` : "Tổng cộng "}
            <b>{formatMinutes(total)}</b>
          </span>
        ) : null}
      </strong>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onSave(value.trim());
            onClose();
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Chưa lưu được nội dung.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          aria-label="Nội dung thực tế"
          placeholder="Bổ sung nội dung (tùy chọn)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={160}
        />
        <button className="button" disabled={busy}>
          Lưu nội dung
        </button>
      </form>
      <div className="row-actions">
        {recent.map((s) => (
          <button key={s} className="text-button" onClick={() => setValue(s)}>
            {s}
          </button>
        ))}
      </div>
      <div className="row-actions">
        <button className="text-button" onClick={onClose}>
          Đóng
        </button>
        <button className="text-button" onClick={onDisable}>
          Tắt gợi ý lần sau
        </button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </aside>
  );
}
