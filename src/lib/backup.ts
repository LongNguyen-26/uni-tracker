import { goalSteps } from "./milestones";
import { type FocusSession } from "./planning";
import type { Goal } from "./timeline";

export type RestoreItem = {
  key: string;
  table: string;
  data: Record<string, unknown>;
  resolution?: "keep" | "skip" | "replace";
};
export type RestoreReview = {
  key: string;
  table: string;
  title: string;
  status: "new" | "same" | "conflict" | "error" | "saved" | "kept" | "skipped";
  message?: string;
  current?: Record<string, unknown>;
  incoming?: Record<string, unknown>;
};
export function isBackup(data: unknown): data is Record<string, unknown> {
  return (
    !!data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    "version" in data &&
    "goals" in data
  );
}

/** A backup freezes a running timer at export, never at the later restore time. */
export function pauseBackupSession(
  session: FocusSession,
  exportedAt: string,
): FocusSession {
  if (session.status !== "running") return { ...session };
  const until = Date.parse(exportedAt),
    from = Date.parse(session.running_since || "");
  if (!Number.isFinite(until) || !Number.isFinite(from))
    throw new Error("Bản sao lưu thiếu thời điểm xuất của timer đang chạy.");
  const delta = Math.max(
    0,
    Math.min(
      session.planned_minutes * 60 - session.elapsed_seconds,
      Math.floor((until - from) / 1000),
    ),
  );
  return {
    ...session,
    status: "paused",
    running_since: null,
    elapsed_seconds: session.elapsed_seconds + delta,
    segments: delta
      ? [
          ...session.segments,
          {
            start: session.running_since!,
            end: new Date(from + delta * 1000).toISOString(),
          },
        ]
      : session.segments,
  };
}

export function backupRows(data: Record<string, unknown>): RestoreItem[] {
  const out: RestoreItem[] = [];
  const mapping = {
    goals: "goals",
    sessions: "focus_sessions",
    activities: "activities",
    budgets: "weekly_budgets",
    timetable_entries: "timetable_entries",
  };
  for (const [key, table] of Object.entries(mapping)) {
    const values = data[key];
    if (values !== undefined && !Array.isArray(values))
      throw new Error(`Bản sao lưu: ${key} phải là danh sách.`);
    for (const raw of (values || []) as Record<string, unknown>[]) {
      if (
        !raw ||
        typeof raw !== "object" ||
        !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(String(raw.id || ""))
      )
        throw new Error(`Bản sao lưu ${key} thiếu mã bản ghi hợp lệ.`);
      let value = { ...raw };
      if (table === "goals")
        value.checklist = goalSteps(raw as unknown as Goal);
      if (table === "focus_sessions")
        value = {
          ...pauseBackupSession(
            raw as unknown as FocusSession,
            String(data.exported_at || ""),
          ),
        };
      delete value.user_id;
      out.push({ key: `${table}:${raw.id}`, table, data: value });
    }
  }
  if (data.profile && typeof data.profile === "object")
    out.push({
      key: "profile",
      table: "profiles",
      data: { ...(data.profile as Record<string, unknown>) },
    });
  if (!out.length) throw new Error("Bản sao lưu không có dữ liệu.");
  if (out.length > 10000)
    throw new Error("Bản sao lưu tối đa 10.000 bản ghi mỗi lần.");
  return out;
}
