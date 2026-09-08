"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  CircleCheck,
  Clock3,
  Flame,
  GraduationCap,
  LayoutGrid,
  Leaf,
  LoaderCircle,
  LogIn,
  LogOut,
  Menu,
  Pencil,
  Plus,
  Search,
  Settings2,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import {
  CATEGORIES,
  MILESTONE_LABELS,
  daysBetween,
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
} from "@/lib/timeline";
import { ActivityForm, AuthForm, errorMessage } from "./forms";
import Dialog from "./dialog";
import { GoalForm, SettingsForm } from "./journey-forms";
import PlanningHub from "./planning";
import dynamic from "next/dynamic";
const ImportDialog = dynamic(() => import("./import-dialog"));
const Preparation = dynamic(() => import("./preparation"));
import {
  goalProgressText,
  goalDateText,
  localDateTime,
  type FocusSession,
} from "@/lib/planning";
import {
  journeySemesters,
  journeySettings,
  sessionsOnDay,
  dayVisual,
  indexSessionsByDay,
  timingMode,
  parseCalendarPreset,
} from "@/lib/schedule";
import ProductivityPanel from "./productivity";
import {
  activityLabel,
  formatMinutes,
  isWork,
  summarizeDays,
  type DaySummary,
} from "@/lib/focus";

type View = "timeline" | "goals" | "journal" | "planning";
type Modal =
  | { kind: "auth" | "recovery" | "settings" | "prepare" }
  | { kind: "import"; initialKind?: "timetable" }
  | { kind: "goal"; goal?: Goal; date?: string }
  | { kind: "activity"; activity?: Activity; date?: string }
  | { kind: "delete"; table: "goals" | "activities"; id: string; title: string }
  | null;
