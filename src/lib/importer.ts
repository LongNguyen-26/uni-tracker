import Papa from "papaparse";
import { clockMinutes, minuteClock, isGreen } from "./schedule";
import { measuredSteps, goalSteps } from "./milestones";
import { parseDate } from "./timeline";
import {
  addDays,
  CATEGORIES,
  GOAL_COLORS,
  type Goal,
  type GoalInput,
  type ActivityInput,
  type SemesterSettings,
} from "./timeline";
import { calculatedProgress, monday, validDate } from "./planning";

export type ImportContext = "schedule" | "goals" | "restore";
export type ImportKind =
  "goal" | "milestone" | "session" | "activity" | "budget" | "timetable";
export type ImportRow = {
  key: string;
  kind: ImportKind;
  title: string;
  date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  minutes: string;
  goal_id: string;
  ref: string;
  goal_ref: string;
  notes: string;
  goal: Partial<GoalInput>;
  activity?: Partial<ActivityInput>;
  timetable?: { kind: "class" | "fixed"; semester_index: number | null };
  selected: boolean;
  issue: string;
  status?: "planned" | "completed";
  explicit_end?: boolean;
  all_day?: boolean;
  generated?: boolean;
  source_error?: string;
  warning?: string;
  server_error?: string;
};
export const labels: Record<ImportKind, string> = {
  goal: "Mục tiêu",
  milestone: "Việc / cột mốc",
  session: "Hoạt động",
  activity: "Hoạt động",
  budget: "Quỹ giờ tuần",
  timetable: "Lịch cố định",
};
const normalize = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[\s_-]+/g, "");
const aliases: Record<string, string[]> = {
  title: [
    "title",
    "ten",
    "tentacvu",
    "hoatdong",
    "tenhoatdong",
    "monhoc",
    "tenmonhoc",
    "summary",
  ],
  date: ["date", "ngay", "ngaybatdau", "startdate", "occurredon", "weekstart"],
  end_date: ["enddate", "ngayketthuc", "deadline", "han", "hanhoanthanh"],
  start_time: ["starttime", "giobatdau", "batdau"],
  end_time: ["endtime", "gioketthuc", "ketthuc"],
  minutes: ["minutes", "phut", "durationminutes", "thoiluong"],
  hours: ["hours", "gio", "plannedhours"],
  goal_id: ["goalid", "muctieu", "goal", "tenmuctieu"],
  kind: ["type", "kind", "loai"],
  notes: ["notes", "ghichu", "description"],
  weekday: ["weekday", "thu"],
  mode: ["trackingmode", "cachtheodoi"],
  current: ["current", "metriccurrent", "hientai"],
  target: ["target", "metrictarget", "mucdich"],
  unit: ["unit", "metricunit", "donvi"],
  color: ["color", "mau"],
  timing: ["timingmode", "loaithoigian"],
  reserved: ["reservedhours", "giugiotuan"],
  weekly_hours: ["weeklyhours", "giomoituan", "quygiotuan"],
  checklist: ["checklist", "steps", "cacbuoc", "danhsachviec"],
  status: ["status", "trangthai"],
  direction: ["metricdirection", "direction"],
};
export function importDate(value: unknown): string {
  const s = String(value ?? "").trim();
  if (validDate(s)) return s;
  const m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : s;
}
const time = (v: unknown) => {
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::00)?$/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : s;
};
function row(
  input: Record<string, unknown>,
  kind: ImportKind,
  anchor: string,
  index: number,
): ImportRow {
  const v: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(input)) {
    const n = normalize(key);
    const k = Object.keys(aliases).find((k) => aliases[k].includes(n));
    if (k) v[k] = val;
  }
  const requested = String(
    v.kind ||
      (v.weekday
        ? "timetable"
        : !v.date && (v.target || v.checklist || v.weekly_hours)
          ? "goal"
          : kind),
  );
  const kinds: Record<string, ImportKind> = {
    timetable: "timetable",
    tkb: "timetable",
    class: "timetable",
    fixed: "timetable",
    lichcodinh: "timetable",
    goal: "goal",
    muctieu: "goal",
    milestone: "milestone",
    cotmoc: "milestone",
    session: "session",
    phienhoc: "session",
    activity: "activity",
    hoatdong: "session",
    nhatky: "activity",
    budget: "budget",
    quygiotuan: "budget",
  };
  kind = kinds[normalize(requested)] || kind;
  let date = importDate(v.date);
  if (!date && v.weekday) {
    const d = normalize(String(v.weekday));
    const weekdays: Record<string, number> = {
      t2: 0,
      thu2: 0,
      "2": 0,
      monday: 0,
      t3: 1,
      thu3: 1,
      "3": 1,
      tuesday: 1,
      t4: 2,
      thu4: 2,
      "4": 2,
      wednesday: 2,
      t5: 3,
      thu5: 3,
      "5": 3,
      thursday: 3,
      t6: 4,
      thu6: 4,
      "6": 4,
      friday: 4,
      t7: 5,
      thu7: 5,
      "7": 5,
      saturday: 5,
      cn: 6,
      chunhat: 6,
      sunday: 6,
    };
    if (d in weekdays) date = addDays(monday(anchor), weekdays[d]);
  }
  const missingGoalDate = !date && kind === "goal";
  if (!date && (kind === "goal" || kind === "milestone"))
    date = importDate(v.end_date);
  const goal: Partial<GoalInput> = {};
  if (v.mode) goal.tracking_mode = String(v.mode) as Goal["tracking_mode"];
  if (v.current !== undefined && v.current !== "")
    goal.metric_current = Number(v.current);
  if (v.target !== undefined && v.target !== "")
    goal.metric_target = Number(v.target);
  if (v.unit) goal.metric_unit = String(v.unit);
  if (v.color) goal.color = String(v.color);
  if (v.timing) goal.timing_mode = String(v.timing) as Goal["timing_mode"];
  if (v.reserved) goal.reserved_hours = Number(v.reserved);
  if (v.weekly_hours !== undefined && v.weekly_hours !== "")
    goal.weekly_hours = Number(v.weekly_hours);
  if (v.direction)
    goal.metric_direction = String(v.direction) as Goal["metric_direction"];
  if (v.checklist) {
    const steps = Array.isArray(v.checklist)
      ? v.checklist
      : String(v.checklist)
          .split("|")
          .filter((s) => s.trim());
    goal.checklist = steps.map((s, i) =>
      typeof s === "string"
        ? { id: `step-${i}`, title: s.trim(), done: false }
        : (s as Goal["checklist"][number]),
    );
  }
  // The measure is inferred from data. Empty legacy mode columns never force a fake measure.
  goal.tracking_mode =
    goal.metric_current !== undefined && goal.metric_target !== undefined
      ? "numeric"
      : measuredSteps(goal.checklist || []).length
        ? "checklist"
        : "none";
  const status = normalize(String(v.status || ""));
  return {
    key: `row-${index}`,
    kind,
    title: String(v.title ?? "").trim(),
    date,
    end_date: importDate(v.end_date) || date,
    start_time: time(v.start_time),
    end_time: time(v.end_time),
    minutes: String(v.minutes || (v.hours ? Number(v.hours) * 60 : "")),
    goal_id: kind === "goal" ? "" : String(v.goal_id ?? ""),
    ref: String(input.id || ""),
    goal_ref: "",
    notes: String(v.notes ?? ""),
    goal,
    timetable:
      kind === "timetable"
        ? {
            kind: normalize(requested) === "fixed" ? "fixed" : "class",
            semester_index:
              input.semester_index == null
                ? null
                : Number(input.semester_index),
          }
        : undefined,
    selected: true,
    issue: kinds[normalize(requested)]
      ? ""
      : `Loại “${requested}” chưa được hỗ trợ.`,
    status: ["planned", "dudinh"].includes(status)
      ? "planned"
      : ["completed", "done", "daxong", "dahoanthanh"].includes(status)
        ? "completed"
        : undefined,
    source_error:
      status &&
      ![
        "planned",
        "dudinh",
        "completed",
        "done",
        "daxong",
        "dahoanthanh",
      ].includes(status)
        ? "Cột status cần planned (dự định) hoặc completed (đã xong)."
        : undefined,
    explicit_end: Boolean(v.end_date),
    all_day: kind === "timetable" && !v.start_time && !v.end_time,
    warning:
      missingGoalDate && !date
        ? "Chưa chốt hạn; vẫn nhập mục tiêu bình thường."
        : undefined,
  };
}
export function parseTable(
  text: string,
  kind: ImportKind,
  anchor: string,
): ImportRow[] {
  let source = text.trim().replace(/^\uFEFF/, "");
  // Some pasted exports wrap the entire CSV in a pair of quotes.
  if (source.startsWith('"title,') && source.endsWith('\n"'))
    source = source.slice(1, -1).trim();
  const result = Papa.parse<Record<string, string>>(source, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  if (!result.meta.fields?.some((f) => aliases.title.includes(normalize(f))))
    throw new Error(
      "Cần hàng tiêu đề có cột title hoặc Tên hoạt động. Dùng bảng mẫu bên dưới để sửa nội dung.",
    );
  if (result.data.length > 500)
    throw new Error("Mỗi lần nhập tối đa 500 dòng.");
  return result.data.map((r, i) => {
    const parsed = row(r, kind, anchor, i);
    const error = result.errors.find(
      (e) => e.row === i && e.code !== "UndetectableDelimiter",
    );
    if (error)
      parsed.source_error =
        "Số cột hoặc dấu ngoặc kép chưa khớp. Kiểm tra dòng này trong file nguồn.";
    return parsed;
  });
}
export function parseJson(
  text: string,
  kind: ImportKind,
  anchor: string,
): ImportRow[] {
  const data = JSON.parse(text);
  if (Array.isArray(data)) return data.map((r, i) => row(r, kind, anchor, i));
  if (!data || typeof data !== "object")
    throw new Error(
      "JSON cần là một bảng hoặc đối tượng goals/activities/sessions/budgets.",
    );
  const rows: ImportRow[] = [];
  for (const g of data.goals || []) {
    const r = row(
      { ...g, date: g.starts_on || g.deadline, end_date: g.deadline },
      "goal",
      anchor,
      rows.length,
    );
    r.goal = {
      tracking_mode: g.tracking_mode,
      progress: g.progress,
      color: g.color,
      category: g.category,
      metric_current: g.metric_current,
      metric_target: g.metric_target,
      metric_unit: g.metric_unit,
      metric_direction: g.metric_direction,
      checklist: g.checklist,
      milestone_kind: g.milestone_kind,
      weekly_hours: g.weekly_hours,
      timing_mode: g.timing_mode,
      reserved_hours: g.reserved_hours,
      completed_on: g.completed_on,
      semester_index: g.semester_index,
    };
    if (g.tracking_mode === "milestone") {
      r.goal.checklist = [
        { id: "completion", title: g.title, done: g.progress === 100 },
      ];
    }
    r.goal.tracking_mode = ["none", "progress"].includes(g.tracking_mode)
      ? "none"
      : g.tracking_mode === "numeric"
        ? "numeric"
        : measuredSteps(r.goal.checklist || []).length
          ? "checklist"
          : g.metric_current !== undefined && g.metric_target !== undefined
            ? "numeric"
            : "none";
    r.ref = g.id || "";
    rows.push(r);
  }
  for (const a of data.activities || []) {
    if (a.kind && a.kind !== "event") continue;
    const r = row({ ...a, kind: "activity" }, "activity", anchor, rows.length);
    r.goal_ref = a.goal_id || "";
    r.goal_id = "";
    r.activity = {
      color: a.color,
      is_milestone: a.is_milestone,
      milestone_kind: a.milestone_kind,
      started_at: a.started_at,
      ended_at: a.ended_at,
      occurred_on: a.occurred_on,
    };
    r.status = "completed";
    rows.push(r);
  }
  for (const s of data.sessions || []) {
    if (s.status && s.status !== "planned") continue;
    const start = new Date(s.scheduled_start),
      end = new Date(s.scheduled_end);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()))
      throw new Error("Phiên trong JSON có giờ không hợp lệ.");
    const local = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const a = local(start),
      b = local(end);
    const r = row(
      {
        ...s,
        kind: "session",
        date: a.slice(0, 10),
        end_date: b.slice(0, 10),
        start_time: a.slice(11),
        end_time: b.slice(11),
      },
      "session",
      anchor,
      rows.length,
    );
    r.goal_ref = s.goal_id || "";
    r.goal_id = "";
    r.status = "planned";
    if (s.is_unscheduled) {
      r.start_time = "";
      r.end_time = "";
      r.minutes = String(s.planned_minutes);
    }
    rows.push(r);
  }
  for (const t of data.timetable_entries || []) {
    const r = row(
      {
        ...t,
        kind: "timetable",
        date: t.valid_from,
        end_date: t.valid_until,
        start_time: minuteClock(t.start_minute),
        end_time: minuteClock(t.end_minute),
      },
      "timetable",
      anchor,
      rows.length,
    );
    const from = String(t.valid_from);
    r.date = addDays(monday(from), Number(t.weekday));
    if (r.date < from) r.date = addDays(r.date, 7);
    r.timetable = {
      kind: t.kind === "fixed" ? "fixed" : "class",
      semester_index: Number(t.semester_index || 0),
    };
    r.goal_ref = t.goal_id || "";
    r.all_day = Boolean(t.all_day);
    if (r.all_day) {
      r.date = t.valid_from;
      r.start_time = "";
      r.end_time = "";
    }
    rows.push(r);
  }
  for (const b of data.budgets || []) {
    const r = row(
      {
        ...b,
        kind: "budget",
        title: "Phân bổ tuần",
        minutes: b.planned_minutes,
      },
      "budget",
      anchor,
      rows.length,
    );
    r.goal_ref = b.goal_id;
    r.goal_id = "";
    rows.push(r);
  }
  if (!rows.length) throw new Error("Không có dữ liệu có thể nhập.");
  if (rows.length > 500) throw new Error("Mỗi lần nhập tối đa 500 dòng.");
  return rows;
}
export function validateImportRow(
  r: ImportRow,
  goals: Goal[],
  rows: ImportRow[],
  today: string,
) {
  if (r.server_error || r.source_error)
    return r.server_error || r.source_error || "";
  if (r.issue.startsWith("Loại “")) return r.issue;
  if (!r.title.trim() || r.title.length > 160)
    return "Tên phải có 1–160 ký tự.";
  const optionalDate = r.kind === "goal" || r.kind === "milestone";
  if (!r.date && !optionalDate)
    return "Cột date trống — nhập ngày YYYY-MM-DD hoặc thứ trong tuần.";
  if (r.date && !validDate(r.date))
    return `Ngày bắt đầu “${r.date}” không tồn tại; dùng YYYY-MM-DD.`;
  if (r.end_date && !validDate(r.end_date))
    return `Ngày kết thúc “${r.end_date}” không tồn tại; dùng YYYY-MM-DD.`;
  if (r.end_date < r.date)
    return `Ngày kết thúc ${r.end_date} sớm hơn ngày bắt đầu ${r.date}.`;
  if (r.notes.length > 4000) return "Ghi chú tối đa 4.000 ký tự.";
  if (r.goal_id && !goals.some((g) => g.id === r.goal_id))
    return "Hãy chọn mục tiêu liên kết.";
  if (
    r.goal_ref &&
    !rows.some(
      (x) =>
        x.kind === "goal" &&
        x.ref === r.goal_ref &&
        x.selected &&
        !validateImportRow(x, goals, [], today),
    ) &&
    !r.goal_id
  )
    return "Mục tiêu gốc chưa được chọn nhập hoặc còn lỗi. Sửa mục tiêu trước, hoặc đổi liên kết.";
  if (
    ["session", "activity", "milestone"].includes(r.kind) &&
    !r.goal_id &&
    !r.goal_ref
  )
    return "Gắn một mục tiêu để biết thời gian này đang giúp bạn tiến tới điều gì.";
  if (r.kind === "milestone")
    return r.goal.timing_mode &&
      !["fixed", "window", "flexible"].includes(r.goal.timing_mode)
      ? "Chọn loại thời gian hợp lệ."
      : "";
  if (r.kind === "timetable" && r.all_day)
    return (Date.parse(r.end_date) - Date.parse(r.date)) / 86400000 > 730
      ? "Lịch cả ngày tối đa 730 ngày."
      : "";
  if (
    (r.kind === "session" || r.kind === "activity") &&
    !r.start_time &&
    !r.end_time
  ) {
    if (
      !r.minutes ||
      !Number.isFinite(Number(r.minutes)) ||
      Number(r.minutes) < 1 ||
      Number(r.minutes) > 1440 ||
      (r.kind === "session" && !Number.isInteger(Number(r.minutes)))
    )
      return "Cột minutes cần 1–1440 phút, hoặc điền cả start_time và end_time; dự định dùng số phút nguyên.";
  }
  if (
    r.kind === "timetable" ||
    ((r.kind === "session" || r.kind === "activity") &&
      (r.start_time || r.end_time))
  ) {
    if (
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.start_time) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.end_time)
    )
      return "Giờ phải ở dạng HH:mm.";
    const mins =
      (new Date(`${r.end_date}T${r.end_time}`).getTime() -
        new Date(`${r.date}T${r.start_time}`).getTime()) /
      60000;
    if (r.kind === "timetable") {
      if (
        (Date.parse(r.end_date) - Date.parse(r.date)) / 86400000 > 730 ||
        !Number.isInteger(r.timetable?.semester_index ?? 0) ||
        (r.timetable?.semester_index ?? 0) < 0 ||
        (r.timetable?.semester_index ?? 0) > 11
      )
        return "TKB cần học kỳ hợp lệ và khoảng áp dụng tối đa 730 ngày.";
      if (clockMinutes(r.end_time) <= clockMinutes(r.start_time))
        return "Lịch cố định cần kết thúc sau bắt đầu trong cùng ngày.";
    } else if (mins < 1 || mins > 1440)
      return "Hoạt động cần kết thúc sau bắt đầu, trong khoảng 1 phút–24 giờ.";
    if (
      r.minutes &&
      (!Number.isFinite(Number(r.minutes)) ||
        Number(r.minutes) < 1 ||
        Number(r.minutes) > mins)
    )
      return "Số phút thực làm phải lớn hơn 0 và không vượt khung giờ.";
  }
  if (
    r.kind === "activity" &&
    (r.date > today ||
      !Number.isFinite(Number(r.minutes)) ||
      Number(r.minutes) < 0 ||
      Number(r.minutes) > 1440)
  )
    return "Hoạt động đã xong cần ngày không ở tương lai; đổi trạng thái thành Dự định nếu đây là kế hoạch.";
  if (
    r.kind === "budget" &&
    ((!r.goal_id && !r.goal_ref) ||
      monday(r.date) !== r.date ||
      !Number.isInteger(Number(r.minutes)) ||
      Number(r.minutes) < 0 ||
      Number(r.minutes) > 10080)
  )
    return "Quỹ giờ cần mục tiêu, ngày thứ Hai và 0–10080 phút.";
  if (r.kind === "goal") {
    if (
      r.goal.timing_mode &&
      !["fixed", "window", "flexible"].includes(r.goal.timing_mode)
    )
      return "Loại thời gian cột mốc không hợp lệ.";
    if (
      r.goal.reserved_hours !== undefined &&
      (!Number.isFinite(r.goal.reserved_hours) ||
        r.goal.reserved_hours < 0 ||
        r.goal.reserved_hours > 168)
    )
      return "Quỹ giờ giữ lại cần từ 0–168 giờ/tuần.";
    const g = goalPayload(r);
    if (
      (g.weekly_hours ?? 0) < 0 ||
      (g.weekly_hours ?? 0) > 168 ||
      !Number.isFinite(g.weekly_hours ?? 0)
    )
      return "Quỹ giờ mục tiêu cần từ 0–168 giờ mỗi tuần.";
    if (
      (r.goal.metric_current !== undefined) !==
      (r.goal.metric_target !== undefined)
    )
      return "Thước đo bằng số cần cả current và target; có thể xóa cả hai để đặt sau.";
    if (isGreen(g.color))
      return "Chọn màu khác xanh lá; xanh lá dành cho thương hiệu.";
    if (
      !["none", "numeric", "checklist", "milestone", "progress"].includes(
        g.tracking_mode,
      )
    )
      return "Cách theo dõi chưa hợp lệ.";
    if (!/^#[0-9a-f]{6}$/i.test(g.color)) return "Màu cần dạng #rrggbb.";
    if (!Number.isFinite(g.metric_current) || !Number.isFinite(g.metric_target))
      return "Mức hiện tại/mục tiêu phải là số.";
    if (
      g.checklist.length > 100 ||
      g.checklist.some(
        (s) =>
          !s ||
          typeof s.done !== "boolean" ||
          !s.title?.trim() ||
          s.title.length > 160 ||
          !s.id,
      )
    )
      return "Kiểm tra tên và trạng thái các bước dự án.";
    if (g.tracking_mode === "checklist" && !g.checklist.length)
      return "Thêm ít nhất một việc trong danh sách, hoặc chọn Đặt thước đo sau.";
    if (
      g.progress < 0 ||
      g.progress > 100 ||
      !Number.isInteger(g.progress) ||
      (g.tracking_mode === "milestone" &&
        g.progress !== 0 &&
        g.progress !== 100)
    )
      return "Tiến độ chưa hợp lệ.";
  }
  return "";
}
export function goalPayload(r: ImportRow): GoalInput {
  const x = r.goal;
  const g: GoalInput = {
    title: r.title.trim(),
    description: r.notes,
    category: x.category || CATEGORIES[0],
    color: x.color || GOAL_COLORS[0],
    tracking_mode: x.tracking_mode || "none",
    weekly_hours: x.weekly_hours ?? 0,
    starts_on: r.date === r.end_date ? null : r.date,
    timing_mode: x.timing_mode || (r.date === r.end_date ? "fixed" : "window"),
    reserved_hours: x.reserved_hours || 0,
    deadline: r.end_date || null,
    semester_index: x.semester_index ?? null,
    metric_current: x.metric_current ?? 0,
    metric_target: x.metric_target ?? 1,
    metric_unit: x.metric_unit || "",
    metric_direction: x.metric_direction || "increase",
    checklist: Array.isArray(x.checklist) ? x.checklist : [],
    progress: x.progress ?? 0,
    completed_on: x.completed_on || null,
    milestone_kind: x.milestone_kind || "general",
  };
  g.checklist = goalSteps(g).map((s) =>
    s.is_final
      ? {
          ...s,
          date: r.date || null,
          end_date: r.end_date || null,
          timing_mode: g.timing_mode,
        }
      : s,
  );
  g.progress = calculatedProgress(g);
  return g;
}
const goalName = (value: string) =>
  value.trim().normalize("NFC").toLocaleLowerCase("vi-VN").replace(/\s+/g, " ");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolve dependencies before preview; never turn an unknown UUID into a goal title. */
