"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Pause,
  Play,
  Plus,
  Square,
  Trash2,
  Maximize2,
  Upload,
} from "lucide-react";
import Dialog from "./dialog";
import DatePicker from "./date-picker";
import Timetable from "./timetable";
import type { TimetableEntry } from "@/lib/schedule";
import { getSupabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/errors";
import {
  addDays,
  formatDate,
  todayKey,
  type Activity,
  type Goal,
  type Profile,
} from "@/lib/timeline";
import { formatMinutes, isWork } from "@/lib/focus";
import {
  clockText,
  localDateTime,
  monday,
  repeatedSessions,
  sessionElapsed,
  type FocusSession,
  type SessionInput,
  type WeeklyBudget,
} from "@/lib/planning";

const statusText = {
  planned: "Đã phân bổ",
  running: "Đang tập trung",
  paused: "Tạm dừng",
  review: "Chờ xác nhận",
  completed: "Đã ghi nhật ký",
};
async function readAll<T>(table: string, userId: string): Promise<T[]> {
  const db = getSupabase()!;
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const r = await db
      .from(table)
      .select("*")
      .eq("user_id", userId)
      .order("id")
      .range(from, from + 999);
    if (r.error) throw r.error;
    out.push(...(r.data as T[]));
    if (r.data.length < 1000) return out;
  }
}