const NAV = [
  { id: "planning" as const, label: "Tuần & phiên học", icon: Clock3 },
  { id: "timeline" as const, label: "Hành trình đại học", icon: LayoutGrid },
  { id: "goals" as const, label: "Mục tiêu của tôi", icon: Target },
  { id: "journal" as const, label: "Nhật ký hoạt động", icon: BookOpen },
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
  const semesterGoals = goals.filter(
    (g) =>
      g.deadline >= semester.start &&
      (g.starts_on || g.deadline) <= semester.end,
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
            <button className="text-button" onClick={onOpen}>
              {semester.label} {zoomed ? "" : "↗"}
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
                  ? `${formatDate(day, true)}${outside ? " · Ngoài học kỳ" : holiday ? ` · ${holiday.label}` : ""} · ${formatMinutes(summary?.minutes || 0)}${summary?.label ? ` · ${summary.label}` : ""}${visual?.plans.length ? ` · ${visual.plans.length} phiên dự định` : ""}${visual?.ranges.length ? ` · ${visual.ranges.map((g) => g.title).join(", ")}` : ""}`
                  : "";
                return day ? (
                  <div
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
                      style={{ background: visual?.background }}
                      title={title}
                      aria-label={title}
                      aria-pressed={day === selectedDay}
                      disabled={outside}
                      onClick={() => onDay(day)}
                    >
                      {!!visual?.fixed.length && (
                        <i
                          className="deadline-corner"
                          style={{ background: visual.corner }}
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
      {zoomed && (
        <div className="goal-ranges">
          <p className="muted small">
            Khoảng mục tiêu · không tính vào thời gian thực làm
          </p>
          {semesterGoals
            .filter((g) => timingMode(g) !== "fixed")
            .map((g) => (
              <div className="range-caption" key={g.id}>
                <i style={{ background: g.color }} />
                {g.title} · {goalDateText(g)} ·{" "}
                {timingMode(g) === "flexible"
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

function GoalCard({
  goal,
  today,
  onEdit,
  onComplete,
  onDelete,
  busy,
}: {
  goal: Goal;
  today: string;
  onEdit: () => void;
  onComplete: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const remaining = daysBetween(today, goal.deadline);
  const completed = goal.progress === 100;
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
          <button
            className="icon-button complete-button"
            disabled={busy}
            onClick={onComplete}
            aria-label={`Hoàn thành ${goal.title}`}
            title="Đánh dấu hoàn thành"
          >
            <Check size={17} />
          </button>
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
  const [sessionRequest, setSessionRequest] = useState<string | null>(null);
  const [journalGoal, setJournalGoal] = useState("all");
  const [preset, setPreset] = useState<Partial<Profile> | null>(null);
  const didChooseView = useRef(false);
  const authenticatedId = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<View>("timeline");
  const [modal, setModal] = useState<Modal>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [zoom, setZoom] = useState("all");
  const [accountOpen, setAccountOpen] = useState(false);
  const [yearFilter, setYearFilter] = useState("all");
  const [semesterFilter, setSemesterFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [journalLimit, setJournalLimit] = useState(30);
  const [mobileNav, setMobileNav] = useState(false);
  const [heatmapGoal, setHeatmapGoal] = useState("all");
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
      setHeatmapGoal((previous) =>
        allGoals.some((g) => g.id === previous) ? previous : "all",
      );
      setActivities(allActivities);
      if (
        !resolvedProfile.preparation_done &&
        !allGoals.length &&
        !allActivities.length
      ) {
        setView("planning");
        setModal((previous) =>
          previous?.kind === "recovery" ? previous : { kind: "prepare" },
        );
      } else if (!savedProfile)
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
          void loadData(currentUser);
        }
      } else {
        version.current.value++;
        didChooseView.current = false;
        setSessions([]);
        setSessionRequest(null);
        setSelectedDay(null);
        setHeatmapGoal("all");
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
          setYearFilter("all");
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
    () =>
      heatmapGoal === "all" ? goals : goals.filter((g) => g.id === heatmapGoal),
    [goals, heatmapGoal],
  );
  const visibleActivities = useMemo(
    () =>
      heatmapGoal === "all"
        ? activities
        : activities.filter((a) => a.goal_id === heatmapGoal),
    [activities, heatmapGoal],
  );
  const visibleSessions = useMemo(
    () =>
      heatmapGoal === "all"
        ? sessions
        : sessions.filter((s) => s.goal_id === heatmapGoal),
    [sessions, heatmapGoal],
  );
  const summaries = useMemo(
    () => summarizeDays(visibleGoals, visibleActivities),
    [visibleGoals, visibleActivities],
  );
  const activeGoals = goals.filter((g) => g.progress < 100);
  const completedGoals = goals.filter((g) => g.progress === 100);
  const deadlines = [...activeGoals].sort((a, b) =>
    a.deadline.localeCompare(b.deadline),
  );
  const recent = [...activities].sort(
    (a, b) =>
      b.occurred_on.localeCompare(a.occurred_on) ||
      b.created_at.localeCompare(a.created_at),
  );
  const activeDays = [
    ...new Set(workActivities.map((a) => a.occurred_on)),
  ].filter(
    (day) =>
      semesters.length &&
      day >= semesters[0].start &&
      day <= semesters[semesters.length - 1].end,
  ).length;
  const currentSemester = semesters.find(
    (s) => today >= s.start && today <= s.end,
  );
  const journeyProgress = semesters.length
    ? Math.max(
        0,
        Math.min(
          100,
          Math.round(
            (daysBetween(semesters[0].start, today) /
              (daysBetween(
                semesters[0].start,
                semesters[semesters.length - 1].end,
              ) +
                1)) *
              100,
          ),
        ),
      )
    : 0;
  function navigate(next: View) {
    setView(next);
    setQuery("");
    setMobileNav(false);
    setSemesterFilter("all");
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
    setYearFilter("all");
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
      const read = async (table: string) => {
        const rows: unknown[] = [];
        for (let from = 0; ; from += 1000) {
          const r = await db
            .from(table)
            .select("*")
            .eq("user_id", user.id)
            .order("id")
            .range(from, from + 999);
          if (r.error) throw r.error;
          rows.push(...r.data);
          if (r.data.length < 1000) return rows;
        }
      };
      const [sessions, budgets, timetable_entries] = await Promise.all([
        read("focus_sessions"),
        read("weekly_budgets"),
        read("timetable_entries"),
      ]);
      const blob = new Blob(
        [
          JSON.stringify(
            {
              version: 2,
              exported_at: new Date().toISOString(),
              profile,
              goals,
              activities,
              sessions,
              budgets,
              timetable_entries,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      );
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
  function renderGoal(goal: Goal) {
    return (
      <GoalCard
        key={goal.id}
        goal={goal}
        today={today}
        busy={busy}
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

  const filteredGoals = goals.filter((g) => {
    const sem =
      semesterFilter === "all" ? null : semesters[Number(semesterFilter)];
    return (
      (statusFilter === "all" ||
        (statusFilter === "done"
          ? g.progress === 100
          : statusFilter === "overdue"
            ? g.progress < 100 && g.deadline < today
            : g.progress < 100)) &&
      (categoryFilter === "all" || g.category === categoryFilter) &&
      (!sem ||
        (g.deadline >= sem.start && (g.starts_on || g.deadline) <= sem.end)) &&
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
  const dayActivities = selectedDay
    ? recent.filter((a) => a.occurred_on === selectedDay)
    : [];
  const dayGoals = selectedDay
    ? goals.filter(
        (g) =>
          g.deadline >= selectedDay &&
          (g.starts_on || g.deadline) <= selectedDay,
      )
    : [];

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
        <div className="workspace-label">KHÔNG GIAN CỦA BẠN</div>
        <nav aria-label="Điều hướng chính">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={18} />
              {item.label}
              {item.id === "goals" && goals.length > 0 && (
                <span className="nav-count">{goals.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-journey">
          <div className="journey-icon">
            <Leaf size={21} />
          </div>
          <strong>Từng chút, mỗi ngày.</strong>
          <p>
            Đại học là hành trình dài.
            <br />
            Mỗi bước tiến đều đáng nhớ.
          </p>
          <div className="mini-heatmap" aria-hidden="true">
            {Array.from({ length: 42 }, (_, i) => (
              <i className={`level-${((i * 7) % 11) % 5}`} key={i} />
            ))}
          </div>
        </div>
        <div className="sidebar-bottom">
          <button
            className="nav-item"
            onClick={() => openWrite({ kind: "settings" })}
          >
            <Settings2 size={18} />
            Cài đặt hành trình
          </button>
          {user && (
            <button
              className="nav-item"
              onClick={() => void exportData()}
              disabled={busy}
            >
              <ArrowDownToLine size={18} />
              Xuất dữ liệu
            </button>
          )}
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
                      Cài đặt hành trình
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
              <div className="eyebrow">
                {view === "timeline"
                  ? "NHÌN LẠI ĐỂ TIẾN XA HƠN"
                  : view === "goals"
                    ? "MỖI MỤC TIÊU, MỘT BƯỚC TIẾN"
                    : "NHỮNG ĐIỀU ĐÁNG NHỚ"}
              </div>
              <h1>
                {view === "timeline"
                  ? "Hành trình đại học"
                  : view === "goals"
                    ? "Mục tiêu của tôi"
                    : "Nhật ký hoạt động"}
                <span className="heading-dot">.</span>
              </h1>
              <p>
                {view === "timeline"
                  ? `${profile?.study_years || 4} năm, ${(profile?.study_years || 4) * 2} học kỳ — và những bước tiến của bạn.`
                  : view === "goals"
                    ? "Biến những dự định thành những điều đã làm được."
                    : "Lưu lại từng ngày bạn đã học hỏi, trải nghiệm và trưởng thành."}
              </p>
            </div>
            <div className="heading-actions">
              <button
                className="button"
                onClick={() => openWrite({ kind: "import" })}
              >
                <ArrowDownToLine size={17} />
                Nhập dữ liệu
              </button>
              <button
                className="button"
                onClick={() => openWrite({ kind: "activity" })}
              >
                <Plus size={17} />
                Ghi hoạt động
              </button>
              <button
                className="button primary"
                onClick={() => openWrite({ kind: "goal" })}
              >
                <Plus size={17} />
                Thêm mục tiêu
              </button>
            </div>
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
                <div className="stats-grid" hidden={view === "planning"}>
                  <div className="stat-card">
                    <span className="stat-icon">
                      <Target size={19} />
                    </span>
                    <div>
                      <span>Mục tiêu đang theo đuổi</span>
                      <strong>
                        {activeGoals.length}
                        <small>mục tiêu</small>
                      </strong>
                    </div>
                  </div>
                  <div className="stat-card">
                    <span className="stat-icon green">
                      <CircleCheck size={19} />
                    </span>
                    <div>
                      <span>Mục tiêu đã hoàn thành</span>
                      <strong>
                        {completedGoals.length}
                        <small>cột mốc</small>
                      </strong>
                    </div>
                  </div>
                  <div className="stat-card">
                    <span className="stat-icon blue">
                      <CalendarDays size={19} />
                    </span>
                    <div>
                      <span>Ngày có hoạt động</span>
                      <strong>
                        {activeDays.toLocaleString("vi-VN")}
                        <small>ngày</small>
                      </strong>
                    </div>
                  </div>
                  <div className="stat-card">
                    <span className="stat-icon orange">
                      <Flame size={19} />
                    </span>
                    <div>
                      <span>Chuỗi ngày hiện tại</span>
                      <strong>
                        {streak(workActivities, today)}
                        <small>ngày liên tiếp</small>
                      </strong>
                    </div>
                  </div>
                </div>
                {view === "timeline" && (
                  <ProductivityPanel
                    activities={activities}
                    goals={goals}
                    today={today}
                    onDay={setSelectedDay}
                  />
                )}
                {view === "timeline" && (
                  <div className="dashboard-columns">
                    <div className="timeline-section">
                      <div className="section-heading">
                        <div>
                          <h2>
                            {zoom === "all"
                              ? `Toàn cảnh ${profile.study_years} năm`
                              : "Tiến trình kỳ học"}
                            <span className="count-badge">
                              {profile.start_year} —{" "}
                              {profile.start_year + profile.study_years}
                            </span>
                          </h2>
                          <p className="muted small">
                            Mỗi ô là một ngày. Bấm vào ô để xem mọi hoạt động và
                            deadline.
                          </p>
                        </div>
                        <select
                          aria-label="Lọc năm học"
                          value={yearFilter}
                          onChange={(e) => setYearFilter(e.target.value)}
                        >
                          <option value="all">Tất cả các năm</option>
                          {Array.from(
                            { length: profile.study_years },
                            (_, i) => i + 1,
                          ).map((y) => (
                            <option key={y} value={y}>
                              Năm {y}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="zoom-selector">
                        <label>
                          Phóng to học kỳ
                          <select
                            aria-label="Phóng to học kỳ"
                            value={zoom}
                            onChange={(e) => {
                              setZoom(e.target.value);
                              setYearFilter("all");
                            }}
                          >
                            <option value="all">Toàn bộ hành trình</option>
                            {semesters.map((s) => (
                              <option key={s.index} value={s.index}>
                                Năm {s.year} · {s.label} (HK{s.index + 1})
                              </option>
                            ))}
                          </select>
                        </label>
                        {currentSemester && (
                          <button
                            className="text-button"
                            onClick={() => {
                              setZoom(String(currentSemester.index));
                              setYearFilter("all");
                            }}
                          >
                            Về kỳ hiện tại
                          </button>
                        )}
                      </div>
                      <div className="heatmap-toolbar">
                        <select
                          aria-label="Lọc mục tiêu trên timeline"
                          value={heatmapGoal}
                          onChange={(e) => setHeatmapGoal(e.target.value)}
                        >
                          <option value="all">Tất cả mục tiêu</option>
                          {goals.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.title}
                            </option>
                          ))}
                        </select>
                      </div>
                      {
                        <div
                          className="goal-color-key"
                          aria-label="Chú thích màu mục tiêu"
                        >
                          {visibleGoals.map((g) => (
                            <button
                              key={g.id}
                              title={g.title}
                              onClick={() =>
                                setHeatmapGoal(
                                  heatmapGoal === g.id ? "all" : g.id,
                                )
                              }
                            >
                              <span
                                className="color-dot"
                                style={{ background: g.color }}
                              />
                              {g.title}
                            </button>
                          ))}
                        </div>
                      }
                      {zoom !== "all" && (
                        <div
                          className="journey-strip"
                          aria-label="Toàn cảnh thu nhỏ"
                        >
                          <button
                            onClick={() => {
                              setZoom("all");
                              setYearFilter("all");
                            }}
                          >
                            Toàn cảnh {profile.study_years} năm
                          </button>
                          {semesters.map((s) => (
                            <button
                              className={
                                String(s.index) === zoom ? "selected" : ""
                              }
                              key={s.index}
                              title={`Năm ${s.year} · ${s.label}`}
                              onClick={() => {
                                didChooseView.current = true;
                                setZoom(String(s.index));
                              }}
                            >
                              HK{s.index + 1}
                            </button>
                          ))}
                        </div>
                      )}
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
                                  semester_settings: journeySettings(profile),
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
                              (yearFilter === "all" ||
                                y === Number(yearFilter)) &&
                              (zoom === "all" ||
                                semesters[Number(zoom)]?.year === y),
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
                                        setYearFilter("all");
                                      }}
                                    />
                                  ))}
                              </div>
                            </div>
                          ))}
                      </div>
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
                        <span>▧ Khoảng sự kiện</span>
                      </div>
                      <p className="muted small heatmap-help">
                        Màu mục tiêu, đậm theo giờ đã log · Viền đứt: phiên dự
                        định · Dấu góc: hạn đã chốt · Nền dải tuần: khoảng sự
                        kiện (viền đứt khi ngày chưa chốt).
                      </p>
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
                              setYearFilter("all");
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
                          <span className="eyebrow">CHẶNG ĐƯỜNG HIỆN TẠI</span>
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
                          <span>Thời gian đã đi qua</span>
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
                              onClick={() => openWrite({ kind: "goal", goal })}
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
                            <p>Chưa có deadline. Thêm mục tiêu đầu tiên nhé.</p>
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
                          onClick={() => navigate("journal")}
                        >
                          Mở nhật ký
                          <ArrowRight size={15} />
                        </button>
                      </section>
                    </aside>
                  </div>
                )}
                {view === "goals" && (
                  <section className="goals-section">
                    <div className="filter-bar">
                      <div className="status-tabs" aria-label="Lọc trạng thái">
                        {[
                          ["all", "Tất cả"],
                          ["active", "Đang theo đuổi"],
                          ["done", "Hoàn thành"],
                          ["overdue", "Quá hạn"],
                        ].map(([id, label]) => (
                          <button
                            key={id}
                            className={statusFilter === id ? "selected" : ""}
                            aria-pressed={statusFilter === id}
                            onClick={() => setStatusFilter(id)}
                          >
                            {label}
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
                      <span className="muted small">
                        {filteredGoals.length} mục tiêu
                      </span>
                    </div>
                    <div className="goals-grid">
                      {filteredGoals.map(renderGoal)}
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
                {view === "journal" && (
                  <section className="journal-section">
                    <div className="filter-bar">
                      <h2>
                        {activities.length.toLocaleString("vi-VN")} hoạt động đã
                        ghi lại
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
                              {activity.occurred_on === today
                                ? "Hôm nay"
                                : formatDate(activity.occurred_on, true)}
                            </h3>
                          )}
                          <article className="journal-entry">
                            <span
                              className={`journal-icon ${activity.kind === "completion" ? "green" : ""}`}
                              style={{
                                color: activity.color,
                                background: `${activity.color}18`,
                              }}
                            >
                              {activity.kind === "completion" ? (
                                <CircleCheck size={20} />
                              ) : (
                                <BookOpen size={20} />
                              )}
                            </span>
                            <div>
                              <span className="entry-kind">
                                {activity.is_milestone ? "★ " : ""}
                                {activityLabel(activity)}
                              </span>
                              <h3>{activity.title}</h3>
                              <p className="activity-meta">
                                {activity.goal_title && (
                                  <span>
                                    {goals.find(
                                      (g) => g.id === activity.goal_id,
                                    )?.title || activity.goal_title}
                                  </span>
                                )}
                                {activity.duration_minutes > 0 && (
                                  <strong>
                                    {formatMinutes(activity.duration_minutes)}
                                  </strong>
                                )}
                              </p>
                              {activity.notes && <p>{activity.notes}</p>}
                            </div>
                            {
                              <div className="row-actions">
                                <button
                                  className="icon-button"
                                  aria-label={`Sửa hoạt động ${activity.title}`}
                                  onClick={() =>
                                    openWrite({ kind: "activity", activity })
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
                          Ghi lại việc đã làm, kiến thức đã học hoặc một sự kiện
                          đáng nhớ.
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
                )}
              </>
            )
          )}
          {profile && !loading && !loadError && (
            <PlanningHub
              key={user?.id || "demo"}
              visible={view === "planning"}
              onSessionsChange={receiveSessions}
              requestedSession={sessionRequest}
              onCloseRequested={() => setSessionRequest(null)}
              userId={user?.id}
              profile={profile}
              goals={goals}
              activities={activities}
              onAuth={() => setModal({ kind: "auth" })}
              onImport={(initialKind) =>
                setModal(
                  user ? { kind: "import", initialKind } : { kind: "auth" },
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
            <span>Mỗi ngày một chút, từng bước một hành trình.</span>
          </footer>
        </main>
      </div>
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
          goals={goals}
          activities={activities}
          profile={profile}
          onClose={() => setModal(null)}
          onImported={async () => {
            if (!profile.preparation_done)
              await saveProfile({ ...profile, preparation_done: true });
            await loadData(user);
            setView("planning");
          }}
        />
      )}
      {modal?.kind === "prepare" && profile && user && (
        <Preparation
          profile={profile}
          onSave={saveProfile}
          onImport={() => setModal({ kind: "import" })}
          onSkip={() => {
            void saveProfile({ ...profile, preparation_done: true })
              .then(() => {
                setModal(null);
                setView("planning");
              })
              .catch((e) => setNotice(errorMessage(e)));
          }}
        />
      )}
      {modal?.kind === "settings" && profile && (
        <SettingsForm
          profile={preset ? { ...profile, ...preset } : profile}
          onClose={() => setModal(null)}
          onSave={saveProfile}
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
              {selectedDay <= today && (
                <button
                  className="button"
                  onClick={() =>
                    openWrite({ kind: "activity", date: selectedDay })
                  }
                >
                  <Plus size={16} />
                  Ghi hoạt động
                </button>
              )}
              <button
                className="button primary"
                onClick={() => openWrite({ kind: "goal", date: selectedDay })}
              >
                <Plus size={16} />
                Thêm mục tiêu
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
