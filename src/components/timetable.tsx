"use client";
import { useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { setupTerm } from "@/lib/onboarding";
import WeekGoalLegend from "./week-goal-legend";
import WeekHourGrid from "./week-hour-grid";
import Dialog from "./dialog";
import DatePicker from "./date-picker";
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
import { formatMinutes } from "@/lib/focus";
import {
  localDateTime,
  monday,
  type FocusSession,
  type SessionInput,
  type WeeklyBudget,
} from "@/lib/planning";
import {
  clockMinutes,
  minuteClock,
  journeySemesters,
  weekCapacity,
  distributeWeek,
  type TimetableEntry,
  type TimetableInput,
} from "@/lib/schedule";

export default function Timetable({
  week,
  setWeek,
  profile,
  userId,
  entries,
  sessions,
  goals,
  budgets,
  onImport,
  onAuth,
  onChanged,
  onSession,
  activities,
  onActivity,
  onCreate,
  onIntent,
}: {
  week: string;
  setWeek: (v: string) => void;
  profile: Profile;
  userId?: string;
  entries: TimetableEntry[];
  sessions: FocusSession[];
  goals: Goal[];
  budgets: WeeklyBudget[];
  onImport: () => void;
  onAuth: () => void;
  onChanged: () => Promise<void>;
  onSession: (id: string) => void;
  activities: Activity[];
  onActivity: (id: string) => void;
  onCreate: (day: string, time: string) => void;
  onIntent: (id: string, intent: string) => Promise<void>;
}) {
  const [edit, setEdit] = useState<TimetableEntry | "new" | null>(null),
    [planner, setPlanner] = useState(false),
    [error, setError] = useState("");
  const capacity = weekCapacity(week, profile, entries, sessions, goals);
  return (
    <section className="timetable-section">
      <div className="section-heading">
        <div>
          <h2>Thời khóa biểu & khoảng trống</h2>
          <p className="muted small">
            Lớp học và việc cố định chỉ chiếm giờ. Phiên dự định có viền đứt;
            phiên đã xác nhận mới có màu rõ.
          </p>
        </div>
        <div className="row-actions">
          <button
            className="button"
            onClick={() => (userId ? setEdit("new") : onAuth())}
          >
            <Plus size={16} />
            Thêm lịch cố định
          </button>
          <button
            className="button primary"
            onClick={() => (userId ? setPlanner(true) : onAuth())}
          >
            Lập kế hoạch tuần
          </button>
        </div>
      </div>
      <div className="capacity-line">
        <span>
          Giờ thức <b>{formatMinutes(capacity.awake)}</b>
        </span>
        <span>
          TKB/việc cố định <b>{formatMinutes(capacity.fixed)}</b>
        </span>
        <span>
          Giữ cho đợt thi <b>{formatMinutes(capacity.reserved)}</b>
        </span>
        <span>
          Còn có thể phân bổ <b>{formatMinutes(capacity.available)}</b>
        </span>
      </div>
      <p className="muted small">
        Khoảng trắng trên lịch là giờ chưa có lịch. Quỹ còn phân bổ ở trên đã
        trừ phần dự trữ cho đợt thi.
      </p>
      {capacity.exams.length > 0 && (
        <p className="import-warning">
          Tuần có {capacity.exams.map((g) => g.title).join(", ")}. Đã giữ lại{" "}
          {formatMinutes(capacity.reserved)} theo quỹ giờ bạn đặt; giờ ôn thực
          tế vẫn cần log riêng.
        </p>
      )}
      <WeekGoalLegend week={week} goals={goals} sessions={sessions} activities={activities}/>
      <WeekHourGrid
        key={week}
        week={week}
        profile={profile}
        goals={goals}
        entries={entries}
        sessions={sessions}
        activities={activities}
        onCreate={onCreate}
        onIntent={onIntent}
        onOpen={(e) => {
          if (e.type === "fixed")
            setEdit(entries.find((x) => x.id === e.id) || null);
          else if (e.type === "session") onSession(e.id);
          else onActivity(e.id);
        }}
      />
      <div className="row-actions">
        <button
          className="text-button"
          onClick={() => setWeek(addDays(week, -7))}
        >
          <ChevronLeft size={15} />
          Tuần trước
        </button>
        <button
          className="text-button"
          onClick={() => setWeek(addDays(week, 7))}
        >
          Tuần sau
          <ChevronRight size={15} />
        </button>
        <button className="text-button" onClick={onImport}>
          Nhập TKB từ file / dán bảng
        </button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {edit && (
        <TimetableForm
          entry={edit === "new" ? undefined : edit}
          profile={profile}
          goals={goals}
          onClose={() => setEdit(null)}
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
                  .insert(data.map((r) => ({ ...r, user_id: userId })));
            if (r.error) throw r.error;
            await onChanged();
          }}
          onDelete={async (id) => {
            const r = await getSupabase()!
              .from("timetable_entries")
              .delete()
              .eq("id", id);
            if (r.error) throw r.error;
            await onChanged();
          }}
        />
      )}
      {planner && (
        <WeekPlanner
          week={week}
          profile={profile}
          entries={entries}
          sessions={sessions}
          goals={goals}
          budgets={budgets}
          onClose={() => setPlanner(false)}
          onSaved={async (w) => {
            setWeek(w);
            await onChanged();
            setError("");
          }}
        />
      )}
    </section>
  );
}