export function prepareImportRows(
  input: ImportRow[],
  goals: Goal[],
  today: string,
): ImportRow[] {
  const rows = input.map((r) => ({ ...r, goal: { ...r.goal } }));
  rows
    .filter((r) => r.kind === "goal")
    .forEach((r) => {
      r.ref ||= `import:${r.key}`;
    });
  for (const r of rows) {
    if (r.kind === "goal") {
      const matches = goals.filter(
        (g) => goalName(g.title) === goalName(r.title),
      );
      if (matches.length === 1) {
        r.selected = false;
        r.issue = "Mục tiêu đã có; các dòng liên quan dùng mục tiêu này.";
      }
      continue;
    }
    const link = (r.goal_id || r.goal_ref).trim();
    if (link) {
      const existing = goals.filter(
        (g) => g.id === link || goalName(g.title) === goalName(link),
      );
      const incoming = rows.filter(
        (g) =>
          g.kind === "goal" &&
          (g.ref === link || goalName(g.title) === goalName(link)),
      );
      if (existing.length > 1 || incoming.length > 1) {
        r.source_error = `Có nhiều mục tiêu tên “${link}”. Chọn chính xác mục tiêu liên kết.`;
      } else if (existing.length === 1) {
        r.goal_id = existing[0].id;
        r.goal_ref = "";
      } else if (incoming.length === 1) {
        const saved = goals.filter(
          (g) => goalName(g.title) === goalName(incoming[0].title),
        );
        r.goal_id = saved.length === 1 ? saved[0].id : "";
        r.goal_ref = r.goal_id ? "" : incoming[0].ref;
      } else if (!uuid.test(link) && !r.goal_ref) {
        const created = row(
          { title: link, kind: "goal" },
          "goal",
          today,
          rows.length,
        );
        created.key = `auto-${rows.length}`;
        created.ref = `import:${created.key}`;
        created.generated = true;
        created.warning =
          "Tạo từ tên liên kết; chưa đặt thước đo và chưa chốt hạn.";
        rows.push(created);
        r.goal_id = "";
        r.goal_ref = created.ref;
      } else {
        r.goal_id = "";
        r.goal_ref = link;
      }
    }
    if (r.kind === "session" || r.kind === "activity") {
      r.status ||= r.date < today ? "completed" : "planned";
      r.kind = r.status === "completed" ? "activity" : "session";
    }
  }
  // Old budget exports remain importable, but the review presents hours on their goal.
  for (const b of rows.filter((r) => r.kind === "budget")) {
    const g = rows.find((r) => r.kind === "goal" && r.ref === b.goal_ref);
    if (g) {
      g.goal.weekly_hours = Number(b.minutes) / 60;
      b.selected = false;
      b.warning = "Quỹ giờ đã chuyển vào mục tiêu.";
    }
  }
  if (rows.length > 500)
    throw new Error("Tối đa 500 dòng, tính cả mục tiêu tạo từ tên liên kết.");
  return rows.sort(
    (a, b) => Number(b.kind === "goal") - Number(a.kind === "goal"),
  );
}

