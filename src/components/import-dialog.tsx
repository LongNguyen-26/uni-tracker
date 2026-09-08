"use client";
import { useRef, useState } from "react";
import Dialog from "./dialog";
import DatePicker from "./date-picker";
import { getSupabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/errors";
import {
  todayKey,
  parseDate,
  type Activity,
  type Goal,
  type Profile,
} from "@/lib/timeline";
import {
  importPayload,
  prepareImportRows,
  validImportRows,
} from "@/lib/importer";
import {
  parseCalendar,
  parseJson,
  parseTable,
  repeatImport,
  validateImportRow,
  type ImportRow,
  type ImportKind,
} from "@/lib/importer";
import { monday, localDateTime } from "@/lib/planning";
import {
  journeySemesters,
  clockMinutes,
  type TimetableEntry,
} from "@/lib/schedule";
import ImportHelp from "./import-help";
import { importTemplate } from "@/lib/import-guide";
import { ImportReviewRow, importChoices } from "./import-review";
import type { FileText } from "@/lib/import-files";

const timetableSample =
  "Tên môn học,Thứ,Giờ bắt đầu,Giờ kết thúc,Loại\nCấu trúc dữ liệu,T2,08:00,10:00,class\nThể thao,T4,17:00,18:00,fixed";
export default function ImportDialog({
  initialKind = "session",
  goals,
  activities,
  profile,
  onClose,
  onImported,
}: {
  initialKind?: "session" | "timetable";
  goals: Goal[];
  activities: Activity[];
  profile: Profile;
  onClose: () => void;
  onImported: () => Promise<void>;
}) {
  const initialTerm =
    journeySemesters(profile).find(
      (t) => t.start <= todayKey() && t.end >= todayKey(),
    ) || journeySemesters(profile)[0];
  const [text, setText] = useState(""),
    [format, setFormat] = useState<FileText["format"]>("table"),
    [kind, setKind] = useState<ImportKind>(initialKind),
    [anchor, setAnchor] = useState(
      initialKind === "timetable" ? initialTerm.start : monday(todayKey()),
    ),
    [weeks, setWeeks] = useState(
      initialKind === "timetable"
        ? Math.ceil(
            (Date.parse(initialTerm.end) -
              Date.parse(initialTerm.start) +
              86400000) /
              604800000,
          )
        : 1,
    ),
    [term, setTerm] = useState(
      () =>
        journeySemesters(profile).find(
          (t) => t.start <= todayKey() && t.end >= todayKey(),
        )?.index || 0,
    ),
    [rows, setRows] = useState<ImportRow[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [review, setReview] = useState(false),
    [checked, setChecked] = useState(false),
    [sheets, setSheets] = useState<FileText["sheets"]>([]),
    [batch, setBatch] = useState("");
  const formRef = useRef<HTMLFieldSetElement>(null);
  const sample = importTemplate(todayKey(), initialTerm.end);
  const scrollTop = () =>
    requestAnimationFrame(() =>
      formRef.current?.closest('[role="dialog"]')?.scrollTo({ top: 0 }),
    );
  const issues = rows.map((r) => validateImportRow(r, goals, rows, todayKey()));
  const selected = rows.filter((r) => r.selected);
  const valid = validImportRows(rows, goals, todayKey());
  const invalid = rows.filter((r, i) => r.selected && issues[i]);
  const [result, setResult] = useState("");
  const [opened, setOpened] = useState<string[]>([]);
  const groups = [
    {
      key: "goal",
      title: "Mục tiêu",
      items: rows.filter((r) => r.kind === "goal" || r.kind === "budget"),
    },
    {
      key: "timetable",
      title: "TKB & việc cố định",
      items: rows.filter((r) => r.kind === "timetable"),
    },
    {
      key: "session",
      title: "Hoạt động · dự định",
      items: rows.filter((r) => r.kind === "session"),
    },
    {
      key: "activity",
      title: "Hoạt động · đã xong",
      items: rows.filter((r) => r.kind === "activity"),
    },
  ].filter((g) => g.items.length);
  function jump(row: ImportRow) {
    setOpened((prev) => [
      ...new Set([...prev, row.kind === "budget" ? "goal" : row.kind]),
    ]);
    window.setTimeout(() => {
      const element = document.getElementById("import-" + row.key);
      element?.scrollIntoView({ block: "center", behavior: "smooth" });
      element?.focus();
    }, 50);
  }
  async function parse() {
    setBusy(true);
    setError("");
    setChecked(false);
    try {
      if (text.length > 10 * 1024 * 1024)
        throw new Error("Nội dung tối đa 10 MB.");
      const base =
        format === "json"
          ? parseJson(text, kind, anchor)
          : format === "ics"
            ? await parseCalendar(text, anchor, weeks)
            : parseTable(text, kind, anchor);
      if (format === "ics" && kind === "timetable")
        base.forEach((r) => {
          if (r.kind === "session") {
            r.kind = "timetable";
            r.timetable = { kind: "class", semester_index: term };
          }
        });
      const repeated = repeatImport(
        prepareImportRows(base, goals, todayKey()),
        format === "ics" ? 1 : weeks,
        [],
        false,
      );
      repeated.forEach((r) => {
        if (r.kind === "timetable") {
          r.timetable = {
            kind: r.timetable?.kind || "class",
            semester_index:
              format === "json" ? (r.timetable?.semester_index ?? term) : term,
          };
        }
      });
      const seen = new Set<string>();
      const existingSessions: {
        title: string;
        scheduled_start: string;
        scheduled_end: string;
        is_unscheduled: boolean;
        planned_minutes: number;
        goal_id: string | null;
      }[] = [];
      if (repeated.some((r) => r.kind === "session")) {
        for (let from = 0; ; from += 1000) {
          const q = await getSupabase()!
            .from("focus_sessions")
            .select(
              "title,scheduled_start,scheduled_end,id,is_unscheduled,planned_minutes,goal_id",
            )
            .eq("user_id", profile.id)
            .order("id")
            .range(from, from + 999);
          if (q.error) throw q.error;
          existingSessions.push(...q.data);
          if (q.data.length < 1000) break;
        }
      }
      const existingTimetable: TimetableEntry[] = [];
      if (repeated.some((r) => r.kind === "timetable")) {
        for (let from = 0; ; from += 1000) {
          const q = await getSupabase()!
            .from("timetable_entries")
            .select("*")
            .eq("user_id", profile.id)
            .order("id")
            .range(from, from + 999);
          if (q.error) throw q.error;
          existingTimetable.push(...q.data);
          if (q.data.length < 1000) break;
        }
      }
      const prepared = repeated.map((r) => {
        const match = goals.find(
          (g) =>
            g.id === r.goal_id ||
            g.title.toLocaleLowerCase() === r.goal_id.toLocaleLowerCase(),
        );
        if (match) r.goal_id = match.id;
        const signature = JSON.stringify([
          r.kind,
          r.title,
          r.date,
          r.end_date,
          r.start_time,
          r.end_time,
          r.goal_id,
          r.goal_ref,
          r.minutes,
          r.all_day,
        ]);
        const duplicate =
          seen.has(signature) ||
          (r.kind === "timetable" &&
            existingTimetable.some(
              (t) =>
                t.title === r.title &&
                (t.goal_id || "") === r.goal_id &&
                Boolean(t.all_day) === Boolean(r.all_day) &&
                (r.all_day ||
                  t.weekday === (parseDate(r.date).getDay() + 6) % 7) &&
                t.start_minute ===
                  (r.all_day ? 0 : clockMinutes(r.start_time)) &&
                t.end_minute ===
                  (r.all_day ? 1440 : clockMinutes(r.end_time)) &&
                t.valid_from <= r.date &&
                t.valid_until >= r.end_date,
            )) ||
          (r.kind === "session" &&
            existingSessions.some(
              (s) =>
                s.title === r.title &&
                (s.goal_id || "") === r.goal_id &&
                (s.is_unscheduled
                  ? !r.start_time &&
                    !r.end_time &&
                    localDateTime(s.scheduled_start).slice(0, 10) === r.date &&
                    s.planned_minutes === Number(r.minutes)
                  : Boolean(r.start_time) &&
                    Date.parse(s.scheduled_start) ===
                      Date.parse(`${r.date}T${r.start_time}`) &&
                    Date.parse(s.scheduled_end) ===
                      Date.parse(`${r.end_date}T${r.end_time}`)),
            )) ||
          (r.kind === "goal" &&
            goals.some(
              (g) => g.title === r.title && g.deadline === r.end_date,
            )) ||
          (r.kind === "activity" &&
            activities.some(
              (a) =>
                a.title === r.title &&
                (a.goal_id || "") === r.goal_id &&
                a.occurred_on === r.date &&
                Number(a.duration_minutes) ===
                  (Number(r.minutes) ||
                    (Date.parse(`${r.end_date}T${r.end_time}`) -
                      Date.parse(`${r.date}T${r.start_time}`)) /
                      60000),
            ));
        seen.add(signature);
        return {
          ...r,
          selected: r.selected && !duplicate,
          issue: duplicate
            ? "Có thể trùng dữ liệu; mặc định bỏ chọn."
            : r.issue,
        };
      });
      if (!prepared.length)
        throw new Error("Không tìm thấy dòng nào trong khoảng đã chọn.");
      setRows(prepared);
      setBatch(crypto.randomUUID());
      scrollTop();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const patch = (index: number, data: Partial<ImportRow>) => {
    setRows(
      rows.map((r, i) =>
        i === index
          ? {
              ...r,
              ...data,
              server_error: undefined,
              ...(data.kind ? { issue: "" } : {}),
            }
          : r,
      ),
    );
    setChecked(false);
  };
  async function commit() {
    if (!checked || !valid.length) return;
    setBusy(true);
    setError("");
    try {
      const r = await getSupabase()!.rpc("import_tracker_reviewed", {
        p_batch_id: batch,
        p_items: importPayload(valid),
      });
      if (r.error) throw r.error;
      const accepted = new Set<string>(r.data.accepted || []);
      const failures = r.data.errors as { key: string; message: string }[];
      const skipped = invalid.length + failures.length;
      const message =
        (r.data?.already_imported ? "Lần nhập này đã được lưu: " : "Đã nhập ") +
        r.data.count +
        " dòng" +
        (skipped ? ", bỏ qua " + skipped + " dòng cần sửa." : ".");
      setResult(message);
      const kept = rows
        .filter((row) => !accepted.has(row.key))
        .map((row) => ({
          ...row,
          goal_id: row.goal_id || r.data.goal_map?.[row.goal_ref] || "",
          goal_ref: r.data.goal_map?.[row.goal_ref] ? "" : row.goal_ref,
          server_error: failures.find((f) => f.key === row.key)?.message,
        }));
      const next = skipped ? kept : [];
      setRows(next);
      setChecked(false);
      setBatch(crypto.randomUUID());
      await onImported();
      scrollTop();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title="Nhập lịch & kế hoạch"
      description="1. Đọc dữ liệu → 2. Đối chiếu → 3. Xác nhận nhập"
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <fieldset ref={formRef} disabled={busy} className="form import-form">
        {result && (
          <div className="form-success" role="status">
            {result}
            {rows.length > 0 ? (
              <button className="text-button" onClick={() => jump(rows[0])}>
                Xem lại dòng chưa nhập
              </button>
            ) : (
              <button className="button primary" onClick={onClose}>
                Vào Tuần & phiên học
              </button>
            )}
          </div>
        )}
        {!rows.length && !result ? (
          <>
            <ImportHelp day={todayKey()} termEnd={initialTerm.end} />
            <label>
              Chọn file
              <input
                type="file"
                accept=".csv,.tsv,.txt,.xlsx,.xls,.json,.ics,.docx,.pdf,image/png,image/jpeg,image/webp"
                disabled={busy}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setBusy(true);
                  setError("");
                  try {
                    const { extractFile } = await import("@/lib/import-files");
                    const r = await extractFile(file, setProgress);
                    setText(r.text);
                    setFormat(r.format);
                    setReview(r.review);
                    setSheets(r.sheets || []);
                  } catch (e) {
                    setError(errorMessage(e));
                  } finally {
                    setBusy(false);
                    setProgress("");
                  }
                }}
              />
            </label>
            {!!sheets?.length && (
              <label>
                Trang tính
                <select
                  onChange={(e) => setText(sheets[Number(e.target.value)].text)}
                >
                  {sheets.map((s, i) => (
                    <option value={i} key={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="muted small">
              File được đọc trên thiết bị. Excel/CSV cần hàng tiêu đề; có thể
              dán bảng từ Docs hoặc nhập file DOCX. Lịch Calendar dùng file
              .ics. Tối đa 10 MB, 500 dòng; PDF tối đa 10 trang.
            </p>
            {review && (
              <p className="import-warning">
                Nội dung từ Docs/ảnh/PDF cần đối chiếu. Nhận diện chữ có thể sai
                ngày, giờ hoặc mất cột. Sửa thành bảng có tiêu đề và các cột
                ngăn bằng tab/dấu phẩy trước khi xem trước.
              </p>
            )}
            <div className="form-row">
              <label>
                Định dạng
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as typeof format)}
                >
                  <option value="table">Bảng CSV / tab</option>
                  <option value="json">JSON</option>
                  <option value="ics">Lịch ICS</option>
                </select>
              </label>
              <label>
                Loại mặc định
                <select
                  value={kind}
                  onChange={(e) => {
                    const value = e.target.value as ImportKind;
                    setKind(value);
                    if (value === "timetable") {
                      const t = journeySemesters(profile)[term];
                      setAnchor(t.start);
                      setWeeks(
                        Math.ceil(
                          (Date.parse(t.end) - Date.parse(t.start) + 86400000) /
                            604800000,
                        ),
                      );
                    }
                  }}
                >
                  {Object.entries(importChoices).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {kind === "timetable" && (
              <label>
                TKB của học kỳ
                <select
                  value={term}
                  onChange={(e) => {
                    const n = Number(e.target.value),
                      t = journeySemesters(profile)[n];
                    setTerm(n);
                    setAnchor(t.start);
                    setWeeks(
                      Math.ceil(
                        (Date.parse(t.end) - Date.parse(t.start) + 86400000) /
                          604800000,
                      ),
                    );
                  }}
                >
                  {journeySemesters(profile).map((t) => (
                    <option key={t.index} value={t.index}>
                      Năm {t.year} · {t.label}
                    </option>
                  ))}
                </select>
                <small>
                  Lớp học không tính giờ thực làm. Chọn số tuần áp dụng hoặc sửa
                  ngày cuối ở bản xem trước.
                </small>
              </label>
            )}
            <label>
              Bảng hoặc nội dung cần nhập
              <textarea
                className="import-source"
                rows={9}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={sample}
              />
            </label>
            <div className="section-row">
              <button
                className="text-button"
                onClick={() => {
                  setText(kind === "timetable" ? timetableSample : sample);
                  setFormat("table");
                  setReview(false);
                }}
              >
                Điền bảng mẫu
              </button>
              <a href="/templates/timetable.csv" download>
                Tải mẫu TKB
              </a>
            </div>
            <details className="import-help">
              <summary>Các cột được hỗ trợ</summary>
              <p>
                Tên hoạt động (title), ngày (date), ngày kết thúc (end_date),
                giờ bắt đầu (start_time), giờ kết thúc (end_time), mục tiêu
                (goal_id: tên hoặc ID), phút (minutes), ghi chú (notes), loại
                (kind: goal/class/fixed/activity). Ngày dùng YYYY-MM-DD hoặc
                DD/MM/YYYY, giờ dùng HH:mm. Có thể dùng cột Thứ thay ngày để áp
                dụng tuần đầu bên dưới.
              </p>
              <p>
                Mục tiêu có current, target, unit để đo bằng số hoặc steps để
                liệt kê việc, weekly_hours là quỹ giờ mỗi tuần. Có thể đặt thước
                đo sau. status của hoạt động là planned (dự định) hoặc completed
                (đã xong); bỏ trống để suy ra theo ngày.
              </p>
            </details>
            <div className="form-row">
              <DatePicker
                label={
                  format === "ics"
                    ? "Đọc lịch từ ngày"
                    : "Tuần đầu (bảng chỉ có thứ)"
                }
                value={anchor}
                onChange={setAnchor}
              />
              <label>
                {format === "ics"
                  ? "Đọc trong bao nhiêu tuần?"
                  : "Lặp hoạt động / TKB chưa có ngày kết thúc trong bao nhiêu tuần?"}
                <input
                  type="number"
                  required
                  min={1}
                  max={52}
                  value={weeks}
                  onChange={(e) => setWeeks(Number(e.target.value))}
                />
              </label>
            </div>
            <p className="muted small">
              Mục tiêu và hoạt động đã xong không lặp. Ngày kết thúc có sẵn
              trong file luôn được giữ nguyên. ICS được mở rộng theo quy tắc lặp
              của lịch trong khoảng đã chọn.
            </p>
            <button
              className="button primary"
              disabled={busy || !text.trim()}
              onClick={() => void parse()}
            >
              {busy ? progress || "Đang đọc…" : "Phân tích & xem trước"}
            </button>
          </>
        ) : rows.length ? (
          <>
            <div className="section-row">
              <strong>
                {rows.length} dòng · {selected.length} dòng đang chọn
              </strong>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setRows([]);
                  setResult("");
                  setChecked(false);
                }}
              >
                Quay lại nguồn
              </button>
            </div>
            <p className="muted small">
              Mục tiêu được tạo trước rồi gắn vào lịch và hoạt động theo tên.
              Chỉ các dòng hợp lệ, đang chọn sẽ được nhập.
            </p>
            {invalid.length > 0 && (
              <div className="import-warning" role="alert">
                <strong>
                  {invalid.length} dòng cần xem lại · {valid.length} dòng sẵn
                  sàng nhập
                </strong>
                <ul>
                  {invalid.map((r) => (
                    <li key={r.key}>
                      <button className="text-button" onClick={() => jump(r)}>
                        {r.title || "Chưa có tên"}: {issues[rows.indexOf(r)]}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="import-groups">
              {groups.map((group) => {
                const created = group.items.filter(
                  (r) => r.kind === "goal" && r.selected,
                ).length;
                const linked = new Set(
                  group.items
                    .map((r) => r.goal_id || r.goal_ref)
                    .filter(Boolean),
                ).size;
                const errors = group.items.filter(
                  (r) => r.selected && issues[rows.indexOf(r)],
                ).length;
                return (
                  <details
                    key={group.key}
                    open={opened.includes(group.key)}
                    className="import-group"
                    onToggle={(e) => {
                      const open = e.currentTarget.open;
                      setOpened((prev) =>
                        open
                          ? [...new Set([...prev, group.key])]
                          : prev.filter((k) => k !== group.key),
                      );
                    }}
                  >
                    <summary>
                      <strong>{group.title}</strong>
                      <span>
                        {group.items.length} dòng ·{" "}
                        {group.key === "goal"
                          ? created + " tạo mới"
                          : "gắn vào " + linked + " mục tiêu"}
                        {errors ? " · " + errors + " cần sửa" : ""}
                      </span>
                    </summary>
                    <div className="import-table-scroll">
                      <table className="import-table">
                        <thead>
                          <tr>
                            <th>Nhập</th>
                            <th>Loại / tên</th>
                            <th>Ngày</th>
                            <th>Thời gian</th>
                            <th>Gắn mục tiêu</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.items.map((r) => (
                            <ImportReviewRow
                              key={r.key}
                              row={r}
                              index={rows.indexOf(r)}
                              issue={issues[rows.indexOf(r)]}
                              rows={rows}
                              goals={goals}
                              patch={patch}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                );
              })}
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={checked}
                disabled={busy}
                onChange={(e) => setChecked(e.target.checked)}
              />
              Tôi đã đối chiếu ngày, giờ, loại dữ liệu và xác nhận nhập{" "}
              {valid.length} dòng hợp lệ
              {invalid.length
                ? `; bỏ qua ${invalid.length} dòng lỗi để sửa sau`
                : ""}
              .
            </label>
            <button
              className="button primary"
              disabled={busy || !checked || !valid.length}
              onClick={() => void commit()}
            >
              {busy ? "Đang nhập…" : `Nhập ${valid.length} dòng hợp lệ`}
            </button>
            <p className="muted small">
              Dữ liệu được lưu cùng lúc. Gửi lại cùng một lần nhập không tạo bản
              sao.
            </p>
          </>
        ) : null}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </fieldset>
    </Dialog>
  );
}
