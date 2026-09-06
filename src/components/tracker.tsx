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
  buildSemesters,
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
import {
  ActivityForm,
  AuthForm,
  errorMessage,
  GoalForm,
  SettingsForm,
} from "./forms";
import Dialog from "./dialog";
import ProductivityPanel from "./productivity";
import {
  activityLabel,
  dayBackground,
  formatMinutes,
  isWork,
  summarizeDays,
  type DaySummary,
  type HeatmapMode,
} from "@/lib/focus";

type View = "timeline" | "goals" | "journal";
type Modal =
  | { kind: "auth" | "recovery" | "settings" }
  | { kind: "goal"; goal?: Goal; date?: string }
  | { kind: "activity"; activity?: Activity; date?: string }
  | { kind: "delete"; table: "goals" | "activities"; id: string; title: string }
  | null;
const NAV = [
  { id: "timeline" as const, label: "Hành trình 4 năm", icon: LayoutGrid },
  { id: "goals" as const, label: "Mục tiêu của tôi", icon: Target },
  { id: "journal" as const, label: "Nhật ký hoạt động", icon: BookOpen },
];

function SemesterCard({
  semester,
  summaries,
  mode,
  activities,
  goals,
  today,
  selectedDay,
  onDay,
  onOpen,
}: {
  semester: Semester;
  summaries: Map<string, DaySummary>;
  mode: HeatmapMode;
  activities: Activity[];
  goals: Goal[];
  today: string;
  selectedDay: string | null;
  onDay: (day: string) => void;
  onOpen: () => void;
}) {
  const current = today >= semester.start && today <= semester.end;
  const future = today < semester.start;
  const total = activities.filter(
    (a) => a.occurred_on >= semester.start && a.occurred_on <= semester.end,
  ).length;
  const semesterGoals = goals.filter(
    (g) => g.deadline >= semester.start && g.deadline <= semester.end,
  );
  const done = semesterGoals.filter((g) => g.progress === 100).length;
  return (
    <section
      className={`semester-card ${current ? "current" : ""} ${future ? "future" : ""}`}
      aria-label={`Năm ${semester.year}, học kỳ ${semester.term}`}
    >
      <div className="semester-heading">
        <div>
          <h3>Học kỳ {semester.term}</h3>
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
              <span>T2</span>
              <span>T4</span>
              <span>T6</span>
            </div>
            <div className="heatmap">
              {semester.days.map((day, i) => {
                const summary = day ? summaries.get(day) : undefined;
                const title = day
                  ? `${formatDate(day, true)} · ${formatMinutes(summary?.minutes || 0)}${summary?.label ? ` · ${summary.label}` : " · Chưa có hoạt động"}`
                  : "";
                return day ? (
                  <button
                    key={day}
                    type="button"
                    className={`day-cell ${day === today ? "today" : ""} ${day === selectedDay ? "selected" : ""} ${summary?.deadlines.length ? "has-deadline" : ""} ${summary?.marker ? "has-marker" : ""}`}
                    style={{ background: dayBackground(summary, mode) }}
                    title={title}
                    aria-label={title}
                    aria-pressed={day === selectedDay}
                    onClick={() => onDay(day)}
                  >
                    <span aria-hidden="true">{summary?.marker}</span>
                    {(summary?.colors.length || 0) > 4 && (
                      <i className="day-overflow" aria-hidden="true" />
                    )}
                  </button>
                ) : (
                  <span className="day-cell blank" key={`blank-${i}`} />
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="semester-footer">
        <span>
          <span className={`status-dot ${total ? "active" : ""}`} />
          {total.toLocaleString("vi-VN")} hoạt động
        </span>
        <button className="text-button muted" onClick={onOpen}>
          {done}/{semesterGoals.length} mục tiêu
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
      {goal.tracking_mode === "progress" ? (
        <>
          <div className="progress-caption">
            <span>{completed ? "Đã hoàn thành" : "Tiến độ"}</span>
            <strong>{goal.progress}%</strong>
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
          {formatDate(
            completed && goal.completed_on ? goal.completed_on : goal.deadline,
            true,
          )}
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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<View>("timeline");
  const [modal, setModal] = useState<Modal>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState("all");
  const [semesterFilter, setSemesterFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [journalLimit, setJournalLimit] = useState(30);
  const [mobileNav, setMobileNav] = useState(false);
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>("goals");
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
      setProfile(
        savedProfile || {
          id: currentUser.id,
          display_name: currentUser.user_metadata.display_name || "Bạn",
          start_year: new Date().getFullYear(),
          start_month: 9,
        },
      );
      setGoals(allGoals);
      setHeatmapGoal((previous) =>
        allGoals.some((g) => g.id === previous) ? previous : "all",
      );
      setActivities(allActivities);
      if (!savedProfile)
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
      setUser(currentUser);
      if (event === "PASSWORD_RECOVERY") setModal({ kind: "recovery" });
      if (currentUser) {
        if (
          event === "INITIAL_SESSION" ||
          event === "SIGNED_IN" ||
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
    () =>
      profile ? buildSemesters(profile.start_year, profile.start_month) : [],
    [profile],
  );
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
      semesters.length && day >= semesters[0].start && day <= semesters[7].end,
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
              (daysBetween(semesters[0].start, semesters[7].end) + 1)) *
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
          .eq("kind", "event")
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
  function exportData() {
    const blob = new Blob(
      [
        JSON.stringify(
          { exported_at: new Date().toISOString(), profile, goals, activities },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `uni-tracker-${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
      (!sem || (g.deadline >= sem.start && g.deadline <= sem.end)) &&
      g.title.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi"))
    );
  });
  const filteredActivities = recent.filter((a) =>
    `${a.title} ${a.notes}`
      .toLocaleLowerCase("vi")
      .includes(query.toLocaleLowerCase("vi")),
  );
  const dayActivities = selectedDay
    ? recent.filter((a) => a.occurred_on === selectedDay)
    : [];
  const dayGoals = selectedDay
    ? goals.filter((g) => g.deadline === selectedDay)
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
            Bốn năm là hành trình dài.
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
            <button className="nav-item" onClick={exportData}>
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
              <span className="private-label">
                <span className="status-dot active" />
                Riêng tư
              </span>
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
          <div className="page-heading">
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
                  ? "Bốn năm, tám học kỳ — và những bước tiến của bạn."
                  : view === "goals"
                    ? "Biến những dự định thành những điều đã làm được."
                    : "Lưu lại từng ngày bạn đã học hỏi, trải nghiệm và trưởng thành."}
              </p>
            </div>
            <div className="heading-actions">
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
                <div className="stats-grid">
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
                            Toàn cảnh 4 năm
                            <span className="count-badge">
                              {profile.start_year} — {profile.start_year + 4}
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
                          {[1, 2, 3, 4].map((y) => (
                            <option key={y} value={y}>
                              Năm {y}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="heatmap-toolbar">
                        <div
                          className="segmented"
                          aria-label="Cách xem timeline"
                        >
                          <button
                            className={
                              heatmapMode === "goals" ? "selected" : ""
                            }
                            aria-pressed={heatmapMode === "goals"}
                            onClick={() => setHeatmapMode("goals")}
                          >
                            Mục tiêu & cột mốc
                          </button>
                          <button
                            className={
                              heatmapMode === "focus" ? "selected" : ""
                            }
                            aria-pressed={heatmapMode === "focus"}
                            onClick={() => setHeatmapMode("focus")}
                          >
                            Năng suất
                          </button>
                        </div>
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
                      {heatmapMode === "goals" && (
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
                      )}
                      <div className="timeline-grid">
                        {[1, 2, 3, 4]
                          .filter(
                            (y) =>
                              yearFilter === "all" || y === Number(yearFilter),
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
                                  .filter((s) => s.year === year)
                                  .map((semester) => (
                                    <SemesterCard
                                      key={semester.index}
                                      semester={semester}
                                      summaries={summaries}
                                      mode={heatmapMode}
                                      activities={visibleActivities}
                                      goals={visibleGoals}
                                      today={today}
                                      selectedDay={selectedDay}
                                      onDay={setSelectedDay}
                                      onOpen={() => {
                                        setView("goals");
                                        setSemesterFilter(
                                          String(semester.index),
                                        );
                                        setStatusFilter("all");
                                        setCategoryFilter("all");
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
                        {heatmapMode === "focus" ? (
                          <span className="scale">
                            0
                            {[0, 1, 2, 3, 4].map((i) => (
                              <i key={i} className={`level-${i}`} />
                            ))}
                            ≥ 3 giờ
                          </span>
                        ) : (
                          <span>
                            <i className="legend-split" /> Nhiều mục tiêu
                          </span>
                        )}
                      </div>
                      <p className="muted small heatmap-help">
                        {heatmapMode === "goals"
                          ? "Màu nhạt: hoạt động/tiến độ · Màu đậm có viền: deadline · Hai mục tiêu chia chéo, 3–4 mục tiêu chia góc; dấu chấm đen báo còn mục khác."
                          : "Sắc xanh theo thời lượng: dưới 30 phút, 30–89 phút, 90–179 phút, từ 180 phút. Ghi chú chưa có thời lượng dùng xanh nhạt."}
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
                            : `${profile.start_year} — ${profile.start_year + 4}`}
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
                                    : `${goal.progress}%`}
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
                            {activity.kind === "event" && (
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
                            )}
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
          <footer className="page-footer">
            <span>
              uni tracker<span className="brand-dot">.</span>
            </span>
            <span>Mỗi ngày một chút, bốn năm một hành trình.</span>
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
      {modal?.kind === "settings" && profile && (
        <SettingsForm
          profile={profile}
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
          description={`${dayActivities.length} hoạt động · ${dayGoals.length} mục tiêu đến hạn`}
          onClose={() => setSelectedDay(null)}
        >
          <div className="day-detail">
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
                        : `${goal.progress}%`}
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
                    {a.kind === "completion" && <CircleCheck size={18} />}
                  </div>
                ))}
              </>
            )}
            {!dayActivities.length && !dayGoals.length && (
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