export function validImportRows(
  rows: ImportRow[],
  goals: Goal[],
  today: string,
) {
  return rows.filter(
    (r) => r.selected && !validateImportRow(r, goals, rows, today),
  );
}

export function importPayload(rows: ImportRow[]) {
  return rows
    .filter((r) => r.selected)
    .map((r) => ({
      kind: r.kind,
      row_key: r.key,
      ref: r.ref,
      goal_ref: r.goal_id ? "" : r.goal_ref,
      goal_id: r.goal_id || null,
      ...(r.kind === "goal"
        ? goalPayload(r)
        : {
            title: r.title.trim(),
            notes: r.notes,
            date: r.date || null,
            ...(r.kind === "milestone"
              ? {
                  end_date: r.end_date || null,
                  timing_mode:
                    r.goal.timing_mode ||
                    (r.date !== r.end_date ? "window" : "fixed"),
                  done: r.status === "completed",
                }
              : {}),
            minutes:
              Number(r.minutes) ||
              (r.start_time && r.end_time
                ? (new Date(`${r.end_date}T${r.end_time}`).getTime() -
                    new Date(`${r.date}T${r.start_time}`).getTime()) /
                  60000
                : 0),
            ...(r.kind === "timetable"
              ? {
                  weekday: (parseDate(r.date).getDay() + 6) % 7,
                  start_minute: r.all_day ? 0 : clockMinutes(r.start_time),
                  end_minute: r.all_day ? 1440 : clockMinutes(r.end_time),
                  all_day: Boolean(r.all_day),
                  valid_from: r.date,
                  valid_until: r.end_date,
                  semester_index: r.timetable?.semester_index ?? null,
                  schedule_kind: r.timetable?.kind || "class",
                }
              : {}),
            ...(r.kind === "activity"
              ? {
                  color: r.activity?.color || "#237a4b",
                  is_milestone: r.activity?.is_milestone || false,
                  milestone_kind: r.activity?.milestone_kind || "general",
                  started_at:
                    r.activity?.occurred_on === r.date
                      ? r.activity.started_at || null
                      : r.start_time
                        ? new Date(`${r.date}T${r.start_time}`).toISOString()
                        : null,
                  ended_at:
                    r.activity?.occurred_on === r.date
                      ? r.activity.ended_at || null
                      : r.end_time
                        ? new Date(`${r.end_date}T${r.end_time}`).toISOString()
                        : null,
                }
              : {}),
            ...(r.kind === "session"
              ? {
                  scheduled_start: new Date(
                    `${r.date}T${r.start_time || "00:00"}`,
                  ).toISOString(),
                  scheduled_end: (r.end_time
                    ? new Date(`${r.end_date}T${r.end_time}`)
                    : new Date(
                        new Date(`${r.date}T00:00`).getTime() +
                          Number(r.minutes) * 60000,
                      )
                  ).toISOString(),
                  is_unscheduled: !r.start_time && !r.end_time,
                  planned_minutes: !r.start_time
                    ? Number(r.minutes)
                    : Math.round(
                        (new Date(`${r.end_date}T${r.end_time}`).getTime() -
                          new Date(`${r.date}T${r.start_time}`).getTime()) /
                          60000,
                      ),
                  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                }
              : {}),
          }),
    }));
}
export function repeatImport(
  rows: ImportRow[],
  weeks: number,
  settings: SemesterSettings[],
  skip: boolean,
) {
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52)
    throw new Error("Chọn số tuần từ 1–52.");
  const out: ImportRow[] = [];
  for (const r of rows) {
    const count = r.kind === "session" || r.kind === "budget" ? weeks : 1;
    for (let i = 0; i < count; i++) {
      const date = validDate(r.date) ? addDays(r.date, i * 7) : r.date,
        end_date = validDate(r.end_date)
          ? addDays(
              r.end_date,
              r.kind === "timetable" &&
                !r.explicit_end &&
                !r.all_day &&
                r.end_date === r.date
                ? weeks * 7 - 1
                : i * 7,
            )
          : r.end_date;
      if (
        skip &&
        r.kind === "session" &&
        settings.some((s) =>
          s.breaks.some((b) => date <= b.end && end_date >= b.start),
        )
      )
        continue;
      out.push({ ...r, key: `${r.key}-${i}`, date, end_date });
    }
  }
  if (out.length > 500)
    throw new Error("Sau khi lặp có hơn 500 dòng. Hãy giảm số tuần.");
  return out;
}

