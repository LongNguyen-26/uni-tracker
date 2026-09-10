"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  CircleCheck,
  Clock3,
  Flag,
  GraduationCap,
  LayoutGrid,
  Leaf,
  LoaderCircle,
  LogIn,
  LogOut,
  Maximize2,
  Menu,
  Pencil,
  Play,
  Plus,
  Search,
  Settings2,
  Target,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import {
  CATEGORIES,
  MILESTONE_LABELS,
  daysBetween,
  elapsedShare,
  demoData,
  formatDate,
  streak,
  todayKey,
  type Activity,
  type Goal,
  type GoalInput,
  type ActivityInput,
  type Profile,
  type Semester,
  type GoalStep,
} from "@/lib/timeline";
import { ActivityForm, AuthForm, errorMessage } from "./forms";
import Dialog from "./dialog";
import { GoalForm, SettingsForm } from "./journey-forms";
import PlanningHub from "./planning";
import SetupGuide from "./setup-guide";
import SplitButton from "./split-button";
import { TimetableForm } from "./timetable";
import { setupGuidance, type SetupPart } from "@/lib/onboarding";
import dynamic from "next/dynamic";
const ImportDialog = dynamic(() => import("./import-dialog"));
const Preparation = dynamic(() => import("./preparation"));
import {
  goalProgressText,
  goalDateText,
  localDateTime,
  sessionElapsed,
  type FocusSession,
} from "@/lib/planning";
import { shortClock } from "@/lib/timer";
import type { StartHandle } from "./planning";
import {
  journeySemesters,
  journeySettings,
  sessionsOnDay,
  dayVisual,
  indexSessionsByDay,
  parseCalendarPreset,
  type TimetableEntry,
} from "@/lib/schedule";
import SessionEditor from "./session-editor";
import JourneyToolbar from "./journey-toolbar";
import MilestoneReminders from "./milestone-reminders";
import DatePicker from "./date-picker";
import { goalsInSemester, confirmMilestoneDate } from "@/lib/journey-view";
import { contractMilestoneWindow } from "@/lib/milestone-motion";
import type { ImportContext } from "@/lib/importer";
import { milestonesOnDay, datedMilestones } from "@/lib/milestones";
import SemesterRhythm from "./semester-rhythm";
import {
  activityLabel,
  compactMinutes,
  formatMinutes,
  isWork,
  summarizeDays,
  type DaySummary,
} from "@/lib/focus";
import {
  dayEffort,
  goalJourney,
  isAway,
  orderGoals,
  stripHeights,
  type GoalJourney,
  type GoalOrder,
} from "@/lib/journey";

type View = "timeline" | "goals" | "planning";
// Looking back is one place: the map of the years and the log that fills it.
type JourneyTab = "map" | "journal";
type Modal =
  | {
      kind:
        | "auth"
        | "recovery"
        | "settings"
        | "prepare"
        | "timetable"
        | "pick-goal";
    }
  | { kind: "import"; initialKind?: "timetable"; context?: ImportContext }
  | { kind: "session"; date?: string }
  | { kind: "goal"; goal?: Goal; date?: string }
  | { kind: "activity"; activity?: Activity; date?: string }
  | { kind: "delete"; table: "goals" | "activities"; id: string; title: string }
  | null;
// Ordered by how often a student opens them, not by importance.
const NAV = [
  { id: "planning" as const, label: "Tuần & phiên học", icon: Clock3 },
  { id: "goals" as const, label: "Mục tiêu của tôi", icon: Target },
  { id: "timeline" as const, label: "Hành trình đại học", icon: LayoutGrid },
];