export function TimetableForm({
  entry,
  profile,
  goals,
  onClose,
  onSave,
  onDelete,
}: {
  entry?: TimetableEntry;
  profile: Profile;
  goals: Goal[];
  onClose: () => void;
  onSave: (data: TimetableInput[], id?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const semesters = journeySemesters(profile),
    current =
      setupTerm(profile, todayKey());
  const [allDay, setAllDay] = useState(entry?.all_day || false);
  const [weekdays, setWeekdays] = useState<number[]>([entry?.weekday ?? 0]);
  const [from, setFrom] = useState(entry?.valid_from || current.start),
    [until, setUntil] = useState(entry?.valid_until || current.end),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const start = allDay ? 0 : clockMinutes(String(f.get("start"))),
        end = allDay ? 1440 : clockMinutes(String(f.get("end")));
      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        end > 1440 ||
        end <= start ||
        until < from
      )
        throw new Error("Kiểm tra khoảng ngày và giờ kết thúc.");
      if (!allDay && !weekdays.length) throw new Error("Chọn ít nhất một thứ.");
      await onSave(
        (allDay ? [0] : weekdays).map((weekday) => ({
          title: String(f.get("title")).trim(),
          goal_id: String(f.get("goal_id") || "") || null,
          all_day: allDay,
          kind: entry?.kind || "fixed",
          semester_index:
            semesters.find((s) => from >= s.start && from <= s.end)?.index ??
            null,
          weekday,
          start_minute: start,
          end_minute: end,
          valid_from: from,
          valid_until: until,
          notes: String(f.get("notes") || ""),
        })),
        entry?.id,
      );
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={entry ? "Sửa lịch cố định" : "Lớp học / việc cố định"}
      description="Lặp hằng tuần trong khoảng ngày đã chọn. Không tạo timer hoặc cộng giờ thực làm."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="form" onSubmit={submit}>
        <label>
          Tên lớp / công việc
          <input
            name="title"
            required
            maxLength={160}
            defaultValue={entry?.title}
          />
        </label>
        <div className="row-actions">
          <button
            type="button"
            className="button"
            aria-pressed={!allDay}
            onClick={() => setAllDay(false)}
          >
            Lặp hằng tuần
          </button>
          <button
            type="button"
            className="button"
            aria-pressed={allDay}
            onClick={() => setAllDay(true)}
          >
            Sự kiện cả ngày
          </button>
        </div>
        <label>
          Gắn mục tiêu (tùy chọn)
          <select name="goal_id" defaultValue={entry?.goal_id || ""}>
            <option value="">Không gắn mục tiêu</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </label>
        {!allDay && (
          <>
            <fieldset className="weekday-choice">
              <legend>Lặp vào</legend>
              {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((d, i) => (
                <label key={d}>
                  <input
                    type={entry ? "radio" : "checkbox"}
                    name="weekday"
                    checked={weekdays.includes(i)}
                    onChange={(e) =>
                      setWeekdays(
                        entry
                          ? [i]
                          : e.target.checked
                            ? [...weekdays, i]
                            : weekdays.filter((x) => x !== i),
                      )
                    }
                  />
                  {d}
                </label>
              ))}
            </fieldset>
            <div className="form-row">
              <label>
                Bắt đầu
                <input
                  name="start"
                  type="text"
                  placeholder="HH:mm"
                  inputMode="numeric"
                  pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
                  required
                  defaultValue={minuteClock(entry?.start_minute ?? 480)}
                />
              </label>
              <label>
                Kết thúc
                <input
                  name="end"
                  type="text"
                  inputMode="numeric"
                  placeholder="HH:mm"
                  pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
                  required
                  defaultValue={minuteClock(entry?.end_minute ?? 600)}
                />
              </label>
            </div>
          </>
        )}
        <div className="form-row">
          <DatePicker label="Áp dụng từ" value={from} onChange={setFrom} />
          <DatePicker
            label="Áp dụng đến"
            value={until}
            min={from}
            onChange={setUntil}
          />
        </div>
        <label>
          Ghi chú
          <textarea name="notes" maxLength={4000} defaultValue={entry?.notes} />
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button className="button primary" disabled={busy}>
          Lưu lịch cố định
        </button>
        {entry && (
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onDelete(entry.id);
                onClose();
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Trash2 size={15} />
            Xóa lịch lặp này
          </button>
        )}
      </form>
    </Dialog>
  );
}