export async function parseCalendar(
  text: string,
  anchor: string,
  weeks: number,
): Promise<ImportRow[]> {
  if (!validDate(anchor) || !Number.isInteger(weeks) || weeks < 1 || weeks > 52)
    throw new Error("Chọn ngày bắt đầu và khoảng 1–52 tuần.");
  const { default: ICAL } = await import("ical.js");
  ICAL.TimezoneService.reset();
  const root = new ICAL.Component(ICAL.parse(text));
  root.getAllSubcomponents("vtimezone").forEach((c) => {
    const id = c.getFirstPropertyValue("tzid");
    if (typeof id === "string")
      ICAL.TimezoneService.register(new ICAL.Timezone(c), id);
  });
  const out: ImportRow[] = [];
  const from = new Date(`${anchor}T00:00:00`),
    until = new Date(`${addDays(anchor, weeks * 7)}T00:00:00`);
  for (const c of root.getAllSubcomponents("vevent")) {
    if (c.getFirstPropertyValue("status") === "CANCELLED") continue;
    for (const field of [
      "dtstart",
      "dtend",
      "recurrence-id",
      "exdate",
      "rdate",
    ]) {
      for (const property of c.getAllProperties(field)) {
        const zone = property.getParameter("tzid");
        if (typeof zone === "string" && !ICAL.TimezoneService.has(zone))
          throw new Error(
            `Lịch thiếu định nghĩa múi giờ ${zone}. Hãy xuất lịch kèm VTIMEZONE hoặc dùng giờ UTC.`,
          );
      }
    }
    const event = new ICAL.Event(c);
    if (event.isRecurrenceException()) continue;
    const exceptions = root
      .getAllSubcomponents("vevent")
      .filter(
        (x) =>
          x.getFirstPropertyValue("uid") === event.uid &&
          x.hasProperty("recurrence-id"),
      );
    exceptions.forEach((x) => event.relateException(new ICAL.Event(x)));
    const iterator = event.iterator();
    let date;
    let count = 0;
    while ((date = iterator.next()) && count++ < 50000) {
      const detail = event.getOccurrenceDetails(date);
      if (detail.item.component.getFirstPropertyValue("status") === "CANCELLED")
        continue;
      const a = detail.startDate.toJSDate(),
        b = detail.endDate.toJSDate();
      if (a >= until) break;
      if (a < from) continue;
      const local = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      const sa = local(a),
        sb = local(b);
      out.push(
        row(
          {
            title: detail.item.summary || "Sự kiện lịch",
            date: sa.slice(0, 10),
            end_date: date.isDate
              ? addDays(sb.slice(0, 10), -1)
              : sb.slice(0, 10),
            start_time: date.isDate ? "" : sa.slice(11),
            end_time: date.isDate ? "" : sb.slice(11),
            notes: detail.item.description || "",
          },
          date.isDate ? "timetable" : "session",
          anchor,
          out.length,
        ),
      );
      if (out.length > 500)
        throw new Error(
          "Lịch có hơn 500 sự kiện trong khoảng này; hãy giảm số tuần.",
        );
      if (!event.isRecurring()) break;
    }
    if (count >= 50000)
      throw new Error(
        "Quy tắc lặp quá dài. Hãy xuất một khoảng lịch ngắn hơn.",
      );
  }
  return out;
}
