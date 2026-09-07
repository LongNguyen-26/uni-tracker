import Papa from "papaparse";
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

export type ImportKind = "goal" | "session" | "activity" | "budget";
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
  selected: boolean;
  issue: string;
};
export const labels: Record<ImportKind, string> = {
  goal: "Mục tiêu",
  session: "Phiên học",
  activity: "Nhật ký",
  budget: "Quỹ giờ tuần",
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
  const requested = String(v.kind || kind);
  const kinds: Record<string, ImportKind> = {
    goal: "goal",
    muctieu: "goal",
    session: "session",
    phienhoc: "session",
    activity: "activity",
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
  if (!date && kind === "goal") date = importDate(v.end_date);
  const goal: Partial<GoalInput> = {};
  if (v.mode) goal.tracking_mode = String(v.mode) as Goal["tracking_mode"];
  if (v.current !== undefined) goal.metric_current = Number(v.current);
  if (v.target !== undefined) goal.metric_target = Number(v.target);
  if (v.unit) goal.metric_unit = String(v.unit);
  if (v.color) goal.color = String(v.color);
  return {
    key: `row-${index}`,
    kind,
    title: String(v.title ?? "").trim(),
    date,
    end_date: importDate(v.end_date) || date,
    start_time: time(v.start_time),
    end_time: time(v.end_time),
    minutes: String(
      v.minutes ?? (v.hours !== undefined ? Number(v.hours) * 60 : ""),
    ),
    goal_id: String(v.goal_id ?? ""),
    ref: String(input.id || ""),
    goal_ref: "",
    notes: String(v.notes ?? ""),
    goal,
    selected: true,
    issue: kinds[normalize(requested)]
      ? ""
      : `Loại “${requested}” chưa được hỗ trợ.`,
  };
}
export function parseTable(
  text: string,
  kind: ImportKind,
  anchor: string,
): ImportRow[] {
  const result = Papa.parse<Record<string, string>>(
    text.trim().replace(/^\uFEFF/, ""),
    {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
    },
  );
  if (result.errors.some((e) => e.code !== "UndetectableDelimiter"))
    throw new Error(`Bảng chưa đúng định dạng: ${result.errors[0].message}`);
  if (!result.meta.fields?.some((f) => aliases.title.includes(normalize(f))))
    throw new Error(
      "Cần hàng tiêu đề có cột title hoặc Tên hoạt động. Dùng bảng mẫu bên dưới để sửa nội dung.",
    );
  if (result.data.length > 500)
    throw new Error("Mỗi lần nhập tối đa 500 dòng.");
  return result.data.map((r, i) => row(r, kind, anchor, i));
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
      completed_on: g.completed_on,
      semester_index: g.semester_index,
    };
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
  if (r.issue.startsWith("Loại “")) return r.issue;
  if (!r.title.trim() || r.title.length > 160)
    return "Tên phải có 1–160 ký tự.";
  if (!validDate(r.date) || !validDate(r.end_date) || r.end_date < r.date)
    return "Kiểm tra ngày bắt đầu/kết thúc (năm-tháng-ngày).";
  if (r.goal_id && !goals.some((g) => g.id === r.goal_id))
    return "Hãy chọn mục tiêu liên kết.";
  if (
    r.goal_ref &&
    !rows.some(
      (x) => x.kind === "goal" && x.ref === r.goal_ref && x.selected,
    ) &&
    !r.goal_id
  )
    return "Mục tiêu gốc chưa được chọn nhập. Hãy chọn lại liên kết.";
  if (r.kind === "session") {
    if (
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.start_time) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.end_time)
    )
      return "Giờ phải ở dạng HH:mm.";
    const mins =
      (new Date(`${r.end_date}T${r.end_time}`).getTime() -
        new Date(`${r.date}T${r.start_time}`).getTime()) /
      60000;
    if (mins < 1 || mins > 1440) return "Phiên cần từ 1 phút đến 24 giờ.";
  }
  if (
    r.kind === "activity" &&
    (r.date > today ||
      !Number.isFinite(Number(r.minutes)) ||
      Number(r.minutes) < 0 ||
      Number(r.minutes) > 1440)
  )
    return "Nhật ký không ở tương lai, thời lượng 0–1440 phút.";
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
    const g = goalPayload(r);
    if (
      !["numeric", "checklist", "milestone", "progress"].includes(
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
      return "Dự án cần ít nhất một cột mốc; bổ sung trong JSON nguồn.";
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
    tracking_mode: x.tracking_mode || "milestone",
    starts_on: r.date === r.end_date ? null : r.date,
    deadline: r.end_date,
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
  g.progress = calculatedProgress(g);
  return g;
}
export function importPayload(rows: ImportRow[]) {
  return rows
    .filter((r) => r.selected)
    .map((r) => ({
      kind: r.kind,
      ref: r.ref,
      goal_ref: r.goal_id ? "" : r.goal_ref,
      goal_id: r.goal_id || null,
      ...(r.kind === "goal"
        ? goalPayload(r)
        : {
            title: r.title.trim(),
            notes: r.notes,
            date: r.date,
            minutes: Number(r.minutes) || 0,
            ...(r.kind === "activity"
              ? {
                  color: r.activity?.color || "#237a4b",
                  is_milestone: r.activity?.is_milestone || false,
                  milestone_kind: r.activity?.milestone_kind || "general",
                  started_at:
                    r.activity?.occurred_on === r.date
                      ? r.activity.started_at || null
                      : null,
                  ended_at:
                    r.activity?.occurred_on === r.date
                      ? r.activity.ended_at || null
                      : null,
                }
              : {}),
            ...(r.kind === "session"
              ? {
                  scheduled_start: new Date(
                    `${r.date}T${r.start_time}`,
                  ).toISOString(),
                  scheduled_end: new Date(
                    `${r.end_date}T${r.end_time}`,
                  ).toISOString(),
                  planned_minutes: Math.round(
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
          ? addDays(r.end_date, i * 7)
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
            start_time: sa.slice(11),
            end_time: sb.slice(11),
            notes: detail.item.description || "",
          },
          date.isDate ? "goal" : "session",
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
