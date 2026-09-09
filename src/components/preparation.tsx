"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Flag,
  ListChecks,
  Upload,
} from "lucide-react";
import DatePicker from "./date-picker";
import Dialog from "./dialog";
import { GoalForm } from "./journey-forms";
import { TimetableForm, WeekPlanner } from "./timetable";
import SessionEditor from "./session-editor";
import WeekGoalLegend from "./week-goal-legend";
import WeekHourGrid from "./week-hour-grid";
import { getSupabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/errors";
import {
  addDays,
  daysBetween,
  formatDate,
  todayKey,
  type Activity,
  type Goal,
  type GoalInput,
  type Profile,
} from "@/lib/timeline";
import {
  journeySemesters,
  moveSemester,
  type TimetableEntry,
} from "@/lib/schedule";
import {
  localDateTime,
  type FocusSession,
  type WeeklyBudget,
} from "@/lib/planning";
import {
  PROGRAM_YEARS,
  setupJourney,
  setupTerm,
  setupWeek,
  type SetupPart,
} from "@/lib/onboarding";
import { goalSteps } from "@/lib/milestones";
import type { ImportContext } from "@/lib/importer";
const ImportDialog = dynamic(() => import("./import-dialog"));

type Panel =
  | { kind: "import"; context: ImportContext }
  | { kind: "goal"; goal?: Goal }
  | { kind: "timetable"; entry?: TimetableEntry }
  | { kind: "plan" }
  | { kind: "session"; session?: FocusSession; day?: string; time?: string }
  | { kind: "activity"; activity: Activity }
  | { kind: "choose-plan" }
  | null;
const parts = [
  {
    key: "timetable",
    title: "Thời khóa biểu",
    description: "Lớp học và lịch cố định để biết bạn còn trống giờ nào.",
    action: "Nhập thời khóa biểu",
    icon: CalendarDays,
  },
  {
    key: "goals",
    title: "Mục tiêu học kỳ",
    description:
      "Điều bạn muốn đạt được, cùng các việc và cột mốc trên đường đi.",
    action: "Nhập mục tiêu",
    icon: Flag,
  },
  {
    key: "activities",
    title: "Kế hoạch tự học",
    description:
      "Đưa mục tiêu vào những giờ trống. Nhập lịch sẵn có hoặc để app gợi ý.",
    action: "Lập kế hoạch",
    icon: ListChecks,
  },
] as const;
async function readAll<T>(table: string, id: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const r = await getSupabase()!
      .from(table)
      .select("*")
      .eq("user_id", id)
      .order("id")
      .range(from, from + 999);
    if (r.error) throw r.error;
    rows.push(...(r.data as T[]));
    if (r.data.length < 1000) return rows;
  }
}