export function WeekPlanner({
  week,
  profile,
  entries,
  sessions,
  goals,
  budgets,
  onClose,
  onSaved,
}: {
  week: string;
  profile: Profile;
  entries: TimetableEntry[];
  sessions: FocusSession[];
  goals: Goal[];
  budgets: WeeklyBudget[];
  onClose: () => void;
  onSaved: (week: string) => Promise<void>;
}) {
  const plannable = goals.filter(
    (g) => g.progress < 100 && g.tracking_mode !== "milestone",
  );
  const hoursForWeek = (w: string) =>
    Object.fromEntries(
      plannable.map((g) => [
        g.id,
        (budgets.find((b) => b.goal_id === g.id && b.week_start === w)
          ?.planned_minutes ?? (g.weekly_hours || 0) * 60) / 60,
      ]),
    );
  const [target, setTarget] = useState(week),
    [hours, setHours] = useState<Record<string, number>>(() =>
      hoursForWeek(week),
    ),
    [proposal, setProposal] = useState<{
      sessions: SessionInput[];
      unallocated: number;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [batch, setBatch] = useState(() => crypto.randomUUID());
  const capacity = weekCapacity(
    target,
    profile,
    entries,
    sessions,
    goals,
    new Date(),
  );
  const changeWeek = (day: string) => {
    const w = monday(day);
    setTarget(w);
    setHours(hoursForWeek(w));
    setProposal(null);
    setBatch(crypto.randomUUID());
  };
  const total = Object.values(hours).reduce((n, h) => n + h * 60, 0);
  async function confirm() {
    if (!proposal) return;
    setBusy(true);
    setError("");
    try {
      const items = [
        ...plannable.map((g) => ({
          kind: "budget",
          goal_id: g.id,
          date: target,
          minutes: Math.round((hours[g.id] || 0) * 60),
        })),
        ...proposal.sessions.map((s) => ({
          ...s,
          kind: "session",
          prevent_overlap: true,
        })),
      ];
      const r = await getSupabase()!.rpc("import_tracker", {
        p_batch_id: batch,
        p_items: items,
      });
      if (r.error) throw r.error;
      await onSaved(target);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setProposal(null);
      setBatch(crypto.randomUUID());
      await onSaved(target);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="Lập kế hoạch tuần"
      description="Chia giờ cho mục tiêu. App gợi ý các phiên trong khoảng trống; chỉ lưu sau khi bạn xác nhận."
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <div className="form">
        <div className="row-actions">
          <DatePicker
            label="Tuần cần lập"
            value={target}
            onChange={changeWeek}
          />
          <button
            className="text-button"
            onClick={() => changeWeek(addDays(monday(todayKey()), 7))}
          >
            Tuần sau
          </button>
        </div>
        <p className="capacity-highlight">
          Còn khoảng <strong>{formatMinutes(capacity.available)}</strong> từ
          hiện tại, sau TKB, việc cố định, phiên đã đặt và quỹ giờ giữ lại.
        </p>
        {capacity.exams.length > 0 && (
          <p className="import-warning">
            {capacity.exams.map((g) => g.title).join(", ")} · đã giữ{" "}
            {formatMinutes(capacity.reserved)}. Cân nhắc giảm phân bổ cho các
            mục tiêu khác trong tuần thi.
          </p>
        )}
        <p className="muted small">
          Deadline gần:{" "}
          {goals
            .filter(
              (g): g is Goal & { deadline: string } =>
                g.progress < 100 && !!g.deadline && g.deadline >= target,
            )
            .sort((a, b) =>
              (a.deadline || "9999").localeCompare(b.deadline || "9999"),
            )
            .slice(0, 3)
            .map((g) => `${g.title} (${formatDate(g.deadline)})`)
            .join(" · ") || "Chưa có"}
        </p>
        {plannable.map((g) => (
          <label key={g.id}>
            {g.title} · giờ trong tuần
            <input
              type="number"
              min={0}
              max={168}
              step={0.25}
              value={hours[g.id] || 0}
              onChange={(e) => {
                setHours({ ...hours, [g.id]: Number(e.target.value) });
                setProposal(null);
                setBatch(crypto.randomUUID());
              }}
            />
          </label>
        ))}
        <button
          className="button primary"
          disabled={
            !plannable.length ||
            total <= 0 ||
            Object.values(hours).some(
              (h) => !Number.isFinite(h) || h < 0 || h > 168,
            )
          }
          onClick={() => {
            setProposal(
              distributeWeek(target, profile, entries, sessions, goals, hours),
            );
            setError("");
          }}
        >
          Gợi ý phiên trong 7 ngày
        </button>
        {proposal && (
          <>
            <p>
              {proposal.sessions.length} phiên dự định · mỗi phiên tối đa 2 giờ.
              Có thể sửa từng phiên sau khi lưu.
            </p>
            {proposal.unallocated > 0 && (
              <p className="import-warning">
                Chưa xếp được {formatMinutes(proposal.unallocated)} vì thiếu
                khoảng trống hoặc thời lượng dưới 15 phút. Hãy giảm quỹ giờ hoặc
                điều chỉnh TKB.
              </p>
            )}
            <div className="plan-preview">
              {proposal.sessions.map((s, i) => (
                <div key={i}>
                  <strong>{s.title}</strong>
                  <span>
                    {formatDate(localDateTime(s.scheduled_start).slice(0, 10))}{" "}
                    · {localDateTime(s.scheduled_start).slice(11)}–
                    {localDateTime(s.scheduled_end).slice(11)}
                  </span>
                </div>
              ))}
            </div>
            <button
              className="button primary"
              disabled={busy || !proposal.sessions.length}
              onClick={() => void confirm()}
            >
              Xác nhận lưu {proposal.sessions.length} phiên & quỹ giờ
            </button>
          </>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