export default function PlanningHub({
  visible,
  userId,
  profile,
  goals,
  activities,
  onAuth,
  onImport,
  onChanged,
  onSessionsChange,
  requestedSession,
  onCloseRequested,
}: {
  visible: boolean;
  userId?: string;
  profile: Profile;
  goals: Goal[];
  activities: Activity[];
  onAuth: () => void;
  onImport: (kind?: "timetable") => void;
  onChanged: () => Promise<void>;
  onSessionsChange: (sessions: FocusSession[]) => void;
  requestedSession: string | null;
  onCloseRequested: () => void;
}) {
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [budgets, setBudgets] = useState<WeeklyBudget[]>([]);
  const [timetable, setTimetable] = useState<TimetableEntry[]>([]);
  const [week, setWeek] = useState(monday(todayKey()));
  const [edit, setEdit] = useState<FocusSession | "new" | null>(null);
  const [timer, setTimer] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    if (!userId) return;
    try {
      const [s, b, t] = await Promise.all([
        readAll<FocusSession>("focus_sessions", userId),
        readAll<WeeklyBudget>("weekly_budgets", userId),
        readAll<TimetableEntry>("timetable_entries", userId),
      ]);
      setSessions(s);
      setBudgets(b);
      setTimetable(t);
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [userId]);
  useEffect(() => {
    const initial = window.setTimeout(() => void reload(), 0);
    return () => {
      clearTimeout(initial);
    };
  }, [reload, activities]);
  useEffect(() => onSessionsChange(sessions), [sessions, onSessionsChange]);
  const selected = sessions.find((s) => s.id === (timer || requestedSession)),
    running = sessions.find((s) => s.status === "running");
  async function transition(id: string, action: string, notes?: string) {
    if (!userId) return;
    setBusy(true);
    setError("");
    try {
      const r = await getSupabase()!.rpc("transition_session", {
        p_id: id,
        p_action: action,
        p_notes: notes ?? null,
      });
      if (r.error) throw r.error;
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? (r.data as FocusSession) : s)),
      );
      if (action === "confirm") {
        setTimer(null);
        onCloseRequested();
        await onChanged();
      }
    } catch (e) {
      setError(errorMessage(e));
      throw e;
    } finally {
      setBusy(false);
    }
  }
  const weekly = sessions
    .filter((s) => {
      const d = localDateTime(s.scheduled_start).slice(0, 10);
      return d >= week && d <= addDays(week, 6);
    })
    .sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start));
  const work = activities.filter(
    (a) =>
      isWork(a) && a.occurred_on >= week && a.occurred_on <= addDays(week, 6),
  );
  const actual = work.reduce((n, a) => n + Number(a.duration_minutes), 0),
    planned = budgets
      .filter((b) => b.week_start === week)
      .reduce((n, b) => n + b.planned_minutes, 0);
  async function saveBudgets(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!userId) {
      onAuth();
      return;
    }
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const rows = goals.map((g) => ({
        user_id: userId,
        goal_id: g.id,
        week_start: week,
        planned_minutes: Math.round(Number(f.get(g.id) || 0) * 60),
      }));
      if (rows.reduce((n, r) => n + r.planned_minutes, 0) > 10080)
        throw new Error("Tổng phân bổ không thể vượt 168 giờ trong một tuần.");
      if (rows.length) {
        const r = await getSupabase()!
          .from("weekly_budgets")
          .upsert(rows, { onConflict: "user_id,week_start,goal_id" });
        if (r.error) throw r.error;
      }
      await reload();
      setNotice("Đã lưu phân bổ tuần.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {userId && !selected && (
        <div className="today-focus-bar">
          <span>
            <strong>Hôm nay</strong> ·{" "}
            {
              sessions.filter(
                (s) =>
                  localDateTime(s.scheduled_start).slice(0, 10) === todayKey(),
              ).length
            }{" "}
            phiên đã đặt
          </span>
          {(() => {
            const next =
              running ||
              sessions.find(
                (s) =>
                  localDateTime(s.scheduled_start).slice(0, 10) ===
                    todayKey() && ["planned", "paused"].includes(s.status),
              );
            return next ? (
              <button
                className="button primary"
                disabled={busy}
                onClick={() => {
                  setTimer(next.id);
                  if (next.status !== "running")
                    void transition(next.id, "start").catch(() => {});
                }}
              >
                <Play size={16} />
                {next.status === "running"
                  ? "Mở timer"
                  : `Bắt đầu · ${next.title}`}
              </button>
            ) : (
              <button className="text-button" onClick={() => setEdit("new")}>
                Đặt một phiên
              </button>
            );
          })()}
        </div>
      )}
      {visible && (
        <div className="planning-page">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Ý ĐỊNH → THỰC TẾ</span>
              <h1>Tuần của bạn</h1>
              <p className="muted">
                Phân bổ giờ cho việc quan trọng. Ghi nhận sau mỗi phiên tập
                trung.
              </p>
            </div>
            <div className="row-actions">
              <button className="button secondary" onClick={() => onImport()}>
                <Upload size={17} />
                Nhập lịch
              </button>
              <button
                className="button primary"
                onClick={() => (userId ? setEdit("new") : onAuth())}
              >
                <Plus size={17} />
                Thêm phiên học
              </button>
            </div>
          </div>
          <div className="week-nav">
            <button
              className="icon-button"
              aria-label="Tuần trước"
              onClick={() => setWeek(addDays(week, -7))}
            >
              <ChevronLeft />
            </button>
            <DatePicker
              label="Tuần bắt đầu"
              value={week}
              onChange={(d) => setWeek(monday(d))}
            />
            <span>— {formatDate(addDays(week, 6), true)}</span>
            <button
              className="icon-button"
              aria-label="Tuần sau"
              onClick={() => setWeek(addDays(week, 7))}
            >
              <ChevronRight />
            </button>
            <button
              className="text-button"
              onClick={() => setWeek(monday(todayKey()))}
            >
              Tuần này
            </button>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="muted small" role="status">
              {notice}
            </p>
          )}
          <div className="planning-summary">
            <div>
              <span>Đã dành ra</span>
              <strong>{formatMinutes(actual)}</strong>
            </div>
            <div>
              <span>Ý định trong tuần</span>
              <strong>{formatMinutes(planned)}</strong>
            </div>
            <div>
              <span>Ngày có hoạt động</span>
              <strong>
                {new Set(work.map((a) => a.occurred_on)).size} / 7
              </strong>
            </div>
          </div>
          <Timetable
            week={week}
            setWeek={setWeek}
            profile={profile}
            userId={userId}
            entries={timetable}
            sessions={sessions}
            goals={goals}
            budgets={budgets}
            onImport={() => onImport("timetable")}
            onAuth={onAuth}
            onChanged={reload}
            onSession={setTimer}
          />
          <div className="planning-columns">
            <section className="planning-card">
              <h2>Quỹ giờ theo mục tiêu</h2>
              <p className="muted small">
                Con số để định hướng tuần này. Chỉ phiên đã xác nhận và nhật ký
                thực tế được cộng vào kết quả.
              </p>
              <form
                className="form"
                key={`${week}-${JSON.stringify(budgets)}`}
                onSubmit={saveBudgets}
              >
                {goals.map((g) => {
                  const p =
                      budgets.find(
                        (b) => b.week_start === week && b.goal_id === g.id,
                      )?.planned_minutes || 0,
                    a = work
                      .filter((x) => x.goal_id === g.id)
                      .reduce((n, x) => n + Number(x.duration_minutes), 0);
                  return (
                    <div className="budget-row" key={g.id}>
                      <div className="section-row">
                        <label htmlFor={`budget-${g.id}`}>
                          <span
                            className="color-dot"
                            style={{ background: g.color }}
                          />
                          {g.title}
                        </label>
                        <div className="hours-input">
                          <input
                            id={`budget-${g.id}`}
                            name={g.id}
                            aria-label={`Giờ dự kiến cho ${g.title}`}
                            type="number"
                            min={0}
                            max={168}
                            step="any"
                            defaultValue={p / 60}
                          />
                          giờ
                        </div>
                      </div>
                      <div className="progress-track">
                        <span
                          style={{
                            background: g.color,
                            width: `${p ? Math.min(100, (a / p) * 100) : 0}%`,
                          }}
                        />
                      </div>
                      <small>
                        Thực tế {formatMinutes(a)} / định {formatMinutes(p)}
                        {p > 0
                          ? ` · ${a < p ? `còn ${formatMinutes(p - a)}` : `vượt ${formatMinutes(a - p)}`}`
                          : ""}
                      </small>
                    </div>
                  );
                })}
                {!goals.length && (
                  <p className="muted">
                    Thêm mục tiêu trước để phân bổ thời gian.
                  </p>
                )}
                <button
                  className="button primary"
                  disabled={busy || !goals.length}
                >
                  Lưu phân bổ tuần
                </button>
              </form>
            </section>
            <section className="planning-card">
              <h2>Phiên học & làm việc</h2>
              <p className="muted small">
                Giờ hiển thị theo múi giờ thiết bị. Bấm vào phiên để mở đồng hồ;
                thời gian nghỉ không được tính.
              </p>
              <div className="session-list">
                {weekly.map((s) => (
                  <div key={s.id} className={`session-row ${s.status}`}>
                    <button
                      className="session-open"
                      onClick={() => setTimer(s.id)}
                    >
                      <span
                        className="color-dot"
                        style={{
                          background:
                            goals.find((g) => g.id === s.goal_id)?.color ||
                            "#237a4b",
                        }}
                      />
                      <div>
                        <strong>{s.title}</strong>
                        <span>
                          {formatDate(
                            localDateTime(s.scheduled_start).slice(0, 10),
                          )}{" "}
                          · {localDateTime(s.scheduled_start).slice(11)} –{" "}
                          {localDateTime(s.scheduled_end).slice(11)}
                        </span>
                        <small>
                          {statusText[s.status]} ·{" "}
                          {formatMinutes(s.planned_minutes)}
                        </small>
                      </div>
                      {s.status === "running" ? (
                        <Pause size={18} />
                      ) : (
                        <Play size={18} />
                      )}
                    </button>
                    {s.status === "planned" && (
                      <div className="row-actions">
                        <button
                          className="text-button"
                          onClick={() => setEdit(s)}
                        >
                          Sửa
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Xóa phiên ${s.title}`}
                          disabled={busy}
                          onClick={async () => {
                            setBusy(true);
                            try {
                              const r = await getSupabase()!
                                .from("focus_sessions")
                                .delete()
                                .eq("id", s.id)
                                .eq("status", "planned");
                              if (r.error) throw r.error;
                              await reload();
                            } catch (e) {
                              setError(errorMessage(e));
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {!weekly.length && (
                  <div className="planning-empty">
                    <Clock3 size={32} />
                    <p>Tuần này chưa có phiên nào.</p>
                    <button
                      className="text-button"
                      onClick={() => (userId ? setEdit("new") : onAuth())}
                    >
                      Đặt khung giờ đầu tiên
                    </button>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      )}
      {edit && (
        <SessionForm
          session={edit === "new" ? undefined : edit}
          goals={goals}
          profile={profile}
          onClose={() => setEdit(null)}
          onSave={async (rows, id) => {
            if (!userId) return;
            const db = getSupabase()!;
            const r = id
              ? await db
                  .from("focus_sessions")
                  .update(rows[0])
                  .eq("id", id)
                  .eq("status", "planned")
                  .select()
                  .single()
              : await db.from("focus_sessions").upsert(
                  rows.map((r) => ({ ...r, user_id: userId })),
                  { onConflict: "id", ignoreDuplicates: true },
                );
            if (r.error) throw r.error;
            await reload();
          }}
        />
      )}
      {selected && (
        <SessionTimer
          key={selected.id}
          session={selected}
          busy={busy}
          error={error}
          onClose={() => {
            setTimer(null);
            onCloseRequested();
          }}
          onAction={(a, n) => transition(selected.id, a, n)}
          onDiscard={async () => {
            setBusy(true);
            try {
              const result = await getSupabase()!
                .from("focus_sessions")
                .delete()
                .eq("id", selected.id)
                .eq("status", "review")
                .eq("elapsed_seconds", 0)
                .select("id")
                .single();
              if (result.error) throw result.error;
              setSessions((prev) => prev.filter((s) => s.id !== selected.id));
              setTimer(null);
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </>
  );
}

function SessionForm({
  session,
  goals,
  onClose,
  onSave,
}: {
  session?: FocusSession;
  goals: Goal[];
  profile: Profile;
  onClose: () => void;
  onSave: (
    rows: (SessionInput & { id: string })[],
    id?: string,
  ) => Promise<void>;
}) {
  const [start, setStart] = useState(
      session ? localDateTime(session.scheduled_start) : `${todayKey()}T09:00`,
    ),
    [end, setEnd] = useState(
      session ? localDateTime(session.scheduled_end) : `${todayKey()}T10:00`,
    ),
    [weeks, setWeeks] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const ids = useRef<string[]>([]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const minutes = Math.round(
        (new Date(end).getTime() - new Date(start).getTime()) / 60000,
      );
      const input: SessionInput = {
        title: String(f.get("title")).trim(),
        notes: String(f.get("notes") || "").trim(),
        goal_id: String(f.get("goal") || "") || null,
        scheduled_start: new Date(start).toISOString(),
        scheduled_end: new Date(end).toISOString(),
        planned_minutes: minutes,
        timezone:
          session?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      const rows = repeatedSessions(input, weeks, [], false).map((r, i) => ({
        ...r,
        id: ids.current[i] || (ids.current[i] = crypto.randomUUID()),
      }));
      if (!rows.length)
        throw new Error(
          "Tất cả phiên nằm trong kỳ nghỉ; hãy đổi khoảng ngày hoặc bỏ tùy chọn bỏ ngày nghỉ.",
        );
      await onSave(rows, session?.id);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={session ? "Chỉnh sửa phiên" : "Phân bổ một phiên tập trung"}
      description="Đồng hồ đếm ngược bằng thời lượng giữa giờ bắt đầu và kết thúc."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="form" onSubmit={submit}>
        <label>
          Tên hoạt động
          <input
            name="title"
            required
            maxLength={160}
            defaultValue={session?.title}
            placeholder="Thực nghiệm Paper, luyện IELTS…"
          />
        </label>
        <label>
          Mục tiêu
          <select name="goal" defaultValue={session?.goal_id || ""}>
            <option value="">Không gắn mục tiêu</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </label>
        <div className="form-row">
          <label>
            Giờ bắt đầu
            <input
              type="datetime-local"
              required
              value={start}
              onChange={(e) => {
                const next = e.target.value;
                const span =
                  new Date(end).getTime() - new Date(start).getTime();
                setStart(next);
                if (next && Number.isFinite(span) && span > 0)
                  setEnd(
                    localDateTime(
                      new Date(new Date(next).getTime() + span).toISOString(),
                    ),
                  );
              }}
            />
          </label>
          <label>
            Giờ kết thúc
            <input
              type="datetime-local"
              required
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
        <p className="muted small">
          {end > start
            ? formatMinutes(
                Math.round(
                  (new Date(end).getTime() - new Date(start).getTime()) / 60000,
                ),
              )
            : "Chọn giờ kết thúc sau bắt đầu"}{" "}
          · giờ địa phương trên thiết bị
        </p>
        {!session && (
          <>
            <label>
              Áp dụng trong bao nhiêu tuần?
              <input
                type="number"
                min={1}
                max={52}
                required
                value={weeks}
                onChange={(e) => setWeeks(Number(e.target.value))}
              />
            </label>
            <p className="muted small">
              Tạo tối đa {weeks} phiên, cùng thứ và khung giờ, từ{" "}
              {start.slice(0, 10)} đến{" "}
              {addDays(
                start.slice(0, 10) || todayKey(),
                Math.max(0, weeks - 1) * 7,
              )}
              .
            </p>
          </>
        )}
        <label>
          Ghi chú
          <textarea
            name="notes"
            maxLength={4000}
            defaultValue={session?.notes}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary" disabled={busy}>
          {busy ? "Đang lưu…" : session ? "Lưu phiên" : "Tạo phiên học"}
        </button>
      </form>
    </Dialog>
  );
}

function SessionTimer({
  session,
  busy,
  error,
  onClose,
  onAction,
  onDiscard,
}: {
  session: FocusSession;
  busy: boolean;
  error: string;
  onClose: () => void;
  onAction: (a: string, notes?: string) => Promise<void>;
  onDiscard: () => Promise<void>;
}) {
  const [now, setNow] = useState(() => Date.now()),
    [notes, setNotes] = useState(session.notes);
  const stopped = useRef(false);
  const surface = useRef<HTMLDivElement>(null);
  const elapsed = sessionElapsed(session, now),
    remaining = session.planned_minutes * 60 - elapsed;
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (
      remaining === 0 &&
      session.status === "running" &&
      !stopped.current &&
      !busy
    ) {
      stopped.current = true;
      void onAction("stop").catch(() => {
        stopped.current = false;
      });
    }
  }, [remaining, session.status, busy, onAction]);
  return (
    <Dialog
      title={session.title}
      description="Tập trung vào một việc, từng phiên một."
      onClose={onClose}
      wide
    >
      <div className="timer-surface" ref={surface}>
        <span className="eyebrow">{statusText[session.status]}</span>
        <div
          className="countdown"
          role="timer"
          aria-label={`Còn ${clockText(remaining)}`}
        >
          {clockText(remaining)}
        </div>
        <p>
          Thực làm {clockText(elapsed)} · dự kiến{" "}
          {formatMinutes(session.planned_minutes)}
        </p>
        <div className="timer-actions">
          {["planned", "paused"].includes(session.status) && (
            <button
              className="button"
              disabled={busy}
              onClick={() => void onAction("start").catch(() => {})}
            >
              <Play size={18} />
              {session.status === "paused" ? "Tiếp tục" : "Bắt đầu"}
            </button>
          )}
          {session.status === "running" && (
            <button
              className="button"
              disabled={busy}
              onClick={() => void onAction("pause").catch(() => {})}
            >
              <Pause size={18} />
              Tạm dừng
            </button>
          )}
          {["running", "paused"].includes(session.status) && (
            <button
              className="button"
              disabled={busy}
              onClick={() => void onAction("stop").catch(() => {})}
            >
              <Square size={17} />
              Kết thúc
            </button>
          )}
          <button
            className="button"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else void surface.current?.requestFullscreen().catch(() => {});
            }}
          >
            <Maximize2 size={17} />
            Toàn màn hình
          </button>
          {session.status === "review" && elapsed < 1 && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void onDiscard()}
            >
              Bỏ phiên chưa ghi thời gian
            </button>
          )}
        </div>
        <small>
          Đồng hồ vẫn chạy khi đóng cửa sổ, tối đa bằng thời lượng đã đặt. Tạm
          dừng khi nghỉ.
        </small>
      </div>
      {session.status === "review" && (
        <div className="form timer-review">
          <label>
            Một dòng ghi chú
            <textarea
              value={notes}
              maxLength={4000}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ví dụ: đọc xong 3 paper về layout parsing"
            />
          </label>
          <p>
            Chỉ cộng {formatMinutes(elapsed / 60)} vào nhật ký khi bạn xác nhận.
          </p>
          <button
            className="button primary"
            disabled={busy || elapsed < 1}
            onClick={() => void onAction("confirm", notes).catch(() => {})}
          >
            Xác nhận & ghi nhật ký
          </button>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
