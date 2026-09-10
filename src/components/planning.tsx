"use client";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Square,
  Maximize2,
  Upload,
  Wand2,
} from "lucide-react";
import SessionRecap from "./session-recap";
import SplitButton from "./split-button";
import StartNow from "./start-now";
import { ActivityForm } from "./forms";
import Dialog from "./dialog";
import DatePicker from "./date-picker";
import SessionEditor from "./session-editor";
import Timetable, { WeekPlanner } from "./timetable";
import { weekCapacity, type TimetableEntry } from "@/lib/schedule";
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
import { goalJourney, lastWorkedGoal } from "@/lib/journey";
import {
  COUNTDOWN_PRESETS,
  parseMemory,
  rememberChoice,
  shortClock,
  timerMode,
  timerReading,
  type TimerMode,
} from "@/lib/timer";
import {
  clockText,
  localDateTime,
  monday,
  sessionElapsed,
  type FocusSession,
  type WeeklyBudget,
} from "@/lib/planning";

const statusText = {
  planned: "Đã phân bổ",
  running: "Đang tập trung",
  paused: "Tạm dừng",
  review: "Chờ xác nhận",
  completed: "Đã ghi nhật ký",
};
/**
 * Somewhere in the app asked to get going: either resume a session that is
 * already on today's grid, or open a blank one on a goal.
 */
export type StartRequest =
  { kind: "session"; id: string } | { kind: "now"; goalId?: string };