function SemesterCard({
  semester,
  summaries,
  sessions,
  activities,
  goals,
  today,
  selectedDay,
  onDay,
  onOpen,
  zoomed = false,
}: {
  semester: Semester;
  summaries: Map<string, DaySummary>;
  sessions: FocusSession[];
  activities: Activity[];
  goals: Goal[];
  today: string;
  selectedDay: string | null;
  onDay: (day: string) => void;
  onOpen: () => void;
  zoomed?: boolean;
}) {
  const current = today >= semester.start && today <= semester.end;
  const sessionDays = useMemo(() => indexSessionsByDay(sessions), [sessions]);
  const future = today < semester.start;
  const total = activities.filter(
    (a) => a.occurred_on >= semester.start && a.occurred_on <= semester.end,
  ).length;
  const semesterGoals = goalsInSemester(goals, activities, sessions, semester);
  const ranges = datedMilestones(semesterGoals).filter(
    (m) =>
      m.start !== m.end && m.start <= semester.end && m.end >= semester.start,
  );
  const done = semesterGoals.filter((g) => g.progress === 100).length;
  return (
    <section
      className={`semester-card ${zoomed ? "zoomed" : ""} ${current ? "current" : ""} ${future ? "future" : ""}`}
      aria-label={`Năm ${semester.year}, học kỳ ${semester.term}`}
    >
      <div className="semester-heading">
        <div>
          <h3>
            <button
              className="text-button"
              onClick={onOpen}
              title={zoomed ? undefined : "Phóng to học kỳ này"}
            >
              {semester.label}
              {!zoomed && <Maximize2 size={14} />}
            </button>
          </h3>
          <span className="semester-date">
            {formatDate(semester.start, true)} —{" "}
            {formatDate(semester.end, true)}
          </span>
        </div>
        {current ? (
          <span className="badge green">
            <span className="status-dot" />
            Đang diễn ra
          </span>
        ) : (
          <span className="semester-status">
            {future ? "Sắp tới" : "Đã qua"}
          </span>
        )}
      </div>
      <div className="heatmap-scroll">
        <div
          className="heatmap-inner"
          style={{ "--weeks": semester.days.length / 7 } as React.CSSProperties}
        >
          <div className="month-labels">
            {semester.months.map((month, i) => (
              <span key={i} style={{ gridColumn: month.column }}>
                {month.label}
              </span>
            ))}
          </div>
          <div className="heatmap-body">
            <div className="weekday-labels">
              {(zoomed
                ? ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]
                : ["T2", "T4", "T6"]
              ).map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="heatmap">
              {semester.days.map((day, i) => {
                const outside =
                  !!day && (day < semester.start || day > semester.end);
                const holiday = day
                  ? semester.breaks.find((b) => day >= b.start && day <= b.end)
                  : undefined;
                const summary =
                  day && !outside ? summaries.get(day) : undefined;
                const visual = day
                  ? dayVisual(
                      day,
                      goals,
                      summary?.activities || [],
                      sessionDays.get(day) || [],
                    )
                  : undefined;
                const title = day
                  ? `${formatDate(day, true)}${outside ? " · Ngoài học kỳ" : holiday ? ` · ${holiday.label}` : ""} · ${formatMinutes(summary?.minutes || 0)}${summary?.label ? ` · ${summary.label}` : ""}${visual?.markers.length ? ` · ${visual.markers.map((m) => `${m.goal.title}: ${m.step.title}`).join(" · ")}` : ""}${visual?.plans.length ? ` · ${visual.plans.length} phiên dự định` : ""}${visual?.ranges.length ? ` · ${visual.ranges.map((g) => g.title).join(", ")}` : ""}`
                  : "";
                return day ? (
                  <div
                    data-day={day}
                    data-milestones={JSON.stringify(
                      visual?.markers
                        .filter((m) => m.start !== m.end)
                        .map((m) => JSON.stringify([m.goal.id, m.step.id])) ||
                        [],
                    )}
                    className={`day-slot ${visual?.ranges.length ? "range-day" : ""} ${visual?.uncertain ? "uncertain-range" : ""}`}
                    style={{
                      background: visual?.ranges.length
                        ? visual.rangeBackground
                        : undefined,
                    }}
                    key={day}
                  >
                    <button
                      type="button"
                      className={`day-cell ${outside ? "outside-term" : ""} ${holiday ? "holiday" : ""} ${day === today ? "today" : ""} ${day === selectedDay ? "selected" : ""} ${visual?.planned ? "has-plan" : ""} ${summary?.marker ? "has-marker" : ""}`}
                      style={{
                        background: visual?.background,
                        boxShadow: visual?.finalMarkers
                          .map(
                            (m, n) =>
                              `inset 0 0 0 ${2 + n * 2}px ${m.goal.color}`,
                          )
                          .join(", "),
                      }}
                      title={title}
                      aria-label={title}
                      aria-pressed={day === selectedDay}
                      disabled={outside}
                      onClick={() => onDay(day)}
                    >
                      {!!visual?.intermediate.length && (
                        <i
                          className={`milestone-corner ${visual.intermediate.some((m) => m.step.done) ? "done" : ""}`}
                          style={
                            {
                              "--milestone-color":
                                visual.intermediate[0].goal.color,
                            } as React.CSSProperties
                          }
                        />
                      )}
                      <span aria-hidden="true">
                        {summary?.marker === "★"
                          ? "★"
                          : visual?.fixed.length
                            ? summary?.marker
                            : ""}
                      </span>
                      {(summary?.colors.length || 0) > 4 && (
                        <i className="day-overflow" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                ) : (
                  <span className="day-cell blank" key={`blank-${i}`} />
                );
              })}
            </div>
          </div>
        </div>
      </div>
      {zoomed && ranges.length > 0 && (
        <div className="goal-ranges">
          <p className="muted small">
            Khoảng mục tiêu · không tính vào thời gian thực làm
          </p>
          {ranges.map(({ goal, step, start, end }) => (
            <div className="range-caption" key={goal.id + ":" + step.id}>
              <i style={{ background: goal.color }} />
              {goal.title}
              {step.is_final ? "" : ` · ${step.title}`} · {formatDate(start)}–
              {formatDate(end, true)} ·{" "}
              {step.timing_mode === "flexible"
                ? "Chưa chốt ngày"
                : "Khoảng đã xác định"}
            </div>
          ))}
        </div>
      )}
      <div className="semester-footer">
        <span>
          <span className={`status-dot ${total ? "active" : ""}`} />
          {total.toLocaleString("vi-VN")} hoạt động
        </span>
        <button className="text-button muted" onClick={onOpen}>
          {zoomed
            ? `${done}/${semesterGoals.length} mục tiêu`
            : "Phóng to học kỳ"}
          <ChevronRight size={14} />
        </button>
      </div>
    </section>
  );
}

// How long ago, said the way a person would say it.
function relativeDay(day: string, today: string) {
  const gap = daysBetween(day, today);
  return gap <= 0
    ? "hôm nay"
    : gap === 1
      ? "hôm qua"
      : gap < 7
        ? `${gap} ngày trước`
        : formatDate(day, gap > 300);
}

/**
 * The card answers "what have I put into this?" before "how far along is it?",
 * because the hours are the part the user actually lived.
 */
function GoalCard({
  goal,
  journey,
  today,
  onEdit,
  onComplete,
  onDelete,
  onConfirmDate,
  onContinue,
  busy,
}: {
  goal: Goal;
  journey: GoalJourney;
  today: string;
  onEdit: () => void;
  onComplete: () => void;
  onDelete: () => void;
  onConfirmDate: (goal: Goal, step: GoalStep) => void;
  onContinue: () => void;
  busy: boolean;
}) {
  const remaining = goal.deadline
    ? daysBetween(today, goal.deadline)
    : Infinity;
  const completed = goal.progress === 100;
  const heights = stripHeights(journey.weeks);
  return (
    <article
      className="goal-card"
      style={{ borderTop: `3px solid ${goal.color}` }}
    >
      <div className="goal-top">
        <span
          className={`category category-${CATEGORIES.indexOf(goal.category)}`}
        >
          <span className="color-dot" style={{ background: goal.color }} />
          {goal.category}
        </span>
        <div className="row-actions">
          <button
            className="icon-button"
            aria-label={`Sửa ${goal.title}`}
            onClick={onEdit}
          >
            <Pencil size={15} />
          </button>
          <button
            className="icon-button danger-hover"
            aria-label={`Xóa ${goal.title}`}
            onClick={onDelete}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      <button className="goal-title" onClick={onEdit}>
        {goal.title}
      </button>
      {goal.description && (
        <p className="goal-description">{goal.description}</p>
      )}
      {/* A finished goal with no logged time has nothing left to invite. */}
      {(journey.minutes > 0 || !completed) && (
        <div className="goal-effort">
          {journey.minutes > 0 ? (
            <>
              <strong style={{ color: goal.color }}>
                {formatMinutes(journey.minutes)}
              </strong>
              <span>
                {completed
                  ? "đã dồn vào trước khi hoàn thành"
                  : "đã dồn vào mục tiêu này"}
              </span>
              <dl className="figure-row compact">
                <div>
                  <dt>{journey.activeDays}</dt>
                  <dd>ngày có mặt</dd>
                </div>
                <div>
                  <dt>{journey.sessions}</dt>
                  <dd>phiên</dd>
                </div>
                {journey.streak >= 2 && (
                  <div>
                    <dt>{journey.streak}</dt>
                    <dd>ngày liên tục</dd>
                  </div>
                )}
              </dl>
            </>
          ) : (
            <>
              <strong className="effort-empty">Chưa ghi giờ nào</strong>
              <span>Phiên đầu tiên của bạn sẽ được lưu lại ở đây.</span>
            </>
          )}
        </div>
      )}
      {journey.minutes > 0 && (
        <>
          <div
            className="week-strip"
            role="img"
            aria-label={`${journey.weeks.length} tuần gần nhất: ${formatMinutes(journey.minutes)} tổng cộng`}
          >
            {journey.weeks.map((week, i) => (
              <span key={week.start} title={formatDate(week.start)}>
                {week.minutes > 0 && (
                  <i
                    style={{
                      height: `${Math.max(8, Math.round(heights[i] * 100))}%`,
                      background: goal.color,
                    }}
                  />
                )}
              </span>
            ))}
          </div>
          <p className="effort-meta">
            Tuần này {formatMinutes(journey.weekMinutes)}
            {journey.last && (
              <>
                <i className="meta-sep" />
                gần nhất {formatMinutes(journey.last.duration_minutes)},{" "}
                {relativeDay(journey.last.occurred_on, today)}
              </>
            )}
          </p>
        </>
      )}
      {!completed && isAway(journey) && (
        <p className="goal-away">
          Quay lại sau {journey.daysSinceLast} ngày.{" "}
          {formatMinutes(journey.minutes)} bạn đã bỏ ra vẫn còn nguyên.
        </p>
      )}
      {/* The final deadline already has its own row below; naming it here twice
          would say nothing. Only a real step earns this line. */}
      {!completed && journey.phase && !journey.phase.is_final && (
        <p className="goal-phase">
          <span>Chặng hiện tại</span>
          {journey.phase.title}
        </p>
      )}
      {goal.tracking_mode === "none" ? (
        <div className="measure-empty">
          <span>{completed ? "Đã hoàn thành" : "Chưa đặt thước đo"}</span>
          <button className="text-button" onClick={onEdit}>
            Thêm thước đo
          </button>
        </div>
      ) : goal.tracking_mode === "progress" ||
        goal.tracking_mode === "checklist" ? (
        <>
          <div className="progress-caption">
            <span>{completed ? "Đã hoàn thành" : "Tiến độ"}</span>
            <strong>
              {goalProgressText(goal)}
              {goal.tracking_mode === "checklist" ? ` · ${goal.progress}%` : ""}
            </strong>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label={goal.title}
            aria-valuenow={goal.progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span
              style={{ width: `${goal.progress}%`, background: goal.color }}
            />
          </div>
        </>
      ) : goal.tracking_mode === "numeric" ? (
        <div className="metric-caption" style={{ color: goal.color }}>
          <span>Mức hiện tại → mục tiêu</span>
          <strong>{goalProgressText(goal)}</strong>
        </div>
      ) : (
        <div className="milestone-caption" style={{ color: goal.color }}>
          <span>
            {completed ? "★" : "◆"} {MILESTONE_LABELS[goal.milestone_kind]}
          </span>
          <strong>{completed ? "Đã đạt" : "Chưa đạt"}</strong>
        </div>
      )}
      <MilestoneReminders
        goals={[goal]}
        today={today}
        onConfirm={onConfirmDate}
      />
      <div className="goal-bottom">
        <span
          className={`deadline ${!completed && remaining < 0 ? "overdue" : ""}`}
        >
          <CalendarDays size={14} />
          {goalDateText(goal)}
        </span>
        {completed ? (
          <span className="done-label">
            <CircleCheck size={15} />
            Hoàn thành
          </span>
        ) : (
          <div className="goal-actions">
            {/* Continuing is the everyday act; finishing happens once. */}
            <button
              className="button primary continue-button"
              onClick={onContinue}
            >
              <Play size={15} />
              {journey.minutes > 0 ? "Tiếp tục" : "Bắt đầu"}
            </button>
            <button
              className="icon-button complete-button"
              disabled={busy}
              onClick={onComplete}
              aria-label={`Hoàn thành ${goal.title}`}
              title="Đánh dấu hoàn thành"
            >
              <Check size={17} />
            </button>
          </div>
        )}
      </div>
      {!completed && remaining <= 7 && (
        <p className={`due-hint ${remaining < 0 ? "overdue" : ""}`}>
          {remaining < 0
            ? `Quá hạn ${-remaining} ngày`
            : remaining === 0
              ? "Đến hạn hôm nay"
              : `Còn ${remaining} ngày`}
        </p>
      )}
    </article>
  );
}

export default function Tracker() {
  const [today, setToday] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [setupSchedule, setSetupSchedule] = useState<{
    userId: string;
    entries: TimetableEntry[];
  } | null>(null);
  const [planRequest, setPlanRequest] = useState(false);
  const accountId = user?.id;
  const receiveTimetable = useCallback(
    (entries: TimetableEntry[]) => {
      if (accountId) setSetupSchedule({ userId: accountId, entries });
    },
    [accountId],
  );
  const [sessionRequest, setSessionRequest] = useState<string | null>(null);
  const [journalGoal, setJournalGoal] = useState("all");
  const [preset, setPreset] = useState<Partial<Profile> | null>(null);
  const didChooseView = useRef(false);
  const authenticatedId = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<View>("planning");
  const [journeyTab, setJourneyTab] = useState<JourneyTab>("map");
  // Continuing beats starting over, so recency leads and deadlines are a choice.
  const [goalOrder, setGoalOrder] = useState<GoalOrder>("recent");
  const startHub = useRef<StartHandle | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [zoom, setZoom] = useState("all");
  const [accountOpen, setAccountOpen] = useState(false);
  const [semesterFilter, setSemesterFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [journalLimit, setJournalLimit] = useState(30);
  const [mobileNav, setMobileNav] = useState(false);
  const [hiddenGoals, setHiddenGoals] = useState<string[]>([]);
  const [dateConfirmation, setDateConfirmation] = useState<{
    goal: Goal;
    step: GoalStep;
    day: string;
  } | null>(null);
  const [dateError, setDateError] = useState("");
  const version = useRef({ value: 0 });
  const showDemo = useCallback(() => {
    const day = todayKey();
    const demo = demoData(day);
    setProfile(demo.profile);
    setGoals(demo.goals);
    setActivities(demo.activities);
    setLoading(false);
  }, []);
  const loadData = useCallback(async (currentUser: User) => {
    const requestVersion = ++version.current.value;
    const db = getSupabase();
    if (!db) return;
    setLoadError("");
    try {
      const [profileResult, allGoals] = await Promise.all([
        db.from("profiles").select("*").eq("id", currentUser.id).maybeSingle(),
        (async () => {
          const rows: Goal[] = [];
          for (let from = 0; ; from += 1000) {
            const result = await db
              .from("goals")
              .select("*")
              .eq("user_id", currentUser.id)
              .order("deadline")
              .order("id")
              .range(from, from + 999);
            if (result.error) throw result.error;
            rows.push(...(result.data as Goal[]));
            if (result.data.length < 1000) return rows;
          }
        })(),
      ]);
      if (profileResult.error) throw profileResult.error;
      // Supabase caps each response. Read every activity page so a four-year heatmap stays complete.
      const allActivities: Activity[] = [];
      for (let from = 0; ; from += 1000) {
        const result = await db
          .from("activities")
          .select("*")
          .eq("user_id", currentUser.id)
          .order("occurred_on", { ascending: false })
          .order("id")
          .range(from, from + 999);
        if (result.error) throw result.error;
        allActivities.push(...(result.data as Activity[]));
        if (result.data.length < 1000) break;
      }
      if (requestVersion !== version.current.value) return;
      const savedProfile = profileResult.data as Profile | null;
      const resolvedProfile: Profile = savedProfile || {
        id: currentUser.id,
        display_name: currentUser.user_metadata.display_name || "Bạn",
        start_year: new Date().getFullYear(),
        start_month: 8,
        study_years: 4,
        semester_settings: [],
        wake_minutes: 420,
        sleep_minutes: 1380,
        confirmed_semesters: [],
      };
      if (!savedProfile) {
        const recovery = await db.from("profiles").upsert(resolvedProfile, {
          onConflict: "id",
          ignoreDuplicates: true,
        });
        if (recovery.error) throw recovery.error;
      }
      if (requestVersion !== version.current.value) return;
      setProfile(resolvedProfile);
      setGoals(allGoals);
      setHiddenGoals((previous) =>
        previous.filter((id) => allGoals.some((g) => g.id === id)),
      );
      setActivities(allActivities);
      if (!savedProfile && (allGoals.length || allActivities.length))
        setModal((previous) =>
          previous?.kind === "recovery" ? previous : { kind: "settings" },
        );
    } catch (error) {
      if (requestVersion === version.current.value)
        setLoadError(errorMessage(error));
    } finally {
      if (requestVersion === version.current.value) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const db = getSupabase();
    const initialize = window.setTimeout(() => {
      setToday(todayKey());
      if (!db) showDemo();
    }, 0);
    if (!db) return () => clearTimeout(initialize);
    const requests = version.current;
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange((event, session) => {
      const currentUser = session?.user || null;
      const sameAccount = authenticatedId.current === currentUser?.id;
      authenticatedId.current = currentUser?.id || null;
      setUser(currentUser);
      if (event === "PASSWORD_RECOVERY") setModal({ kind: "recovery" });
      if (currentUser) {
        if (
          event === "INITIAL_SESSION" ||
          (event === "SIGNED_IN" && !sameAccount) ||
          event === "PASSWORD_RECOVERY"
        ) {
          setLoading(true);
          setProfile(null);
          setGoals([]);
          setActivities([]);
          setSessions([]);
          setSetupSchedule(null);
          setPlanRequest(false);
          void loadData(currentUser);
        }
      } else {
        version.current.value++;
        didChooseView.current = false;
        setSessions([]);
        setSessionRequest(null);
        setSelectedDay(null);
        setHiddenGoals([]);
        showDemo();
      }
    });
    const timer = window.setInterval(() => setToday(todayKey()), 60000);
    return () => {
      subscription.unsubscribe();
      requests.value++;
      clearInterval(timer);
      clearTimeout(initialize);
    };
  }, [loadData, showDemo]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  const semesters = useMemo(
    () => (profile ? journeySemesters(profile) : []),
    [profile],
  );
  const receiveSessions = useCallback(
    (rows: FocusSession[]) => {
      setSessions(rows);
      if (rows.length && profile && !didChooseView.current) {
        didChooseView.current = true;
        const current = journeySemesters(profile).find(
          (s) => todayKey() >= s.start && todayKey() <= s.end,
        );
        if (current) {
          setZoom(String(current.index));
        }
      }
    },
    [profile],
  );
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("calendar");
    if (!raw) return;
    try {
      const candidate = parseCalendarPreset(raw);
      window.setTimeout(() => setPreset(candidate), 0);
    } catch {
      window.setTimeout(
        () =>
          setNotice(
            "Liên kết mẫu lịch không hợp lệ. Bạn vẫn có thể chỉnh lịch trong cài đặt.",
          ),
        0,
      );
    }
  }, []);
  const workActivities = useMemo(() => activities.filter(isWork), [activities]);
  const visibleGoals = useMemo(
    () => goals.filter((g) => !hiddenGoals.includes(g.id)),
    [goals, hiddenGoals],
  );
  const visibleActivities = useMemo(
    () =>
      activities.filter((a) => !a.goal_id || !hiddenGoals.includes(a.goal_id)),
    [activities, hiddenGoals],
  );
  const visibleSessions = useMemo(
    () =>
      sessions.filter((s) => !s.goal_id || !hiddenGoals.includes(s.goal_id)),
    [sessions, hiddenGoals],
  );
  const summaries = useMemo(
    () => summarizeDays(visibleGoals, visibleActivities),
    [visibleGoals, visibleActivities],
  );
  const activeGoals = goals.filter((g) => g.progress < 100);
  const completedGoals = goals.filter((g) => g.progress === 100);
  // A badge only earns its place when it points at something to deal with.
  const overdueGoals = activeGoals.filter(
    (g) => !!g.deadline && g.deadline < today,
  );
  const runningSession = sessions.find((s) => s.status === "running");
  // The clock in the top bar only needs to tick while something is running.
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    if (!runningSession) return;
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [runningSession]);
  // A session already sitting on today's grid is what "start" should resume:
  // whatever was paused, otherwise the earliest one still waiting.
  const todaySessions = sessions
    .filter(
      (s) =>
        localDateTime(s.scheduled_start).slice(0, 10) === today &&
        (s.status === "planned" || s.status === "paused"),
    )
    .sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start));
  const nextToday =
    todaySessions.find((s) => s.status === "paused") || todaySessions[0];
  const todayEffort = dayEffort(activities, today);
  const journeys = useMemo(() => {
    const map = new Map<string, GoalJourney>();
    for (const goal of goals)
      map.set(goal.id, goalJourney(goal, activities, today));
    return map;
  }, [goals, activities, today]);
  const deadlines = activeGoals
    .filter((g): g is Goal & { deadline: string } => !!g.deadline)
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
  const recent = [...activities].sort(
    (a, b) =>
      b.occurred_on.localeCompare(a.occurred_on) ||
      b.created_at.localeCompare(a.created_at),
  );
  const currentSemester = semesters.find(
    (s) => today >= s.start && today <= s.end,
  );
  // The numbers that used to sit in cards, as one line under the title.
  const shownSemester =
    zoom === "all" ? currentSemester : semesters[Number(zoom)];
  const termMeta = shownSemester
    ? (() => {
        const logs = workActivities.filter(
          (a) =>
            a.occurred_on >= shownSemester.start &&
            a.occurred_on <= shownSemester.end,
        );
        const weeks = Math.round(shownSemester.days.length / 7);
        const week = Math.min(
          weeks,
          Math.floor(daysBetween(shownSemester.start, today) / 7) + 1,
        );
        return {
          weeks,
          week: today > shownSemester.end ? weeks : Math.max(1, week),
          current: today >= shownSemester.start && today <= shownSemester.end,
          minutes: logs.reduce((n, a) => n + Number(a.duration_minutes), 0),
          days: new Set(logs.map((a) => a.occurred_on)).size,
        };
      })()
    : null;
  // The card names one semester and gives its two dates, so it reports that
  // semester. Outside term time there is no semester to measure, and it falls
  // back to the whole journey.
  const journeyProgress = currentSemester
    ? elapsedShare(currentSemester.start, currentSemester.end, today)
    : semesters.length
      ? elapsedShare(
          semesters[0].start,
          semesters[semesters.length - 1].end,
          today,
        )
      : 0;
  function navigate(next: View, tab: JourneyTab = "map") {
    setView(next);
    setJourneyTab(tab);
    setQuery("");
    setMobileNav(false);
    setSemesterFilter("all");
  }
  function openSetupPart(part: SetupPart | "all") {
    const destination = part === "goals" ? "goals" : "planning";
    navigate(destination);
    if (destination === "goals") {
      setStatusFilter("all");
      setCategoryFilter("all");
    }
    if (part === "activities") {
      setModal(null);
      setPlanRequest(true);
    } else {
      setPlanRequest(false);
      setModal({
        kind: "import",
        context: part,
        initialKind: part === "timetable" ? "timetable" : undefined,
      });
    }
  }
  function openWrite(next: Modal) {
    setModal(user ? next : { kind: "auth" });
  }
  function requireUser() {
    const db = getSupabase();
    if (!user || !db)
      throw new Error("Hãy đăng nhập để lưu hành trình của bạn.");
    return { db, currentUser: user };
  }
  async function saveGoal(data: GoalInput, id?: string) {
    const { db, currentUser } = requireUser();
    const result = id
      ? await db
          .from("goals")
          .update(data)
          .eq("id", id)
          .eq("user_id", currentUser.id)
          .select()
          .single()
      : await db
          .from("goals")
          .insert({ ...data, user_id: currentUser.id })
          .select()
          .single();
    if (result.error) throw result.error;
    await loadData(currentUser);
    setNotice("Đã lưu mục tiêu.");
  }
  async function saveActivity(data: ActivityInput, id?: string) {
    const { db, currentUser } = requireUser();
    const result = id
      ? await db
          .from("activities")
          .update(data)
          .eq("id", id)
          .eq("user_id", currentUser.id)
          .select()
          .single()
      : await db
          .from("activities")
          .insert({ ...data, kind: "event", user_id: currentUser.id })
          .select()
          .single();
    if (result.error) throw result.error;
    await loadData(currentUser);
    setNotice("Đã lưu một bước tiến mới.");
  }
  async function saveProfile(data: Profile) {
    const { db, currentUser } = requireUser();
    const { error } = await db
      .from("profiles")
      .upsert({ ...data, id: currentUser.id });
    if (error) throw error;
    setProfile(data);
    setPreset(null);
    if (zoom !== "all" && Number(zoom) >= data.study_years * 2) setZoom("all");
    setNotice("Đã cập nhật hành trình.");
  }
  async function completeGoal(goal: Goal) {
    if (!user) {
      setModal({ kind: "auth" });
      return;
    }
    setBusy(true);
    try {
      await saveGoal(
        {
          starts_on: goal.starts_on,
          timing_mode: goal.timing_mode,
          reserved_hours: goal.reserved_hours,
          semester_index: goal.semester_index,
          metric_current:
            goal.tracking_mode === "numeric"
              ? goal.metric_target
              : goal.metric_current,
          metric_target: goal.metric_target,
          metric_unit: goal.metric_unit,
          metric_direction: goal.metric_direction,
          checklist: goal.checklist.map((s) => ({ ...s, done: true })),
          title: goal.title,
          description: goal.description,
          category: goal.category,
          color: goal.color,
          tracking_mode: goal.tracking_mode,
          milestone_kind: goal.milestone_kind,
          deadline: goal.deadline,
          progress: 100,
          completed_on: today,
        },
        goal.id,
      );
      setNotice("Thêm một mục tiêu hoàn thành. Chúc mừng bạn!");
    } catch (err) {
      setNotice(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function removeItem() {
    if (modal?.kind !== "delete") return;
    setBusy(true);
    try {
      const { db, currentUser } = requireUser();
      const result = await db
        .from(modal.table)
        .delete()
        .eq("id", modal.id)
        .eq("user_id", currentUser.id)
        .select("id")
        .single();
      if (result.error) throw result.error;
      await loadData(currentUser);
      setModal(null);
      setNotice("Đã xóa.");
    } catch (err) {
      setNotice(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    const db = getSupabase();
    if (!db) return;
    const { error } = await db.auth.signOut();
    if (error) setNotice(errorMessage(error));
    else {
      setModal(null);
      setNotice("Đã đăng xuất.");
    }
  }
  async function exportData() {
    if (!user) return;
    setBusy(true);
    try {
      const db = getSupabase()!;
      const result = await db.rpc("export_tracker");
      if (result.error) throw result.error;
      const blob = new Blob([JSON.stringify(result.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `uni-tracker-${today}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function openDateConfirmation(goal: Goal, step: GoalStep) {
    if (!user) {
      setModal({ kind: "auth" });
      return;
    }
    setDateError("");
    setDateConfirmation({ goal, step, day: step.date || today });
  }
  async function confirmDate(day: string) {
    if (!dateConfirmation || busy) return;
    setBusy(true);
    setDateError("");
    setDateConfirmation({ ...dateConfirmation, day });
    try {
      const { db, currentUser } = requireUser();
      const fresh = await db
        .from("goals")
        .select("*")
        .eq("id", dateConfirmation.goal.id)
        .eq("user_id", currentUser.id)
        .single();
      if (fresh.error) throw fresh.error;
      const update = confirmMilestoneDate(
        fresh.data as Goal,
        dateConfirmation.step.id,
        day,
      );
      const saved = await db
        .from("goals")
        .update(update)
        .eq("id", fresh.data.id)
        .eq("user_id", currentUser.id)
        .select()
        .single();
      if (saved.error) throw saved.error;
      contractMilestoneWindow(saved.data.id, dateConfirmation.step.id, day);
      setGoals((prev) =>
        prev.map((g) => (g.id === saved.data.id ? (saved.data as Goal) : g)),
      );
      setDateConfirmation(null);
      setNotice(
        `Đã chốt ${dateConfirmation.goal.title}: ${formatDate(day, true)}.`,
      );
    } catch (e) {
      setDateError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function renderGoal(goal: Goal) {
    return (
      <GoalCard
        key={goal.id}
        goal={goal}
        journey={journeys.get(goal.id) || goalJourney(goal, activities, today)}
        today={today}
        busy={busy}
        onConfirmDate={openDateConfirmation}
        onContinue={() =>
          user
            ? startHub.current?.start({ kind: "now", goalId: goal.id })
            : setModal({ kind: "auth" })
        }
        onEdit={() => openWrite({ kind: "goal", goal })}
        onComplete={() => void completeGoal(goal)}
        onDelete={() =>
          openWrite({
            kind: "delete",
            table: "goals",
            id: goal.id,
            title: goal.title,
          })
        }
      />
    );
  }

  const filteredGoals = orderGoals(goals, activities, goalOrder).filter((g) => {
    const sem =
      semesterFilter === "all" ? null : semesters[Number(semesterFilter)];
    return (
      (statusFilter === "all" ||
        (statusFilter === "done"
          ? g.progress === 100
          : statusFilter === "overdue"
            ? g.progress < 100 && !!g.deadline && g.deadline < today
            : g.progress < 100)) &&
      (categoryFilter === "all" || g.category === categoryFilter) &&
      (!sem ||
        (!!g.deadline &&
          g.deadline >= sem.start &&
          (g.starts_on || g.deadline) <= sem.end)) &&
      g.title.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi"))
    );
  });
  const filteredActivities = recent.filter(
    (a) =>
      (journalGoal === "all" ||
        (journalGoal === "unassigned"
          ? !a.goal_id
          : a.goal_id === journalGoal)) &&
      `${a.title} ${a.notes}`
        .toLocaleLowerCase("vi")
        .includes(query.toLocaleLowerCase("vi")),
  );
  // Each day header carries what that day added up to, so scrolling the
  // journal answers "how much" without opening anything.
  const journalDayMinutes = new Map<string, number>();
  for (const a of filteredActivities) {
    if (!isWork(a) || Number(a.duration_minutes) <= 0) continue;
    journalDayMinutes.set(
      a.occurred_on,
      (journalDayMinutes.get(a.occurred_on) || 0) + Number(a.duration_minutes),
    );
  }
  const dayActivities = selectedDay
    ? recent.filter((a) => a.occurred_on === selectedDay)
    : [];
  const dayGoals = selectedDay
    ? goals.filter(
        (g) =>
          !!g.deadline &&
          g.deadline >= selectedDay &&
          (g.starts_on || g.deadline) <= selectedDay,
      )
    : [];

  const setupCounts =
    user && setupSchedule?.userId === user.id
      ? {
          timetable: setupSchedule.entries.length,
          goals: goals.length,
          activities: sessions.length,
        }
      : null;
  const setupDone = setupCounts
    ? setupGuidance(setupCounts, "planning").done
    : 3;
  const setupGuide =
    user && setupCounts && (view === "goals" || view === "planning") ? (
      <SetupGuide
        key={user.id}
        userId={user.id}
        page={view}
        counts={setupCounts}
        onOpen={openSetupPart}
      />
    ) : null;

  if (
    profile &&
    user &&
    !loading &&
    !loadError &&
    modal?.kind !== "recovery" &&
    (!profile.preparation_done || modal?.kind === "prepare")
  ) {
    return (
      <Preparation
        key={user.id}
        profile={profile}
        goals={goals}
        activities={activities}
        onSave={saveProfile}
        onSaveGoal={saveGoal}
        onReload={() => loadData(user)}
        onFinish={async () => {
          await saveProfile({ ...profile, preparation_done: true });
          setModal(null);
          setView("planning");
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="Đóng menu"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <Link className="brand" href="/" aria-label="Uni Tracker trang chủ">
          <span className="brand-mark">
            <GraduationCap size={24} strokeWidth={1.8} />
          </span>
          <span>
            uni<span className="brand-light">tracker</span>
            <span className="brand-dot">.</span>
          </span>
        </Link>
        <nav aria-label="Điều hướng chính">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={18} />
              {item.label}
              {item.id === "goals" && overdueGoals.length > 0 && (
                <span
                  className="nav-count"
                  title={`${overdueGoals.length} mục tiêu đã quá hạn`}
                >
                  {overdueGoals.length}
                </span>
              )}
            </button>
          ))}
        </nav>
        {user && setupCounts && setupDone < 3 && (
          <button
            className="sidebar-setup"
            onClick={() => openSetupPart("all")}
          >
            <span>
              Thiết lập
              <strong>{setupDone}/3</strong>
            </span>
            <span className="setup-track" aria-hidden="true">
              <i style={{ width: `${(setupDone / 3) * 100}%` }} />
            </span>
            <small>
              {!setupCounts.timetable
                ? "Còn thời khóa biểu"
                : !setupCounts.goals
                  ? "Còn mục tiêu học kỳ"
                  : "Còn kế hoạch tự học"}
            </small>
          </button>
        )}
        {/* The day so far, then the one act that changes it. Room in the rail
            is filled with something to do, not with space. */}
        <div className="sidebar-today">
          <span>Hôm nay</span>
          <strong>
            {todayEffort.minutes > 0
              ? formatMinutes(todayEffort.minutes)
              : "Chưa ghi giờ"}
          </strong>
          <small>
            {todayEffort.sessions > 0
              ? `${todayEffort.sessions} phiên đã ghi`
              : "Bắt đầu để hôm nay có gì đó"}
          </small>
          <button
            className="button primary"
            onClick={() =>
              !user
                ? setModal({ kind: "auth" })
                : startHub.current?.start(
                    nextToday
                      ? { kind: "session", id: nextToday.id }
                      : { kind: "now" },
                  )
            }
          >
            <Play size={16} />
            {nextToday ? "Tiếp tục phiên" : "Bắt đầu phiên"}
          </button>
        </div>
        <div className="sidebar-bottom">
          <button
            className="nav-item"
            onClick={() => openWrite({ kind: "settings" })}
          >
            <Settings2 size={18} />
            Cài đặt
          </button>
          <div className="account">
            <span className="avatar">
              {user
                ? (profile?.display_name || user.email || "U")
                    .slice(0, 1)
                    .toUpperCase()
                : "U"}
            </span>
            <div>
              <strong>
                {user ? profile?.display_name || "Tài khoản" : "Khách khám phá"}
              </strong>
              <span>
                {user ? "Hành trình cá nhân" : "Đang xem dữ liệu mẫu"}
              </span>
            </div>
            <button
              className="icon-button"
              aria-label={user ? "Đăng xuất" : "Đăng nhập"}
              onClick={() =>
                user ? void logout() : setModal({ kind: "auth" })
              }
            >
              {user ? <LogOut size={18} /> : <LogIn size={18} />}
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Mở menu"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={20} />
            </button>
            <span>Không gian cá nhân</span>
            <ChevronRight size={14} />
            <strong>{NAV.find((n) => n.id === view)?.label}</strong>
          </div>
          <div className="topbar-right">
            {/* The one thing that must never be more than a click away. It sits
                in the frame, not on a page, so it is reachable from all of them. */}
            {user && runningSession ? (
              <button
                className="focus-bar running"
                onClick={() => setSessionRequest(runningSession.id)}
              >
                <span className="running-dot" aria-hidden="true" />
                <span className="focus-clock">
                  {shortClock(sessionElapsed(runningSession, tick))}
                </span>
                <span className="focus-title">{runningSession.title}</span>
              </button>
            ) : (
              <button
                className="focus-bar"
                onClick={() =>
                  !user
                    ? setModal({ kind: "auth" })
                    : startHub.current?.start(
                        nextToday
                          ? { kind: "session", id: nextToday.id }
                          : { kind: "now" },
                      )
                }
              >
                <Play size={15} />
                <span className="focus-title">
                  {nextToday ? `Tiếp tục · ${nextToday.title}` : "Bắt đầu ngay"}
                </span>
              </button>
            )}
            <span className="today-label">
              <CalendarDays size={15} />
              {today && formatDate(today, true)}
            </span>
            {user ? (
              <div
                className="account-menu"
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget))
                    setAccountOpen(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setAccountOpen(false);
                }}
              >
                <button
                  className="avatar-button"
                  aria-label="Tài khoản của bạn"
                  aria-expanded={accountOpen}
                  onClick={() => setAccountOpen(!accountOpen)}
                >
                  {(profile?.display_name || user.email || "U")
                    .trim()
                    .split(/\s+/)
                    .slice(-2)
                    .map((w) => w[0])
                    .join("")
                    .toUpperCase()}
                </button>
                {accountOpen && (
                  <div className="account-popover">
                    <strong>{profile?.display_name}</strong>
                    <small>{user.email}</small>
                    <button
                      onClick={() => {
                        setAccountOpen(false);
                        setModal({ kind: "settings" });
                      }}
                    >
                      <Settings2 size={16} />
                      Cài đặt
                    </button>
                    <button
                      onClick={() => {
                        setAccountOpen(false);
                        void logout();
                      }}
                    >
                      <LogOut size={16} />
                      Đăng xuất
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                className="button small-button"
                onClick={() => setModal({ kind: "auth" })}
              >
                Đăng nhập
                <ArrowRight size={15} />
              </button>
            )}
          </div>
        </header>
        <main id="main" className="main-content">
          {preset && (
            <div className="term-confirm">
              <span>
                Liên kết có mẫu lịch học kỳ. Xem lại trước khi áp dụng.
              </span>
              <button
                className="text-button"
                onClick={() => setModal({ kind: user ? "settings" : "auth" })}
              >
                Xem mẫu lịch
              </button>
              <button className="text-button" onClick={() => setPreset(null)}>
                Bỏ qua
              </button>
            </div>
          )}
          {!user && !loading && (
            <div className="demo-banner">
              <span>
                <span className="badge">BẢN XEM THỬ</span>Khám phá một hành
                trình mẫu. Đăng nhập để bắt đầu hành trình của bạn.
              </span>
              <button
                className="text-button"
                onClick={() => setModal({ kind: "auth" })}
              >
                Tạo hành trình
                <ArrowRight size={15} />
              </button>
            </div>
          )}
          <div className="page-heading" hidden={view === "planning"}>
            <div>
              <h1>
                {view === "goals"
                  ? "Mục tiêu của tôi"
                  : journeyTab === "journal"
                    ? "Nhật ký hoạt động"
                    : "Hành trình đại học"}
                <span className="heading-dot">.</span>
              </h1>
              {/* Context reads as one quiet line; the numbers worth comparing
                  get their own row instead of a chain of small print. */}
              {view === "timeline" &&
              journeyTab === "map" &&
              shownSemester &&
              termMeta ? (
                <>
                  <p>
                    Năm {shownSemester.year} · học kỳ {shownSemester.term} ·
                    tuần {termMeta.week}/{termMeta.weeks}
                  </p>
                  <dl className="figure-row">
                    <div>
                      <dt>{compactMinutes(termMeta.minutes)}</dt>
                      <dd>đã ghi kỳ này</dd>
                    </div>
                    <div>
                      <dt>{termMeta.days}</dt>
                      <dd>ngày có học</dd>
                    </div>
                    {termMeta.current && (
                      <div>
                        <dt>{streak(workActivities, today)}</dt>
                        <dd>ngày liên tục</dd>
                      </div>
                    )}
                  </dl>
                </>
              ) : (
                view === "timeline" &&
                journeyTab === "map" && (
                  <p>
                    {profile?.study_years || 4} năm ·{" "}
                    {(profile?.study_years || 4) * 2} học kỳ
                  </p>
                )
              )}
            </div>
            {(view === "goals" ||
              (view === "timeline" && journeyTab === "journal")) && (
              <div className="heading-actions">
                {view === "goals" ? (
                  <SplitButton
                    label="Thêm mục tiêu"
                    onClick={() => openWrite({ kind: "goal" })}
                    actions={[
                      {
                        id: "import",
                        icon: Upload,
                        label: "Nhập mục tiêu từ file…",
                        hint: "Kèm cột mốc, nhập một lượt",
                        onSelect: () =>
                          openWrite({ kind: "import", context: "goals" }),
                      },
                      {
                        id: "milestone",
                        icon: Flag,
                        label: "Thêm cột mốc…",
                        hint: goals.length
                          ? "Vào một mục tiêu đã có"
                          : "Cần có mục tiêu trước",
                        disabled: !goals.length,
                        onSelect: () =>
                          openWrite(
                            goals.length === 1
                              ? { kind: "goal", goal: goals[0] }
                              : { kind: "pick-goal" },
                          ),
                      },
                    ]}
                  />
                ) : (
                  <button
                    className="button primary"
                    onClick={() => openWrite({ kind: "session" })}
                  >
                    <Plus size={17} />
                    Thêm phiên
                  </button>
                )}
              </div>
            )}
          </div>
          {loadError && (
            <div role="alert" className="error-banner">
              Không tải được dữ liệu: {loadError}
              <button
                className="button"
                onClick={() => {
                  if (user) {
                    setLoading(true);
                    void loadData(user);
                  }
                }}
              >
                Thử lại
              </button>
            </div>
          )}
          {loading ? (
            <div className="loading-state">
              <LoaderCircle className="spin" size={28} />
              <p>Đang mở hành trình của bạn…</p>
            </div>
          ) : (
            profile && (
              <>
                {view === "goals" && setupGuide}
                {view === "timeline" && (
                  <>
                    {/* Looking back has two faces: the shape of the years, and
                        the days that made it. They belong on one page. */}
                    <div className="journey-tabs" role="tablist">
                      {(
                        [
                          ["map", "Bản đồ hành trình"],
                          ["journal", "Nhật ký hoạt động"],
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          role="tab"
                          aria-selected={journeyTab === id}
                          className={journeyTab === id ? "selected" : ""}
                          onClick={() => {
                            setJourneyTab(id);
                            setQuery("");
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {journeyTab === "journal" ? (
                      <section className="journal-section">
                        <div className="filter-bar">
                          <h2>
                            {activities.length.toLocaleString("vi-VN")} hoạt
                            động đã ghi lại
                          </h2>
                          <select
                            aria-label="Lọc nhật ký theo mục tiêu"
                            value={journalGoal}
                            onChange={(e) => {
                              setJournalGoal(e.target.value);
                              setJournalLimit(30);
                            }}
                          >
                            <option value="all">Tất cả mục tiêu</option>
                            <option value="unassigned">
                              Không gắn mục tiêu / đã xóa
                            </option>
                            {goals.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.title}
                              </option>
                            ))}
                          </select>
                          <label className="search-field">
                            <Search size={17} />
                            <input
                              aria-label="Tìm hoạt động"
                              placeholder="Tìm trong nhật ký…"
                              value={query}
                              onChange={(e) => {
                                setQuery(e.target.value);
                                setJournalLimit(30);
                              }}
                            />
                          </label>
                        </div>
                        {filteredActivities
                          .slice(0, journalLimit)
                          .map((activity, index, list) => (
                            <div key={activity.id}>
                              {(index === 0 ||
                                list[index - 1].occurred_on !==
                                  activity.occurred_on) && (
                                <h3 className="journal-date">
                                  <span>
                                    {activity.occurred_on === today
                                      ? "Hôm nay"
                                      : formatDate(activity.occurred_on, true)}
                                  </span>
                                  {journalDayMinutes.get(
                                    activity.occurred_on,
                                  ) ? (
                                    <b>
                                      {compactMinutes(
                                        journalDayMinutes.get(
                                          activity.occurred_on,
                                        ) || 0,
                                      )}
                                    </b>
                                  ) : null}
                                </h3>
                              )}
                              {/* One card, one row: the goal's icon, the title,
                                  and the number the eye actually scans for. */}
                              <article className="journal-entry">
                                <span
                                  className="journal-icon"
                                  style={{
                                    color: activity.color,
                                    background: `${activity.color}18`,
                                  }}
                                  aria-hidden="true"
                                >
                                  {activity.kind === "completion" ? (
                                    <CircleCheck size={18} />
                                  ) : activity.is_milestone ? (
                                    <Flag size={18} />
                                  ) : (
                                    <BookOpen size={18} />
                                  )}
                                </span>
                                <div>
                                  <h3>
                                    {activity.is_milestone ? "★ " : ""}
                                    {activity.title}
                                  </h3>
                                  <p className="entry-context">
                                    {activityLabel(activity) !==
                                      "Hoạt động" && (
                                      <span className="entry-kind">
                                        {activityLabel(activity)}
                                      </span>
                                    )}
                                    {activity.goal_title && (
                                      <span>
                                        {goals.find(
                                          (g) => g.id === activity.goal_id,
                                        )?.title || activity.goal_title}
                                      </span>
                                    )}
                                  </p>
                                  {activity.notes && <p>{activity.notes}</p>}
                                </div>
                                <span className="entry-duration">
                                  {activity.duration_minutes > 0
                                    ? formatMinutes(activity.duration_minutes)
                                    : ""}
                                </span>
                                {
                                  <div className="row-actions">
                                    <button
                                      className="icon-button"
                                      aria-label={`Sửa hoạt động ${activity.title}`}
                                      onClick={() =>
                                        openWrite({
                                          kind: "activity",
                                          activity,
                                        })
                                      }
                                    >
                                      <Pencil size={16} />
                                    </button>
                                    <button
                                      className="icon-button danger-hover"
                                      aria-label={`Xóa hoạt động ${activity.title}`}
                                      onClick={() =>
                                        openWrite({
                                          kind: "delete",
                                          table: "activities",
                                          id: activity.id,
                                          title: activity.title,
                                        })
                                      }
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                }
                              </article>
                            </div>
                          ))}
                        {filteredActivities.length > journalLimit && (
                          <button
                            className="button load-more"
                            onClick={() => setJournalLimit(journalLimit + 30)}
                          >
                            Xem thêm hoạt động
                          </button>
                        )}
                        {!filteredActivities.length && (
                          <div className="empty-state">
                            <BookOpen size={34} />
                            <h3>
                              {query
                                ? "Không tìm thấy hoạt động"
                                : "Nhật ký đang chờ câu chuyện của bạn"}
                            </h3>
                            <p>
                              Ghi lại việc đã làm, kiến thức đã học hoặc một sự
                              kiện đáng nhớ.
                            </p>
                            <button
                              className="button primary"
                              onClick={() => openWrite({ kind: "activity" })}
                            >
                              <Plus size={17} />
                              Ghi hoạt động
                            </button>
                          </div>
                        )}
                      </section>
                    ) : (
                      <div className="dashboard-columns">
                        <div className="timeline-section">
                          <JourneyToolbar
                            key={profile.id}
                            profile={profile}
                            semesters={semesters}
                            currentSemester={currentSemester}
                            zoom={zoom}
                            onZoom={(value) => {
                              didChooseView.current = true;
                              setZoom(value);
                            }}
                            goals={goalsInSemester(
                              goals,
                              activities,
                              sessions,
                              zoom === "all"
                                ? undefined
                                : semesters[Number(zoom)],
                            )}
                            hidden={hiddenGoals}
                            onHidden={setHiddenGoals}
                          />
                          <MilestoneReminders
                            goals={goalsInSemester(
                              visibleGoals,
                              activities,
                              sessions,
                              zoom === "all"
                                ? undefined
                                : semesters[Number(zoom)],
                            )}
                            today={today}
                            onConfirm={openDateConfirmation}
                          />
                          {user &&
                            currentSemester &&
                            !(profile.confirmed_semesters || []).includes(
                              currentSemester.index,
                            ) && (
                              <div className="term-confirm">
                                <span>
                                  Kỳ này bắt đầu{" "}
                                  {formatDate(currentSemester.start, true)} phải
                                  không? <small>Ước tính, chỉnh được</small>
                                </span>
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    void saveProfile({
                                      ...profile,
                                      semester_settings:
                                        journeySettings(profile),
                                      confirmed_semesters: [
                                        ...(profile.confirmed_semesters || []),
                                        currentSemester.index,
                                      ],
                                    }).catch((e) => setNotice(errorMessage(e)))
                                  }
                                >
                                  Đúng ngày
                                </button>
                                <button
                                  className="text-button"
                                  onClick={() => setModal({ kind: "settings" })}
                                >
                                  Chỉnh ngày
                                </button>
                              </div>
                            )}
                          <div
                            className={`timeline-grid ${zoom !== "all" ? "semester-zoom" : ""}`}
                          >
                            {Array.from(
                              { length: profile.study_years },
                              (_, i) => i + 1,
                            )
                              .filter(
                                (y) =>
                                  zoom === "all" ||
                                  semesters[Number(zoom)]?.year === y,
                              )
                              .map((year) => (
                                <div className="year-row" key={year}>
                                  <div className="year-label">
                                    <span
                                      className={`year-number ${currentSemester?.year === year ? "current" : ""}`}
                                    >
                                      {String(year).padStart(2, "0")}
                                    </span>
                                    <div>
                                      <h3>Năm {year}</h3>
                                      <span>
                                        {profile.start_year + year - 1} –{" "}
                                        {profile.start_year + year}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="semester-pair">
                                    {semesters
                                      .filter(
                                        (s) =>
                                          s.year === year &&
                                          (zoom === "all" ||
                                            s.index === Number(zoom)),
                                      )
                                      .map((semester) => (
                                        <SemesterCard
                                          key={semester.index}
                                          semester={semester}
                                          summaries={summaries}
                                          sessions={visibleSessions}
                                          activities={visibleActivities}
                                          goals={visibleGoals}
                                          today={today}
                                          selectedDay={selectedDay}
                                          onDay={setSelectedDay}
                                          zoomed={zoom !== "all"}
                                          onOpen={() => {
                                            setZoom(String(semester.index));
                                          }}
                                        />
                                      ))}
                                  </div>
                                </div>
                              ))}
                          </div>
                          {/* All eight cell conventions, wrapping rather than
                              squeezed onto one line. The paragraph that used to
                              describe them in prose is drawn in the ⓘ key. */}
                          <div className="heatmap-legend">
                            <span>
                              <i className="legend-today" />
                              Hôm nay
                            </span>
                            <span>
                              <i className="legend-deadline" />
                              Có deadline
                            </span>
                            <span>
                              <b>◆</b> Cột mốc
                            </span>
                            <span>
                              <b>G / C</b> Thi GK / CK
                            </span>
                            <span>
                              <b>★</b> Đã đạt
                            </span>
                            <span>
                              <i className="legend-planned" />
                              Dự định
                            </span>
                            <span>
                              <i className="legend-split" />
                              Giờ đã làm
                            </span>
                            <span>
                              <i className="legend-band" />
                              Khoảng sự kiện
                            </span>
                          </div>
                          {shownSemester && (
                            <SemesterRhythm
                              semester={shownSemester}
                              activities={visibleActivities}
                              goals={visibleGoals}
                              today={today}
                              zoomed={zoom !== "all"}
                              onWeek={setSelectedDay}
                            />
                          )}
                          <div className="journey-footer">
                            <GraduationCap size={18} />
                            <span>
                              Hành trình dài được tạo nên từ những ngày rất nhỏ.
                            </span>
                          </div>
                        </div>
                        <aside className="right-column">
                          <section className="journey-card">
                            {currentSemester && (
                              <button
                                className="journey-open"
                                aria-label="Mở học kỳ hiện tại"
                                onClick={() => {
                                  setZoom(String(currentSemester.index));
                                  document
                                    .querySelector(".zoom-selector")
                                    ?.scrollIntoView({
                                      behavior: "smooth",
                                      block: "start",
                                    });
                                }}
                              />
                            )}
                            <div className="section-heading">
                              <span className="eyebrow">
                                CHẶNG ĐƯỜNG HIỆN TẠI
                              </span>
                              <Leaf size={19} />
                            </div>
                            <h3>
                              {currentSemester
                                ? `Năm ${currentSemester.year}, học kỳ ${currentSemester.term}`
                                : today < semesters[0].start
                                  ? "Sẵn sàng bắt đầu"
                                  : "Một hành trình đáng nhớ"}
                            </h3>
                            <p>
                              {currentSemester
                                ? `${formatDate(currentSemester.start, true)} — ${formatDate(currentSemester.end, true)}`
                                : `${profile.start_year} — ${profile.start_year + profile.study_years}`}
                            </p>
                            <div className="progress-track">
                              <span style={{ width: `${journeyProgress}%` }} />
                            </div>
                            <div className="journey-caption">
                              <span>
                                {currentSemester
                                  ? "Thời gian kỳ này đã đi qua"
                                  : "Thời gian đã đi qua"}
                              </span>
                              <strong>{journeyProgress}%</strong>
                            </div>
                          </section>
                          <section className="rail-section">
                            <div className="section-heading">
                              <h2>Deadline gần nhất</h2>
                              <span className="count-badge">
                                {deadlines.length}
                              </span>
                            </div>
                            {deadlines.length ? (
                              deadlines.slice(0, 3).map((goal) => (
                                <button
                                  className="deadline-item"
                                  key={goal.id}
                                  onClick={() =>
                                    openWrite({ kind: "goal", goal })
                                  }
                                >
                                  <span
                                    className={`deadline-date ${goal.deadline < today ? "late" : ""}`}
                                    style={{
                                      borderLeft: `3px solid ${goal.color}`,
                                    }}
                                  >
                                    <strong>{goal.deadline.slice(8)}</strong>
                                    <span>
                                      TH{Number(goal.deadline.slice(5, 7))}
                                    </span>
                                  </span>
                                  <span className="deadline-content">
                                    <strong>{goal.title}</strong>
                                    <span
                                      className={
                                        goal.deadline < today ? "overdue" : ""
                                      }
                                    >
                                      {goal.deadline < today
                                        ? `Quá hạn ${daysBetween(goal.deadline, today)} ngày`
                                        : goal.deadline === today
                                          ? "Đến hạn hôm nay"
                                          : `Còn ${daysBetween(today, goal.deadline)} ngày`}
                                      <i />
                                      {goal.tracking_mode === "milestone"
                                        ? MILESTONE_LABELS[goal.milestone_kind]
                                        : goalProgressText(goal)}
                                    </span>
                                  </span>
                                  <ChevronRight size={15} />
                                </button>
                              ))
                            ) : (
                              <div className="empty-small">
                                <CircleCheck size={24} />
                                <p>
                                  Chưa có deadline. Thêm mục tiêu đầu tiên nhé.
                                </p>
                              </div>
                            )}
                            <button
                              className="rail-link text-button"
                              onClick={() => navigate("goals")}
                            >
                              Xem tất cả mục tiêu
                              <ArrowRight size={15} />
                            </button>
                          </section>
                          <section className="rail-section recent-section">
                            <div className="section-heading">
                              <h2>Bước tiến gần đây</h2>
                              <span className="tiny-dot" />
                            </div>
                            {recent.slice(0, 4).map((activity) => (
                              <div className="recent-item" key={activity.id}>
                                <span
                                  className={`activity-dot ${activity.kind === "completion" ? "complete" : ""}`}
                                  style={{ background: activity.color }}
                                >
                                  {activity.kind === "completion" ? (
                                    <Check size={12} />
                                  ) : null}
                                </span>
                                <div>
                                  <strong>{activity.title}</strong>
                                  <span>
                                    {formatDate(activity.occurred_on, true)}
                                    {` · ${activity.duration_minutes ? formatMinutes(activity.duration_minutes) : activityLabel(activity)}`}
                                  </span>
                                </div>
                              </div>
                            ))}
                            {!recent.length && (
                              <p className="empty-small">
                                Bước tiến đầu tiên của bạn sẽ xuất hiện ở đây.
                              </p>
                            )}
                            <button
                              className="rail-link text-button"
                              onClick={() => navigate("timeline", "journal")}
                            >
                              Mở nhật ký
                              <ArrowRight size={15} />
                            </button>
                          </section>
                        </aside>
                      </div>
                    )}
                  </>
                )}
                {view === "goals" && (
                  <section className="goals-section">
                    <div className="filter-bar">
                      <div className="status-tabs" aria-label="Lọc trạng thái">
                        {(
                          [
                            ["all", "Tất cả", goals.length],
                            ["active", "Đang theo đuổi", activeGoals.length],
                            ["done", "Hoàn thành", completedGoals.length],
                            ["overdue", "Quá hạn", overdueGoals.length],
                          ] as const
                        ).map(([id, label, count]) => (
                          <button
                            key={id}
                            className={statusFilter === id ? "selected" : ""}
                            aria-pressed={statusFilter === id}
                            onClick={() => setStatusFilter(id)}
                          >
                            {label}
                            <span className="tab-count">{count}</span>
                          </button>
                        ))}
                      </div>
                      <label className="search-field">
                        <Search size={17} />
                        <input
                          aria-label="Tìm mục tiêu"
                          placeholder="Tìm mục tiêu…"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </label>
                    </div>
                    <div className="secondary-filters">
                      <select
                        aria-label="Lọc lĩnh vực"
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                      >
                        <option value="all">Mọi lĩnh vực</option>
                        {CATEGORIES.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                      <select
                        aria-label="Lọc học kỳ"
                        value={semesterFilter}
                        onChange={(e) => setSemesterFilter(e.target.value)}
                      >
                        <option value="all">Mọi học kỳ</option>
                        {semesters.map((s) => (
                          <option key={s.index} value={s.index}>
                            Năm {s.year} · Học kỳ {s.term}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Sắp xếp mục tiêu"
                        value={goalOrder}
                        onChange={(e) =>
                          setGoalOrder(e.target.value as GoalOrder)
                        }
                      >
                        <option value="recent">Vừa làm gần đây</option>
                        <option value="deadline">Sắp đến hạn</option>
                      </select>
                      <span className="muted small">
                        {filteredGoals.length} mục tiêu
                      </span>
                    </div>
                    <div className="goals-grid">
                      {filteredGoals.map(renderGoal)}
                      {/* The gap at the end of the last row is the one place an
                          invitation costs nothing. */}
                      {filteredGoals.length > 0 && (
                        <button
                          className="goal-add"
                          onClick={() => openWrite({ kind: "goal" })}
                        >
                          <Plus size={20} />
                          Thêm mục tiêu
                        </button>
                      )}
                    </div>
                    {!filteredGoals.length && (
                      <div className="empty-state">
                        <Target size={34} />
                        <h3>
                          {goals.length
                            ? "Chưa có mục tiêu phù hợp"
                            : "Bạn muốn đạt được điều gì?"}
                        </h3>
                        <p>
                          {goals.length
                            ? "Thử đổi bộ lọc hoặc từ khóa tìm kiếm."
                            : "Bắt đầu với một mục tiêu nhỏ cho học kỳ này."}
                        </p>
                        <button
                          className="button primary"
                          onClick={() => openWrite({ kind: "goal" })}
                        >
                          <Plus size={17} />
                          Thêm mục tiêu
                        </button>
                      </div>
                    )}
                  </section>
                )}
              </>
            )
          )}
          {profile && !loading && !loadError && (
            <PlanningHub
              key={user?.id || "demo"}
              visible={view === "planning"}
              onSessionsChange={receiveSessions}
              onTimetableChange={receiveTimetable}
              setupGuide={setupGuide}
              requestedPlan={planRequest}
              startRef={startHub}
              onClosePlan={() => setPlanRequest(false)}
              requestedSession={sessionRequest}
              onCloseRequested={() => setSessionRequest(null)}
              userId={user?.id}
              profile={profile}
              goals={goals}
              activities={activities}
              onAuth={() => setModal({ kind: "auth" })}
              onImport={(initialKind) =>
                setModal(
                  user
                    ? {
                        kind: "import",
                        initialKind,
                        context:
                          initialKind === "timetable"
                            ? "timetable"
                            : "schedule",
                      }
                    : { kind: "auth" },
                )
              }
              onChanged={async () => {
                if (user) await loadData(user);
              }}
            />
          )}
          <footer className="page-footer">
            <span>
              uni tracker<span className="brand-dot">.</span>
            </span>
            <span className="footer-note">
              <Leaf size={14} />
              Từng chút, mỗi ngày. Đại học là hành trình dài — mỗi bước tiến đều
              đáng nhớ.
            </span>
          </footer>
        </main>
      </div>
      {dateConfirmation && (
        <Dialog
          title={`Chốt ngày · ${dateConfirmation.goal.title}`}
          onClose={() => {
            if (!busy) setDateConfirmation(null);
          }}
        >
          <fieldset className="confirm-milestone-date" disabled={busy}>
            <p>
              {dateConfirmation.step.title} · Chọn ngày để chuyển sang Ngày đã
              chốt.
            </p>
            <DatePicker
              label="Ngày đã chốt"
              value={dateConfirmation.day}
              defaultOpen
              onChange={(day) => void confirmDate(day)}
            />
            {busy && <p role="status">Đang chốt ngày…</p>}
            {dateError && (
              <p className="form-error" role="alert">
                {dateError}
              </p>
            )}
          </fieldset>
        </Dialog>
      )}
      {notice && (
        <div className="toast" role="status">
          <CircleCheck size={18} />
          <span>{notice}</span>
          <button
            className="icon-button"
            aria-label="Đóng thông báo"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {(modal?.kind === "auth" || modal?.kind === "recovery") && (
        <AuthForm
          recovery={modal.kind === "recovery"}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === "goal" && (
        <GoalForm
          semesters={semesters}
          goal={modal.goal}
          defaultDate={modal.date || today}
          onClose={() => setModal(null)}
          onSave={saveGoal}
        />
      )}
      {modal?.kind === "pick-goal" && (
        <Dialog
          title="Thêm cột mốc vào mục tiêu nào?"
          description="Cột mốc nằm trong mục tiêu, nên hãy chọn mục tiêu trước."
          onClose={() => setModal(null)}
        >
          <div className="goal-picker">
            {goals.map((goal) => (
              <button
                key={goal.id}
                onClick={() => setModal({ kind: "goal", goal })}
              >
                <span
                  className="color-dot"
                  style={{ background: goal.color }}
                />
                <span>
                  <strong>{goal.title}</strong>
                  <small>{goalDateText(goal)}</small>
                </span>
                <ChevronRight size={15} />
              </button>
            ))}
          </div>
        </Dialog>
      )}
      {modal?.kind === "session" && (
        <SessionEditor
          goals={goals}
          userId={user?.id}
          defaultDate={modal.date}
          onClose={() => setModal(null)}
          onSaved={async () => {
            if (user) await loadData(user);
          }}
        />
      )}
      {modal?.kind === "activity" && (
        <ActivityForm
          activity={modal.activity}
          goals={goals}
          defaultDate={modal.date || today}
          onClose={() => setModal(null)}
          onSave={saveActivity}
        />
      )}
      {modal?.kind === "import" && profile && user && (
        <ImportDialog
          initialKind={modal.initialKind}
          context={modal.context}
          goals={goals}
          activities={activities}
          profile={profile}
          onClose={() => setModal(null)}
          completionLabel={
            view === "goals" ? "Xem mục tiêu đã nhập" : "Trở về lịch tuần"
          }
          onManual={
            modal.context === "goals"
              ? () => setModal({ kind: "goal" })
              : modal.context === "timetable"
                ? () => setModal({ kind: "timetable" })
                : undefined
          }
          onImported={() => loadData(user)}
        />
      )}
      {modal?.kind === "timetable" && profile && user && (
        <TimetableForm
          profile={profile}
          goals={goals}
          onClose={() => setModal(null)}
          onSave={async (data) => {
            const r = await getSupabase()!
              .from("timetable_entries")
              .insert(data.map((row) => ({ ...row, user_id: user.id })));
            if (r.error) throw r.error;
            await loadData(user);
          }}
          onDelete={async (id) => {
            const r = await getSupabase()!
              .from("timetable_entries")
              .delete()
              .eq("id", id);
            if (r.error) throw r.error;
            await loadData(user);
          }}
        />
      )}
      {modal?.kind === "settings" && profile && (
        <SettingsForm
          profile={preset ? { ...profile, ...preset } : profile}
          onClose={() => setModal(null)}
          onSave={saveProfile}
          onExport={() => void exportData()}
          onRestore={() => setModal({ kind: "import", context: "restore" })}
        />
      )}
      {modal?.kind === "delete" && (
        <Dialog
          title="Xóa mục này?"
          description={`“${modal.title}” sẽ bị xóa. Thao tác này không thể hoàn tác.${modal.table === "goals" ? " Các mốc trong nhật ký vẫn được giữ lại." : ""}`}
          onClose={() => {
            if (!busy) setModal(null);
          }}
        >
          <div className="form-actions">
            <button
              className="button"
              disabled={busy}
              onClick={() => setModal(null)}
            >
              Giữ lại
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={() => void removeItem()}
            >
              {busy ? "Đang xóa…" : "Xóa"}
            </button>
          </div>
        </Dialog>
      )}
      {selectedDay && !modal && (
        <Dialog
          title={
            selectedDay === today
              ? "Hôm nay của bạn"
              : `Ngày ${formatDate(selectedDay, true)}`
          }
          description={`${dayActivities.length} hoạt động · ${dayGoals.length} mục tiêu trong ngày`}
          onClose={() => setSelectedDay(null)}
        >
          <div className="day-detail">
            {selectedDay && sessionsOnDay(sessions, selectedDay).length > 0 && (
              <section>
                <h3>Phiên học trong ngày</h3>
                {sessionsOnDay(sessions, selectedDay).map((s) => (
                  <button
                    className="day-session-button"
                    key={s.id}
                    onClick={() => {
                      setSelectedDay(null);
                      setSessionRequest(s.id);
                    }}
                  >
                    <Clock3 size={17} />
                    <span>
                      <strong>{s.title}</strong>
                      <small>
                        {s.is_unscheduled
                          ? `${s.planned_minutes} phút · Chưa xếp giờ`
                          : `${localDateTime(s.scheduled_start).slice(11)}–${localDateTime(s.scheduled_end).slice(11)}`}{" "}
                        ·{" "}
                        {s.status === "completed" ? "Đã xác nhận" : "Mở timer"}
                      </small>
                    </span>
                  </button>
                ))}
              </section>
            )}
            {milestonesOnDay(goals, selectedDay)
              .filter((m) => !m.step.is_final)
              .map((m) => (
                <div className="day-goal" key={m.goal.id + m.step.id}>
                  <span style={{ color: m.goal.color }}>
                    {m.step.done ? "▲" : "△"}
                  </span>{" "}
                  <strong>{m.step.title}</strong> · {m.goal.title}
                  <p>{m.step.notes}</p>
                </div>
              ))}
            {dayGoals.length > 0 && (
              <>
                <h3>
                  <Clock3 size={16} />
                  Mục tiêu đến hạn
                </h3>
                {dayGoals.map((goal) => (
                  <button
                    className="day-list-item"
                    key={goal.id}
                    onClick={() => openWrite({ kind: "goal", goal })}
                  >
                    <span>
                      <span
                        className="color-dot"
                        style={{ background: goal.color }}
                      />
                      {goal.title}
                    </span>
                    <strong>
                      {goal.tracking_mode === "milestone"
                        ? `${goal.progress === 100 ? "★" : "◆"} ${MILESTONE_LABELS[goal.milestone_kind]}`
                        : goalProgressText(goal)}
                    </strong>
                  </button>
                ))}
              </>
            )}
            {dayActivities.length > 0 && (
              <>
                <h3>
                  <BookOpen size={16} />
                  Hoạt động đã ghi
                </h3>
                {dayActivities.map((a) => (
                  <div className="day-list-item" key={a.id}>
                    <div>
                      <strong>
                        <span
                          className="color-dot"
                          style={{
                            background:
                              goals.find((g) => g.id === a.goal_id)?.color ||
                              a.color,
                          }}
                        />
                        {a.is_milestone ? "★ " : ""}
                        {a.title}
                      </strong>
                      <p className="activity-meta">
                        {activityLabel(a)}
                        {a.duration_minutes
                          ? ` · ${formatMinutes(a.duration_minutes)}`
                          : ""}
                        {a.goal_title
                          ? ` · ${goals.find((g) => g.id === a.goal_id)?.title || a.goal_title}`
                          : ""}
                      </p>
                      {a.notes && <p className="muted small">{a.notes}</p>}
                    </div>
                    <button
                      className="icon-button"
                      aria-label={`Sửa hoạt động ${a.title}`}
                      onClick={() => {
                        setSelectedDay(null);
                        openWrite({ kind: "activity", activity: a });
                      }}
                    >
                      <Pencil size={16} />
                    </button>
                  </div>
                ))}
              </>
            )}
            {!dayActivities.length &&
              !dayGoals.length &&
              !sessionsOnDay(sessions, selectedDay).length && (
                <div className="empty-small">
                  <CalendarDays size={30} />
                  <p>
                    {selectedDay > today
                      ? "Một ngày đang chờ những dự định của bạn."
                      : "Chưa có hoạt động nào được ghi lại trong ngày này."}
                  </p>
                </div>
              )}
            <div className="form-actions">
              <button
                className="button primary"
                onClick={() =>
                  openWrite({ kind: "session", date: selectedDay })
                }
              >
                <Plus size={16} />
                Thêm phiên
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