function JourneySetup({
  profile,
  onSave,
  onBack,
}: {
  profile: Profile;
  onSave: (p: Profile) => Promise<void>;
  onBack?: () => void;
}) {
  const initial = setupTerm(profile, todayKey());
  const [years, setYears] = useState(profile.study_years);
  const [index, setIndex] = useState(initial.index);
  const [term, setTerm] = useState(initial);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const weeks = Math.max(
    0,
    Math.ceil((daysBetween(term.start, term.end) + 1) / 7),
  );
  const remainingWeeks = Math.max(
    0,
    Math.ceil(
      (daysBetween(
        todayKey() > term.start ? todayKey() : term.start,
        term.end,
      ) +
        1) /
        7,
    ),
  );
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave(setupJourney(profile, years, index, term.start, term.end));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="setup-card journey-setup">
      <header>
        <span className="setup-eyebrow">BƯỚC 1 / 2</span>
        <h1>Thiết lập lộ trình của bạn</h1>
        <p>Chỉ cần biết chương trình dài bao lâu và kỳ bạn đang học.</p>
      </header>
      <form onSubmit={submit}>
        <fieldset disabled={busy} className="setup-journey-fields">
          <div className="form">
            <fieldset className="program-choice">
              <legend>Chương trình của bạn dài bao nhiêu năm?</legend>
              <div>
                {PROGRAM_YEARS.map((n) => (
                  <button
                    type="button"
                    key={n}
                    aria-pressed={years === n}
                    onClick={() => {
                      setYears(n);
                      setIndex(Math.min(index, n * 2 - 1));
                    }}
                  >
                    {n} năm
                  </button>
                ))}
              </div>
              <p className="muted">
                Chọn theo chương trình đào tạo. Mỗi năm gồm học kỳ 1 và 2.
              </p>
            </fieldset>
            <label>
              Bạn đang học kỳ nào?
              <select
                value={index}
                onChange={(e) => setIndex(Number(e.target.value))}
              >
                {Array.from({ length: years * 2 }, (_, i) => (
                  <option value={i} key={i}>
                    Năm {Math.floor(i / 2) + 1} · Học kỳ {(i % 2) + 1}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <p className="setup-field-label">
                Kỳ này diễn ra từ ngày nào đến ngày nào?
              </p>
              <div className="form-row">
                <DatePicker
                  label="Ngày bắt đầu"
                  value={term.start}
                  onChange={(day) => setTerm(moveSemester(term, day))}
                />
                <DatePicker
                  label="Ngày kết thúc"
                  min={term.start}
                  value={term.end}
                  onChange={(end) => setTerm({ ...term, end })}
                />
              </div>
              <p className="muted setup-date-hint">
                Khoảng {weeks} tuần. Tuần bắt đầu vào thứ Hai; đổi ngày đầu sẽ
                dịch ngày cuối theo.
              </p>
            </div>
          </div>
          <aside className="journey-preview" aria-label="Minh họa lộ trình">
            <span className="setup-eyebrow">LỘ TRÌNH CỦA BẠN</span>
            <div className="semester-map">
              <span />
              <span>Học kỳ 1</span>
              <span>Học kỳ 2</span>
              {Array.from({ length: years }, (_, y) => (
                <div className="semester-map-row" key={y}>
                  <span>Năm {y + 1}</span>
                  {[0, 1].map((t) => {
                    const i = y * 2 + t;
                    return (
                      <button
                        type="button"
                        key={i}
                        className={
                          i === index
                            ? "current"
                            : i < index
                              ? "past"
                              : "future"
                        }
                        aria-pressed={i === index}
                        aria-label={`Chọn năm ${y + 1}, học kỳ ${t + 1}`}
                        onClick={() => setIndex(i)}
                      >
                        {i === index
                          ? "Đang học"
                          : i < index
                            ? "Đã qua"
                            : "Sắp tới"}
                        {i === index && <span className="semester-pointer" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="journey-preview-caption" aria-live="polite">
              <strong>{years * 2 - index} học kỳ</strong>
              <span>còn lại, tính cả kỳ này</span>
              <small>Kỳ này còn {remainingWeeks} tuần</small>
            </div>
          </aside>
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <footer className="setup-card-footer">
          <p>Các kỳ khác được ước tính. Bạn có thể chỉnh lại trong Cài đặt.</p>
          <div className="row-actions">
            {onBack && (
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={onBack}
              >
                Quay lại
              </button>
            )}
            <button className="button primary" disabled={busy}>
              {busy ? "Đang lưu…" : "Tiếp tục"}
              <ArrowRight size={17} />
            </button>
          </div>
        </footer>
      </form>
    </section>
  );
}

export default function Preparation({
  profile,
  goals,
  activities,
  onSave,
  onSaveGoal,
  onReload,
  onFinish,
}: {
  profile: Profile;
  goals: Goal[];
  activities: Activity[];
  onSave: (p: Profile) => Promise<void>;
  onSaveGoal: (data: GoalInput, id?: string) => Promise<void>;
  onReload: () => Promise<void>;
  onFinish: () => Promise<void>;
}) {
  const [journey, setJourney] = useState(
    profile.onboarding_term == null &&
      !(profile.confirmed_semesters || []).length,
  );
  const [panel, setPanel] = useState<Panel>(null);
  const [entries, setEntries] = useState<TimetableEntry[]>([]),
    [sessions, setSessions] = useState<FocusSession[]>([]),
    [budgets, setBudgets] = useState<WeeklyBudget[]>([]);
  const [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const term = setupTerm(profile, todayKey());
  const [week, setWeek] = useState(() => setupWeek(term, todayKey()));
  const [review, setReview] = useState(false);
  const loadSaved = useCallback(async () => {
    const [t, s, b] = await Promise.all([
      readAll<TimetableEntry>("timetable_entries", profile.id),
      readAll<FocusSession>("focus_sessions", profile.id),
      readAll<WeeklyBudget>("weekly_budgets", profile.id),
    ]);
    setEntries(t);
    setSessions(s);
    setBudgets(b);
    setLoaded(true);
    setError("");
  }, [profile.id]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSaved().catch((e) => setError(errorMessage(e)));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSaved]);
  async function refresh() {
    await Promise.all([onReload(), loadSaved()]);
    setNotice("Đã lưu. Lịch và phần xem lại đã được cập nhật.");
  }
  const currentEntries = entries.filter(
    (e) => e.valid_from <= term.end && e.valid_until >= term.start,
  );
  const currentSessions = sessions.filter(
    (s) =>
      localDateTime(s.scheduled_start).slice(0, 10) <= term.end &&
      localDateTime(s.scheduled_end).slice(0, 10) >= term.start,
  );
  const currentGoals = goals.filter(
    (g) =>
      g.semester_index === term.index ||
      (!g.deadline && g.semester_index == null) ||
      goalSteps(g).some(
        (s) =>
          s.date && s.date <= term.end && (s.end_date || s.date) >= term.start,
      ) ||
      currentSessions.some((s) => s.goal_id === g.id) ||
      currentEntries.some((e) => e.goal_id === g.id),
  );
  const counts = {
    timetable: currentEntries.length,
    goals: currentGoals.length,
    activities: currentSessions.length,
  };
  const done = parts.filter((p) => counts[p.key] > 0).length;
  const skipped = profile.preparation_skipped || [];
  async function skip(part: SetupPart) {
    setBusy(true);
    setError("");
    try {
      await onSave({
        ...profile,
        preparation_skipped: [...new Set([...skipped, part])],
      });
      setPanel(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function manual(part: SetupPart) {
    setPanel(
      part === "goals"
        ? { kind: "goal" }
        : part === "timetable"
          ? { kind: "timetable" }
          : { kind: "session", day: week },
    );
  }
  async function finish() {
    setBusy(true);
    setError("");
    try {
      await onFinish();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="setup-shell">
      <nav className="setup-topbar" aria-label="Tiến trình thiết lập">
        <span className="setup-brand">
          uni tracker<span>.</span>
        </span>
        <ol>
          <li aria-current={journey ? "step" : undefined}>
            <span>{journey ? "1" : <Check size={14} />}</span>Lộ trình
          </li>
          <li aria-current={!journey ? "step" : undefined}>
            <span>2</span>Lịch của bạn
          </li>
        </ol>
      </nav>
      {journey ? (
        <JourneySetup
          profile={profile}
          onBack={
            profile.onboarding_term != null
              ? () => setJourney(false)
              : undefined
          }
          onSave={async (p) => {
            await onSave(p);
            setWeek(setupWeek(setupTerm(p, todayKey()), todayKey()));
            setJourney(false);
          }}
        />
      ) : (
        <>
          <section className="setup-card setup-data">
            <header className="setup-data-heading">
              <div>
                <span className="setup-eyebrow">
                  BƯỚC 2 / 2 · NĂM {Math.floor(term.index / 2) + 1}, HỌC KỲ{" "}
                  {(term.index % 2) + 1}
                </span>
                <h1>Ghép nên một tuần của bạn</h1>
                <p>
                  Ba mảnh ghép để bắt đầu. Có gì nhập trước, phần còn lại có thể
                  bổ sung sau.
                </p>
              </div>
              <div
                className="setup-progress"
                aria-label={`${done} trên 3 mục đã có dữ liệu`}
              >
                <strong>
                  {done}
                  <span>/3</span>
                </strong>
                <small>mục đã có</small>
              </div>
            </header>
            <div className="setup-bulk">
              <div>
                <Upload size={19} />
                <span>Đã có thời khóa biểu, mục tiêu và kế hoạch?</span>
              </div>
              <button
                className="text-button"
                onClick={() => setPanel({ kind: "import", context: "all" })}
              >
                Nhập cả ba một lần <ArrowRight size={16} />
              </button>
            </div>
            <ol className="setup-parts">
              {parts.map((part, i) => {
                const Icon = part.icon,
                  count = counts[part.key],
                  isSkipped = skipped.includes(part.key) && !count;
                return (
                  <li key={part.key} className={count ? "complete" : ""}>
                    <span
                      className="setup-part-state"
                      aria-label={
                        count
                          ? "Đã có dữ liệu"
                          : isSkipped
                            ? "Để sau"
                            : "Chưa nhập"
                      }
                    >
                      {count ? <Check size={18} /> : i + 1}
                    </span>
                    <div className="setup-part-copy">
                      <h2>
                        <Icon size={18} />
                        {part.title}
                      </h2>
                      <p>{part.description}</p>
                      <span className="setup-part-status">
                        {!loaded
                          ? "Đang kiểm tra…"
                          : count
                            ? `${count} ${part.key === "goals" ? "mục tiêu" : part.key === "timetable" ? "lịch cố định" : "hoạt động"} đã lưu`
                            : isSkipped
                              ? "Để sau · có thể bổ sung bất cứ lúc nào"
                              : "Chưa có dữ liệu"}
                      </span>
                    </div>
                    <div className="setup-part-actions">
                      <button
                        className={`button ${!count && !isSkipped && i === parts.findIndex((p) => !counts[p.key] && !skipped.includes(p.key)) ? "primary" : ""}`}
                        disabled={!loaded || busy}
                        onClick={() =>
                          setPanel(
                            part.key === "activities"
                              ? { kind: "choose-plan" }
                              : { kind: "import", context: part.key },
                          )
                        }
                      >
                        {count ? "Bổ sung" : part.action}
                      </button>
                      {!count && !isSkipped && (
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => void skip(part.key)}
                        >
                          Để sau
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
            <footer className="setup-card-footer">
              <button className="text-button" onClick={() => setJourney(true)}>
                <ArrowLeft size={15} /> Chỉnh lộ trình
              </button>
              <button
                className="button primary"
                disabled={busy || !loaded}
                onClick={() => setReview(true)}
              >
                Xem lại & tiếp tục <ArrowRight size={16} />
              </button>
            </footer>
          </section>
          {notice && (
            <p className="setup-notice" role="status">
              <Check size={16} /> {notice}
            </p>
          )}
          <section className="setup-card setup-calendar">
            <div className="setup-calendar-heading">
              <div>
                <h2>Lịch tuần của bạn</h2>
                <p>
                  Chỉ hiển thị dữ liệu đã lưu. Mục tiêu giữ nguyên các cột mốc,
                  chưa tự tạo giờ học.
                </p>
              </div>
              <div className="row-actions">
                <button
                  className="icon-button"
                  aria-label="Tuần trước"
                  onClick={() => setWeek(addDays(week, -7))}
                >
                  <ChevronLeft size={18} />
                </button>
                <span>
                  {formatDate(week)} – {formatDate(addDays(week, 6), true)}
                </span>
                <button
                  className="icon-button"
                  aria-label="Tuần sau"
                  onClick={() => setWeek(addDays(week, 7))}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
            <WeekGoalLegend
              week={week}
              goals={currentGoals}
              sessions={sessions}
              activities={activities}
              onGoal={(goal) => setPanel({ kind: "goal", goal })}
            />
            <WeekHourGrid
              week={week}
              profile={profile}
              goals={goals}
              entries={entries}
              sessions={sessions}
              activities={activities}
              onOpen={(e) => {
                if (e.type === "fixed")
                  setPanel({
                    kind: "timetable",
                    entry: entries.find((x) => x.id === e.id),
                  });
                else if (e.type === "session")
                  setPanel({
                    kind: "session",
                    session: sessions.find((x) => x.id === e.id),
                  });
                else {
                  const activity = activities.find((x) => x.id === e.id);
                  if (activity) setPanel({ kind: "activity", activity });
                }
              }}
              onCreate={(day, time) =>
                setPanel(
                  goals.length
                    ? { kind: "session", day, time }
                    : { kind: "goal" },
                )
              }
              onIntent={async (id, intent) => {
                const r = await getSupabase()!.rpc("set_session_content", {
                  p_id: id,
                  p_intent: intent,
                  p_actual: null,
                });
                if (r.error) throw r.error;
                await refresh();
              }}
            />
            {!currentEntries.length && !currentSessions.length && (
              <p className="setup-empty-calendar">
                Thêm thời khóa biểu để thấy giờ bận, rồi xếp kế hoạch vào khoảng
                trống.
              </p>
            )}
          </section>
        </>
      )}
      {error && (
        <div className="form-error" role="alert">
          {error}
          {!loaded && (
            <button
              className="text-button"
              onClick={() =>
                void loadSaved().catch((e) => setError(errorMessage(e)))
              }
            >
              Thử lại
            </button>
          )}
        </div>
      )}
      {panel?.kind === "import" && (
        <ImportDialog
          context={panel.context}
          initialKind={panel.context === "timetable" ? "timetable" : "session"}
          goals={goals}
          activities={activities}
          profile={profile}
          onClose={() => setPanel(null)}
          onImported={refresh}
          completionLabel="Trở về thiết lập"
          onManual={
            panel.context !== "all"
              ? () => manual(panel.context as SetupPart)
              : undefined
          }
          onSkip={
            panel.context !== "all"
              ? () => void skip(panel.context as SetupPart)
              : undefined
          }
        />
      )}
      {panel?.kind === "goal" && (
        <GoalForm
          goal={panel.goal}
          defaultDate={term.start}
          defaultSemesterIndex={term.index}
          semesters={journeySemesters(profile)}
          onClose={() => setPanel(null)}
          onSave={async (data, id) => {
            await onSaveGoal(data, id);
            await loadSaved();
            setNotice(
              "Đã lưu mục tiêu. Bạn có thể tiếp tục bổ sung hoặc lập kế hoạch tự học.",
            );
          }}
        />
      )}
      {panel?.kind === "timetable" && (
        <TimetableForm
          entry={panel.entry}
          profile={profile}
          goals={goals}
          onClose={() => setPanel(null)}
          onSave={async (data, id) => {
            const db = getSupabase()!;
            const r = id
              ? await db
                  .from("timetable_entries")
                  .update(data[0])
                  .eq("id", id)
                  .select("id")
                  .single()
              : await db
                  .from("timetable_entries")
                  .insert(data.map((r) => ({ ...r, user_id: profile.id })));
            if (r.error) throw r.error;
            await refresh();
          }}
          onDelete={async (id) => {
            const r = await getSupabase()!
              .from("timetable_entries")
              .delete()
              .eq("id", id);
            if (r.error) throw r.error;
            await refresh();
          }}
        />
      )}
      {panel?.kind === "session" && (
        <SessionEditor
          session={panel.session}
          goals={goals}
          defaultDate={panel.day || week}
          defaultTime={panel.time}
          userId={profile.id}
          onClose={() => setPanel(null)}
          onSaved={refresh}
        />
      )}
      {panel?.kind === "activity" && (
        <Dialog
          title={panel.activity.title}
          description="Hoạt động đã lưu"
          onClose={() => setPanel(null)}
        >
          <p>
            {formatDate(panel.activity.occurred_on, true)} ·{" "}
            {panel.activity.duration_minutes} phút
          </p>
          <p>{panel.activity.notes}</p>
        </Dialog>
      )}
      {panel?.kind === "plan" && (
        <WeekPlanner
          week={week}
          profile={profile}
          entries={entries}
          sessions={sessions}
          goals={currentGoals}
          budgets={budgets}
          onClose={() => setPanel(null)}
          onSaved={async (w) => {
            setWeek(w);
            await refresh();
          }}
        />
      )}
      {panel?.kind === "choose-plan" && (
        <Dialog
          title="Kế hoạch tự học của bạn"
          description="Chọn cách phù hợp với những gì bạn đã chuẩn bị."
          onClose={() => setPanel(null)}
        >
          <div className="setup-plan-choices">
            <button
              className="setup-plan-option"
              onClick={() =>
                setPanel({ kind: "import", context: "activities" })
              }
            >
              <Upload size={22} />
              <strong>Tôi đã có kế hoạch</strong>
              <span>
                Prompt AI riêng và nhập file, có xem lại trước khi lưu.
              </span>
              <ArrowRight size={18} />
            </button>
            <button
              className="setup-plan-option"
              disabled={!currentGoals.length}
              onClick={() => setPanel({ kind: "plan" })}
            >
              <CalendarDays size={22} />
              <strong>Gợi ý giờ tự học cho tôi</strong>
              <span>
                Chọn quỹ giờ từng mục tiêu, xem và xác nhận lịch được đề xuất.
              </span>
              <ArrowRight size={18} />
            </button>
            {!currentGoals.length && (
              <p className="muted">
                Thêm mục tiêu trước để app có thể gợi ý kế hoạch. Bạn vẫn có thể
                nhập file chứa cả mục tiêu và hoạt động.
              </p>
            )}
            <div className="import-guide-footer">
              <button
                className="text-button"
                disabled={!goals.length}
                onClick={() => manual("activities")}
              >
                Hoặc nhập tay từng hoạt động
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void skip("activities")}
              >
                Để sau
              </button>
            </div>
          </div>
        </Dialog>
      )}
      {review && (
        <Dialog
          title="Sẵn sàng với lịch của bạn"
          description="Dữ liệu bên dưới đã được lưu. Kiểm tra cả ba mục trước khi vào ứng dụng."
          wide
          onClose={() => {
            if (!busy) setReview(false);
          }}
        >
          <div className="setup-review form">
            {parts.map((p) => (
              <details key={p.key} open>
                <summary>
                  {p.title}
                  <span>
                    {counts[p.key]} {p.key === "goals" ? "mục tiêu" : "mục"}
                    {!counts[p.key] ? " · bổ sung sau" : ""}
                  </span>
                </summary>
                {p.key === "goals" ? (
                  currentGoals.map((g) => (
                    <div className="setup-review-goal" key={g.id}>
                      <button
                        className="text-button"
                        style={{ color: g.color }}
                        onClick={() => {
                          setReview(false);
                          setPanel({ kind: "goal", goal: g });
                        }}
                      >
                        {g.title}
                      </button>
                      <ul>
                        {goalSteps(g).map((s) => (
                          <li key={s.id}>
                            {s.done ? "✓ " : ""}
                            {s.title} ·{" "}
                            {s.date
                              ? formatDate(s.date, true)
                              : "Chưa chốt ngày"}
                            {s.end_date && s.end_date !== s.date
                              ? " – " + formatDate(s.end_date, true)
                              : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))
                ) : p.key === "timetable" ? (
                  <ul>
                    {currentEntries.map((e) => (
                      <li key={e.id}>
                        {e.title} ·{" "}
                        {e.all_day
                          ? "Cả ngày"
                          : ["T2", "T3", "T4", "T5", "T6", "T7", "CN"][
                              e.weekday
                            ]}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul>
                    {currentSessions.map((s) => (
                      <li key={s.id}>
                        {s.title} ·{" "}
                        {formatDate(
                          localDateTime(s.scheduled_start).slice(0, 10),
                        )}{" "}
                        · {s.planned_minutes} phút
                        {s.is_unscheduled ? " · chưa xếp giờ" : ""}
                      </li>
                    ))}
                  </ul>
                )}
                {!counts[p.key] && (
                  <p className="muted">
                    Bạn có thể tiếp tục dùng app và quay lại phần Thiết lập để
                    bổ sung.
                  </p>
                )}
              </details>
            ))}
            <div className="form-actions">
              <button
                className="button"
                disabled={busy}
                onClick={() => setReview(false)}
              >
                Bổ sung tiếp
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={() => void finish()}
              >
                {busy ? "Đang lưu…" : "Vào lịch của tôi"}
                <ArrowRight size={16} />
              </button>
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </Dialog>
      )}
    </main>
  );
}