/** Lets the top bar reach the clock without moving session state up a level. */
export type StartHandle = { start: (request: StartRequest) => void };
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
  setupGuide,
  onTimetableChange,
  requestedPlan,
  onClosePlan,
  startRef,
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
  setupGuide?: ReactNode;
  onTimetableChange: (entries: TimetableEntry[]) => void;
  requestedPlan: boolean;
  onClosePlan: () => void;
  /** A start asked for from anywhere in the app, so the clock is one click away. */
  startRef: RefObject<StartHandle | null>;
}) {
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [budgets, setBudgets] = useState<WeeklyBudget[]>([]);
  const [timetable, setTimetable] = useState<TimetableEntry[]>([]);
  const [week, setWeek] = useState(monday(todayKey()));
  const [edit, setEdit] = useState<FocusSession | "new" | null>(null);
  const [detail, setDetail] = useState<string | null>(null),
    [activityEdit, setActivityEdit] = useState<Activity | undefined>();
  const [activityDetail, setActivityDetail] = useState<Activity | undefined>();
  const [preset, setPreset] = useState<{ day: string; time: string } | null>(
    null,
  );
  const [recap, setRecap] = useState<FocusSession | null>(null),
    [recapEnabled, setRecapEnabled] = useState(true),
    [dailyContent, setDailyContent] = useState(false);
  const [pendingStops, setPendingStops] = useState<Record<string, string>>({});
  const closeRecap = useCallback(() => setRecap(null), []);
  const [timer, setTimer] = useState<{ id: string; instant?: boolean } | null>(
    null,
  );
  const [startNow, setStartNow] = useState<{ goalId?: string } | null>(null);
  const [planner, setPlanner] = useState(false);
  // The learned default is read once when a timer opens, so it needs no state.
  const timerKey = "unitracker:timer:" + userId;
  const learnMode = useCallback(
    (mode: TimerMode) => {
      try {
        const next = rememberChoice(
          parseMemory(localStorage.getItem(timerKey)),
          mode,
        );
        localStorage.setItem(timerKey, JSON.stringify(next));
      } catch {
        /* Remembering is best effort. */
      }
    },
    [timerKey],
  );
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
      const pending: Record<string, string> = {};
      for (const session of s) {
        const at = localStorage.getItem(
          "unitracker:stop:" + userId + ":" + session.id,
        );
        if (at && session.status !== "completed") pending[session.id] = at;
      }
      setPendingStops(pending);
      setRecapEnabled(
        localStorage.getItem("unitracker:recap:" + userId) !== "off",
      );
      setBudgets(b);
      setTimetable(t);
      onTimetableChange(t);
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [userId, onTimetableChange]);
  useEffect(() => {
    const initial = window.setTimeout(() => void reload(), 0);
    return () => {
      clearTimeout(initial);
    };
  }, [reload, activities]);
  useEffect(() => onSessionsChange(sessions), [sessions, onSessionsChange]);
  const selected = sessions.find(
    (s) => s.id === (timer?.id || requestedSession),
  );
  async function transition(id: string, action: string, notes?: string) {
    if (!userId) return;
    setBusy(true);
    setError("");
    try {
      const finishing = action === "stop" || action === "confirm";
      const key = "unitracker:stop:" + userId + ":" + id;
      let stopAt = localStorage.getItem(key);
      if (stopAt && !finishing)
        throw new Error(
          "Phiên đang chờ ghi. Hãy thử lưu lại trước khi tiếp tục.",
        );
      if (finishing) {
        stopAt ||= new Date().toISOString();
        localStorage.setItem(key, stopAt);
        setPendingStops((prev) => ({ ...prev, [id]: stopAt! }));
      }
      const r = finishing
        ? await getSupabase()!.rpc("finish_session", {
            p_id: id,
            p_stopped_at: stopAt,
            p_actual: notes ?? null,
          })
        : await getSupabase()!.rpc("transition_session", {
            p_id: id,
            p_action: action,
            p_notes: null,
          });
      if (r.error) throw r.error;
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? (r.data as FocusSession) : s)),
      );
      if (finishing) {
        localStorage.removeItem(key);
        setPendingStops((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setNotice(
          r.data.elapsed_seconds > 0
            ? `Đã ghi ${formatMinutes(r.data.elapsed_seconds / 60)}.`
            : "Phiên kết thúc, chưa có thời gian thực làm.",
        );
        if (recapEnabled && r.data.elapsed_seconds > 0) setRecap(r.data);
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
    planned = weekly
      .filter((s) => s.status !== "completed")
      .reduce((n, s) => n + s.planned_minutes, 0);
  const capacity = weekCapacity(week, profile, timetable, sessions, goals);
  async function saveContent(id: string, intent?: string, actual?: string) {
    const r = await getSupabase()!.rpc("set_session_content", {
      p_id: id,
      p_intent: intent ?? null,
      p_actual: actual ?? null,
    });
    if (r.error) throw r.error;
    setSessions((prev) => prev.map((s) => (s.id === id ? r.data : s)));
    await onChanged();
  }
  // One entry point for every "start" in the app. A session already on the grid
  // is resumed in place; anything else opens a blank one on the goal asked for.
  // Left imperative on purpose: this answers a click, it does not synchronise
  // anything, so it must not become an effect that re-fires on every render.
  useImperativeHandle(startRef, () => ({
    start(request) {
      if (!userId) return;
      if (request.kind === "now") {
        setStartNow({ goalId: request.goalId });
        return;
      }
      const target = sessions.find((s) => s.id === request.id);
      if (!target) return;
      setTimer({ id: target.id });
      if (target.status !== "running")
        void transition(target.id, "start").catch(() => {});
    },
  }));
  const detailSession = sessions.find((s) => s.id === detail);
  const missingContent = sessions.filter(
    (s) =>
      s.status === "completed" &&
      s.elapsed_seconds > 0 &&
      !s.actual &&
      activities.some(
        (a) => a.session_id === s.id && a.occurred_on === todayKey(),
      ),
  );
  return (
    <>
      {/* Starting lives in the top bar now, where it is reachable from every
          view, so nothing here competes with it. */}
      {!selected && Object.keys(pendingStops).length > 0 && (
        <div className="form-error" role="alert">
          Thời gian đã dừng trên thiết bị, đang chờ máy chủ ghi.{" "}
          {Object.keys(pendingStops).map((id) => (
            <button
              key={id}
              className="button"
              onClick={() => setTimer({ id })}
            >
              Mở để thử ghi lại
            </button>
          ))}
        </div>
      )}
      {startNow && userId && (
        <StartNow
          goals={goals}
          initialGoalId={
            startNow.goalId || lastWorkedGoal(goals, activities)?.id
          }
          userId={userId}
          memoryKey={timerKey}
          onMode={learnMode}
          onClose={() => setStartNow(null)}
          onStarted={async (id) => {
            setStartNow(null);
            await reload();
            await onChanged();
            setTimer({ id, instant: true });
          }}
        />
      )}
      {(requestedPlan || planner) && visible && userId && (
        <WeekPlanner
          week={week}
          profile={profile}
          entries={timetable}
          sessions={sessions}
          goals={goals}
          budgets={budgets}
          onClose={() => {
            setPlanner(false);
            onClosePlan();
          }}
          onSaved={async (w) => {
            setWeek(w);
            await reload();
            await onChanged();
          }}
        />
      )}
      {visible && (
        <div className="planning-page">
          <div className="section-heading">
            <div>
              <h1>Tuần của bạn</h1>
              <p className="muted week-meta">
                {formatMinutes(capacity.available)} trống
                <i className="meta-sep" />
                {weekly.length} phiên đã đặt ({formatMinutes(planned)})
                <i className="meta-sep" />
                {formatMinutes(actual)} đã ghi
              </p>
            </div>
            <SplitButton
              label="Thêm phiên"
              onClick={() => (userId ? setEdit("new") : onAuth())}
              actions={[
                {
                  id: "plan",
                  icon: Wand2,
                  label: "Lập kế hoạch tuần",
                  hint: "App xếp mục tiêu vào giờ trống",
                  onSelect: () => (userId ? setPlanner(true) : onAuth()),
                },
                {
                  id: "timetable",
                  icon: CalendarDays,
                  label: "Nhập thời khoá biểu…",
                  hint: "Mỗi kỳ một lần",
                  onSelect: () => onImport("timetable"),
                },
                {
                  id: "sessions",
                  icon: Upload,
                  label: "Nhập phiên từ file…",
                  hint: "Nếu bạn tự lên lịch bằng AI",
                  onSelect: () => onImport(),
                },
              ]}
            />
          </div>
          {setupGuide}
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
          <Timetable
            week={week}
            setWeek={setWeek}
            profile={profile}
            userId={userId}
            entries={timetable}
            sessions={sessions}
            goals={goals}
            onImport={() => onImport("timetable")}
            onAuth={onAuth}
            onChanged={reload}
            activities={activities}
            onSession={setDetail}
            onTimer={(id) => setTimer({ id })}
            onActivity={(id) =>
              setActivityDetail(activities.find((a) => a.id === id))
            }
            onCreate={(day, time) => {
              if (!userId) {
                onAuth();
                return;
              }
              setPreset({ day, time });
              setEdit("new");
            }}
            onIntent={(id, intent) => saveContent(id, intent)}
          />
          <section className="planning-card weekly-budget-readonly">
            <h2>Quỹ giờ theo mục tiêu</h2>
            <p className="muted small">
              Điều chỉnh quỹ giờ trong Lập kế hoạch tuần. Quỹ tuần độc lập với
              số phiên đã xếp lịch.
            </p>
            {goals.map((g) => {
              const budget =
                budgets.find((b) => b.week_start === week && b.goal_id === g.id)
                  ?.planned_minutes ?? (g.weekly_hours || 0) * 60;
              const actual = work
                .filter((a) => a.goal_id === g.id)
                .reduce((n, a) => n + Number(a.duration_minutes), 0);
              return (
                <div className="budget-row" key={g.id}>
                  <strong>
                    <span
                      className="color-dot"
                      style={{ background: g.color }}
                    />
                    {g.title}
                  </strong>
                  <span>
                    Quỹ tuần {formatMinutes(budget)} · thực làm{" "}
                    {formatMinutes(actual)} · còn lại{" "}
                    {formatMinutes(Math.max(0, budget - actual))}
                  </span>
                </div>
              );
            })}
          </section>
          <div className="row-actions">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={recapEnabled}
                onChange={(e) => {
                  setRecapEnabled(e.target.checked);
                  localStorage.setItem(
                    "unitracker:recap:" + userId,
                    e.target.checked ? "on" : "off",
                  );
                }}
              />
              Hiện ô bổ sung nội dung sau khi dừng
            </label>
            {missingContent.length > 0 && (
              <button
                className="text-button"
                onClick={() => setDailyContent(true)}
              >
                Bổ sung nội dung hôm nay ({missingContent.length})
              </button>
            )}
          </div>
        </div>
      )}
      {recap && (
        <SessionRecap
          key={recap.id}
          session={recap}
          recent={[
            ...new Set(
              sessions
                .filter(
                  (s) =>
                    s.id !== recap.id &&
                    s.goal_id === recap.goal_id &&
                    s.actual,
                )
                .sort((a, b) => b.created_at.localeCompare(a.created_at))
                .map((s) => s.actual!),
            ),
          ].slice(0, 3)}
          {...(() => {
            const goal = goals.find((g) => g.id === recap.goal_id);
            if (!goal) return {};
            // The reload that adds this session's activity may not have landed
            // yet, so count it in by hand until it does.
            const counted = activities.some((a) => a.session_id === recap.id);
            return {
              goalTitle: goal.title,
              total:
                goalJourney(goal, activities, todayKey()).minutes +
                (counted ? 0 : recap.elapsed_seconds / 60),
            };
          })()}
          onClose={closeRecap}
          onSave={(value) => saveContent(recap.id, undefined, value)}
          onDisable={() => {
            localStorage.setItem("unitracker:recap:" + userId, "off");
            setRecapEnabled(false);
            setRecap(null);
          }}
        />
      )}
      {dailyContent && (
        <Dialog
          title="Bổ sung nội dung hôm nay"
          onClose={() => setDailyContent(false)}
        >
          <div className="form">
            {missingContent.map((s) => (
              <label key={s.id}>
                {goals.find((g) => g.id === s.goal_id)?.title} ·{" "}
                {formatMinutes(s.elapsed_seconds / 60)}
                <input
                  maxLength={160}
                  placeholder="Nội dung thực tế"
                  onBlur={(e) => {
                    if (e.target.value.trim())
                      void saveContent(
                        s.id,
                        undefined,
                        e.target.value.trim(),
                      ).catch((e) => setError(errorMessage(e)));
                  }}
                />
              </label>
            ))}
            {error && <p className="form-error">{error}</p>}
          </div>
        </Dialog>
      )}
      {detailSession && (
        <Dialog
          title={detailSession.intent || detailSession.title}
          onClose={() => setDetail(null)}
        >
          <div className="form">
            <p>
              {detailSession.is_unscheduled
                ? "Chưa xếp giờ"
                : localDateTime(detailSession.scheduled_start).replace(
                    "T",
                    " · ",
                  )}{" "}
              · {formatMinutes(detailSession.planned_minutes)}
            </p>
            <p>{detailSession.intent || "Chưa chọn nội dung"}</p>
            <div className="row-actions">
              <button
                className="button"
                onClick={() => {
                  setEdit(detailSession);
                  setDetail(null);
                }}
              >
                Sửa giờ / nội dung
              </button>
              <button
                className="button"
                onClick={() => {
                  setEdit(detailSession);
                  setDetail(null);
                }}
              >
                Dời sang ngày khác
              </button>
              <button
                className="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await getSupabase()!
                      .from("focus_sessions")
                      .delete()
                      .eq("id", detailSession.id)
                      .eq("user_id", userId!);
                    if (r.error) throw r.error;
                    setDetail(null);
                    await reload();
                    await onChanged();
                  } catch (e) {
                    setError(errorMessage(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Xóa phiên
              </button>
            </div>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
          </div>
        </Dialog>
      )}
      {activityEdit && (
        <ActivityForm
          activity={activityEdit}
          goals={goals}
          defaultDate={activityEdit.occurred_on}
          onClose={() => setActivityEdit(undefined)}
          onSave={async (data, id) => {
            const r = await getSupabase()!
              .from("activities")
              .update(data)
              .eq("id", id!)
              .eq("user_id", userId!);
            if (r.error) throw r.error;
            await onChanged();
            await reload();
          }}
        />
      )}
      {activityDetail && (
        <Dialog
          title={activityDetail.title}
          onClose={() => setActivityDetail(undefined)}
        >
          <div className="form">
            <p>
              {formatDate(activityDetail.occurred_on, true)} ·{" "}
              {formatMinutes(activityDetail.duration_minutes)} · Đã làm
            </p>
            <div className="row-actions">
              <button
                className="button"
                onClick={() => {
                  setActivityEdit(activityDetail);
                  setActivityDetail(undefined);
                }}
              >
                Sửa giờ / nội dung
              </button>
              <button
                className="button"
                onClick={() => {
                  setActivityEdit(activityDetail);
                  setActivityDetail(undefined);
                }}
              >
                Dời sang ngày khác
              </button>
              <button
                className="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await getSupabase()!
                      .from("activities")
                      .delete()
                      .eq("id", activityDetail.id)
                      .eq("user_id", userId!);
                    if (r.error) throw r.error;
                    setActivityDetail(undefined);
                    await onChanged();
                  } catch (e) {
                    setError(errorMessage(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Xóa hoạt động
              </button>
            </div>
            {error && <p className="form-error">{error}</p>}
          </div>
        </Dialog>
      )}
      {edit && (
        <SessionEditor
          session={edit === "new" ? undefined : edit}
          goals={goals}
          userId={userId}
          defaultDate={preset?.day}
          defaultTime={preset?.time}
          onClose={() => {
            setEdit(null);
            setPreset(null);
          }}
          onSaved={async () => {
            await reload();
            await onChanged();
          }}
        />
      )}
      {selected && (
        <SessionTimer
          key={selected.id}
          session={selected}
          stopAt={pendingStops[selected.id]}
          busy={busy}
          error={error}
          memoryKey={timerKey}
          instant={timer?.instant || selected.is_unscheduled || false}
          onMode={learnMode}
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

function SessionTimer({
  session,
  stopAt,
  busy,
  error,
  memoryKey,
  instant,
  onMode,
  onClose,
  onAction,
  onDiscard,
}: {
  session: FocusSession;
  stopAt?: string;
  busy: boolean;
  error: string;
  memoryKey: string;
  instant: boolean;
  onMode: (mode: TimerMode) => void;
  onClose: () => void;
  onAction: (a: string, notes?: string) => Promise<void>;
  onDiscard: () => Promise<void>;
}) {
  const [now, setNow] = useState(() => Date.now()),
    [notes, setNotes] = useState(session.notes);
  // Inferred once from context; the switch is there for when they want otherwise.
  const [mode, setMode] = useState<TimerMode>(() => {
    try {
      return timerMode(
        { planned_minutes: session.planned_minutes, instant },
        parseMemory(localStorage.getItem(memoryKey)),
      );
    } catch {
      return timerMode(
        { planned_minutes: session.planned_minutes, instant },
        null,
      );
    }
  });
  const [custom, setCustom] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  const elapsed = sessionElapsed(session, stopAt ? Date.parse(stopAt) : now);
  const reading = timerReading(mode, elapsed);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  function choose(next: TimerMode) {
    setMode(next);
    setCustom(
      next.kind === "down" && !COUNTDOWN_PRESETS.includes(next.minutes as 25),
    );
    onMode(next);
  }
  const running = session.status === "running";
  return (
    <Dialog
      title={session.intent || session.title}
      description="Tập trung vào một việc, từng phiên một."
      onClose={onClose}
      wide
    >
      <div className="timer-modes" role="group" aria-label="Kiểu đồng hồ">
        <button
          className={mode.kind === "up" ? "selected" : ""}
          aria-pressed={mode.kind === "up"}
          onClick={() => choose({ kind: "up" })}
        >
          Đếm lên
        </button>
        <button
          className={mode.kind === "down" ? "selected" : ""}
          aria-pressed={mode.kind === "down"}
          onClick={() =>
            choose({ kind: "down", minutes: session.planned_minutes })
          }
        >
          Đếm ngược
        </button>
        {mode.kind === "down" && (
          <>
            {COUNTDOWN_PRESETS.map((m) => (
              <button
                key={m}
                className={!custom && mode.minutes === m ? "selected" : ""}
                aria-pressed={!custom && mode.minutes === m}
                onClick={() => choose({ kind: "down", minutes: m })}
              >
                {m} phút
              </button>
            ))}
            <button
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
      <p className="muted small timer-hint">
        {mode.kind === "up"
          ? "Chạy tới khi bạn dừng."
          : "Hết giờ vẫn ghi tiếp nếu bạn chưa dừng."}
      </p>
      <div className="timer-surface" ref={surface}>
        <span className="eyebrow">
          {stopAt ? statusText[session.status] : reading.label}
        </span>
        <div
          className={`countdown ${reading.overtime ? "overtime" : ""}`}
          role="timer"
          aria-label={`${reading.label} ${shortClock(reading.display)}`}
        >
          {mode.kind === "up"
            ? clockText(reading.display)
            : shortClock(reading.display)}
        </div>
        <p>
          {mode.kind === "up"
            ? `Dự kiến ${formatMinutes(session.planned_minutes)}`
            : `thực làm ${shortClock(reading.elapsed)}`}
        </p>
        <div className="timer-actions">
          {!stopAt && ["planned", "paused"].includes(session.status) && (
            <button
              className="button"
              disabled={busy}
              onClick={() => void onAction("start").catch(() => {})}
            >
              <Play size={18} />
              {session.status === "paused" ? "Tiếp tục" : "Bắt đầu"}
            </button>
          )}
          {!stopAt && running && (
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
              className="button primary"
              disabled={busy}
              onClick={() => void onAction("stop").catch(() => {})}
            >
              <Square size={17} />
              {stopAt ? "Thử ghi lại" : "Kết thúc"}
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
          Đồng hồ vẫn chạy khi đóng cửa sổ. Tạm dừng khi nghỉ; giờ vượt vẫn được
          ghi lại.
        </small>
      </div>
      {session.status === "review" && (
        <div className="form timer-review">
          <label>
            Một dòng ghi chú
            <textarea
              value={notes}
              maxLength={160}
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
