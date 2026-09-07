"use client";
import { useState } from "react";
import Dialog from "./dialog";
import DatePicker from "./date-picker";
import { getSupabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/errors";
import {
  todayKey,
  type Activity,
  type Goal,
  type Profile,
} from "@/lib/timeline";
import { importPayload, labels } from "@/lib/importer";
import {
  parseCalendar,
  parseJson,
  parseTable,
  repeatImport,
  validateImportRow,
  type ImportRow,
  type ImportKind,
} from "@/lib/importer";
import { monday } from "@/lib/planning";
import type { FileText } from "@/lib/import-files";

const sample =
  "title,date,end_date,start_time,end_time,goal_id,minutes\nLuyện IELTS,2026-09-07,2026-09-07,19:00,20:00,,60\nViết Paper,2026-09-08,2026-09-08,14:00,16:00,,120";
export default function ImportDialog({
  goals,
  activities,
  profile,
  onClose,
  onImported,
}: {
  goals: Goal[];
  activities: Activity[];
  profile: Profile;
  onClose: () => void;
  onImported: () => Promise<void>;
}) {
  const [text, setText] = useState(""),
    [format, setFormat] = useState<FileText["format"]>("table"),
    [kind, setKind] = useState<ImportKind>("session"),
    [anchor, setAnchor] = useState(monday(todayKey())),
    [weeks, setWeeks] = useState(1),
    [skip, setSkip] = useState(true),
    [rows, setRows] = useState<ImportRow[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [review, setReview] = useState(false),
    [checked, setChecked] = useState(false),
    [sheets, setSheets] = useState<FileText["sheets"]>([]),
    [batch, setBatch] = useState("");
  const issues = rows.map((r) => validateImportRow(r, goals, rows, todayKey()));
  const selected = rows.filter((r) => r.selected);
  const invalid = rows.some((r, i) => r.selected && issues[i]);
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
      const repeated = repeatImport(
        base,
        format === "ics" ? 1 : weeks,
        profile.semester_settings,
        skip,
      );
      const seen = new Set<string>();
      const existingSessions: {
        title: string;
        scheduled_start: string;
        scheduled_end: string;
      }[] = [];
      if (repeated.some((r) => r.kind === "session")) {
        for (let from = 0; ; from += 1000) {
          const q = await getSupabase()!
            .from("focus_sessions")
            .select("title,scheduled_start,scheduled_end,id")
            .eq("user_id", profile.id)
            .order("id")
            .range(from, from + 999);
          if (q.error) throw q.error;
          existingSessions.push(...q.data);
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
        ]);
        const duplicate =
          seen.has(signature) ||
          (r.kind === "session" &&
            existingSessions.some(
              (s) =>
                s.title === r.title &&
                Date.parse(s.scheduled_start) ===
                  Date.parse(`${r.date}T${r.start_time}`) &&
                Date.parse(s.scheduled_end) ===
                  Date.parse(`${r.end_date}T${r.end_time}`),
            )) ||
          (r.kind === "goal" &&
            goals.some(
              (g) => g.title === r.title && g.deadline === r.end_date,
            )) ||
          (r.kind === "activity" &&
            activities.some(
              (a) =>
                a.title === r.title &&
                a.occurred_on === r.date &&
                Number(a.duration_minutes) === Number(r.minutes),
            ));
        seen.add(signature);
        return {
          ...r,
          selected: !duplicate,
          issue: duplicate
            ? "Có thể trùng dữ liệu; mặc định bỏ chọn."
            : r.issue,
        };
      });
      if (!prepared.length)
        throw new Error("Không tìm thấy dòng nào trong khoảng đã chọn.");
      setRows(prepared);
      setBatch(crypto.randomUUID());
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
          ? { ...r, ...data, ...(data.kind ? { issue: "" } : {}) }
          : r,
      ),
    );
    setChecked(false);
  };
  async function commit() {
    if (!checked || invalid || !selected.length) return;
    setBusy(true);
    setError("");
    try {
      const r = await getSupabase()!.rpc("import_tracker", {
        p_batch_id: batch,
        p_items: importPayload(rows),
      });
      if (r.error) throw r.error;
      await onImported();
      onClose();
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
      <div className="form import-form">
        {!rows.length ? (
          <>
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
                  onChange={(e) => setKind(e.target.value as ImportKind)}
                >
                  {Object.entries(labels).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>
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
                  setText(sample);
                  setFormat("table");
                  setReview(false);
                }}
              >
                Điền bảng mẫu
              </button>
              <a href="/templates/schedule.csv" download>
                Tải CSV mẫu
              </a>
              <a href="/templates/goals.json" download>
                Tải JSON mẫu
              </a>
            </div>
            <details className="import-help">
              <summary>Các cột được hỗ trợ</summary>
              <p>
                Tên hoạt động (title), ngày (date), ngày kết thúc (end_date),
                giờ bắt đầu (start_time), giờ kết thúc (end_time), mục tiêu
                (goal_id: tên hoặc ID), phút (minutes), ghi chú (notes), loại
                (kind: goal/session/activity/budget). Ngày dùng YYYY-MM-DD hoặc
                DD/MM/YYYY, giờ dùng HH:mm. Có thể dùng cột Thứ thay ngày để áp
                dụng tuần đầu bên dưới.
              </p>
              <p>
                Mục tiêu hỗ trợ thêm tracking_mode
                (numeric/checklist/progress/milestone), current, target, unit,
                color. Dự án với các bước dùng mẫu JSON. Phiên là kế hoạch; nhật
                ký là việc đã làm.
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
                  : "Lặp phiên / quỹ giờ trong bao nhiêu tuần?"}
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
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={skip}
                onChange={(e) => setSkip(e.target.checked)}
              />
              Bỏ phiên rơi vào kỳ nghỉ đã cài đặt
            </label>
            <p className="muted small">
              Mục tiêu và nhật ký không lặp. ICS được mở rộng theo quy tắc lặp
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
        ) : (
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
                  setChecked(false);
                }}
              >
                Quay lại nguồn
              </button>
            </div>
            <p className="muted small">
              Chỉnh trực tiếp tên, ngày, giờ và mục tiêu. Dòng lỗi cần sửa hoặc
              bỏ chọn. Mục tiêu nhập mới có thể chỉnh thước đo đầy đủ sau khi
              lưu.
            </p>
            <div className="import-table-scroll">
              <table className="import-table">
                <thead>
                  <tr>
                    <th>Nhập</th>
                    <th>Loại / tên</th>
                    <th>Ngày → ngày</th>
                    <th>Giờ / phút</th>
                    <th>Gắn mục tiêu</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.key} className={issues[i] ? "invalid" : ""}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Nhập dòng ${i + 1}`}
                          checked={r.selected}
                          onChange={(e) =>
                            patch(i, { selected: e.target.checked })
                          }
                        />
                      </td>
                      <td>
                        <select
                          aria-label={`Loại dòng ${i + 1}`}
                          value={r.kind}
                          onChange={(e) =>
                            patch(i, { kind: e.target.value as ImportKind })
                          }
                        >
                          {Object.entries(labels).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                        <input
                          aria-label={`Tên dòng ${i + 1}`}
                          value={r.title}
                          onChange={(e) => patch(i, { title: e.target.value })}
                        />
                        <details className="preview-details">
                          <summary>Ghi chú & thông tin chi tiết</summary>
                          <label>
                            Ghi chú
                            <textarea
                              aria-label={`Ghi chú dòng ${i + 1}`}
                              value={r.notes}
                              maxLength={4000}
                              onChange={(e) =>
                                patch(i, { notes: e.target.value })
                              }
                            />
                          </label>
                          {r.kind === "goal" && (
                            <>
                              <label>
                                Cách theo dõi
                                <select
                                  aria-label={`Cách theo dõi dòng ${i + 1}`}
                                  value={r.goal.tracking_mode || "milestone"}
                                  onChange={(e) =>
                                    patch(i, {
                                      goal: {
                                        ...r.goal,
                                        tracking_mode: e.target
                                          .value as Goal["tracking_mode"],
                                      },
                                    })
                                  }
                                >
                                  <option value="milestone">Một cột mốc</option>
                                  <option value="numeric">
                                    Mức hiện tại → mục tiêu
                                  </option>
                                  <option value="checklist">
                                    Dự án có các bước
                                  </option>
                                  <option value="progress">Phần trăm</option>
                                </select>
                              </label>
                              {r.goal.tracking_mode === "numeric" ? (
                                <>
                                  <label>
                                    Mức hiện tại
                                    <input
                                      aria-label={`Mức hiện tại dòng ${i + 1}`}
                                      type="number"
                                      step="any"
                                      value={r.goal.metric_current ?? 0}
                                      onChange={(e) =>
                                        patch(i, {
                                          goal: {
                                            ...r.goal,
                                            metric_current: Number(
                                              e.target.value,
                                            ),
                                          },
                                        })
                                      }
                                    />
                                  </label>
                                  <label>
                                    Mức mục tiêu
                                    <input
                                      aria-label={`Mức mục tiêu dòng ${i + 1}`}
                                      type="number"
                                      step="any"
                                      value={r.goal.metric_target ?? 1}
                                      onChange={(e) =>
                                        patch(i, {
                                          goal: {
                                            ...r.goal,
                                            metric_target: Number(
                                              e.target.value,
                                            ),
                                          },
                                        })
                                      }
                                    />
                                  </label>
                                  <label>
                                    Đơn vị
                                    <input
                                      value={r.goal.metric_unit || ""}
                                      maxLength={30}
                                      onChange={(e) =>
                                        patch(i, {
                                          goal: {
                                            ...r.goal,
                                            metric_unit: e.target.value,
                                          },
                                        })
                                      }
                                    />
                                  </label>
                                </>
                              ) : r.goal.tracking_mode === "checklist" ? (
                                <ul>
                                  {r.goal.checklist?.map((s) => (
                                    <li key={s.id}>
                                      {s.done ? "✓" : "○"} {s.title}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <label>
                                  {r.goal.tracking_mode === "progress"
                                    ? "Tiến độ (%)"
                                    : "Hoàn thành (0 hoặc 100)"}
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={
                                      r.goal.tracking_mode === "progress"
                                        ? 1
                                        : 100
                                    }
                                    value={r.goal.progress || 0}
                                    onChange={(e) =>
                                      patch(i, {
                                        goal: {
                                          ...r.goal,
                                          progress: Number(e.target.value),
                                        },
                                      })
                                    }
                                  />
                                </label>
                              )}
                              <label>
                                Màu
                                <input
                                  type="color"
                                  value={r.goal.color || "#2563eb"}
                                  onChange={(e) =>
                                    patch(i, {
                                      goal: {
                                        ...r.goal,
                                        color: e.target.value,
                                      },
                                    })
                                  }
                                />
                              </label>
                            </>
                          )}
                          {r.activity?.is_milestone && (
                            <p>
                              ★ Cột mốc đã đạt · {r.activity.milestone_kind}
                            </p>
                          )}
                          {r.activity?.started_at && (
                            <p>
                              {new Date(r.activity.started_at).toLocaleString(
                                "vi-VN",
                              )}{" "}
                              →{" "}
                              {new Date(r.activity.ended_at!).toLocaleString(
                                "vi-VN",
                              )}
                            </p>
                          )}
                        </details>
                        <small className={issues[i] ? "overdue" : "muted"}>
                          {issues[i] || r.issue}
                        </small>
                      </td>
                      <td>
                        <input
                          aria-label={`Ngày dòng ${i + 1}`}
                          type="date"
                          value={r.date}
                          onChange={(e) =>
                            patch(i, {
                              date: e.target.value,
                              end_date:
                                r.date === r.end_date
                                  ? e.target.value
                                  : r.end_date,
                            })
                          }
                        />
                        <input
                          aria-label={`Ngày kết thúc dòng ${i + 1}`}
                          type="date"
                          value={r.end_date}
                          onChange={(e) =>
                            patch(i, { end_date: e.target.value })
                          }
                        />
                      </td>
                      <td>
                        {r.kind === "session" ? (
                          <>
                            <input
                              aria-label={`Giờ bắt đầu dòng ${i + 1}`}
                              type="time"
                              value={r.start_time}
                              onChange={(e) =>
                                patch(i, { start_time: e.target.value })
                              }
                            />
                            <input
                              aria-label={`Giờ kết thúc dòng ${i + 1}`}
                              type="time"
                              value={r.end_time}
                              onChange={(e) =>
                                patch(i, { end_time: e.target.value })
                              }
                            />
                          </>
                        ) : r.kind !== "goal" ? (
                          <input
                            aria-label={`Phút dòng ${i + 1}`}
                            type="number"
                            min={0}
                            value={r.minutes}
                            onChange={(e) =>
                              patch(i, { minutes: e.target.value })
                            }
                          />
                        ) : (
                          <span>{r.goal.tracking_mode || "milestone"}</span>
                        )}
                      </td>
                      <td>
                        {r.kind !== "goal" && (
                          <select
                            aria-label={`Mục tiêu dòng ${i + 1}`}
                            value={
                              r.goal_id ||
                              (r.goal_ref ? `new:${r.goal_ref}` : "")
                            }
                            onChange={(e) =>
                              patch(i, {
                                goal_id: e.target.value.startsWith("new:")
                                  ? ""
                                  : e.target.value,
                                goal_ref: e.target.value.startsWith("new:")
                                  ? e.target.value.slice(4)
                                  : "",
                              })
                            }
                          >
                            <option value="">Không gắn mục tiêu</option>
                            {goals.map((g) => (
                              <option value={g.id} key={g.id}>
                                {g.title}
                              </option>
                            ))}
                            {rows
                              .filter(
                                (g) => g.kind === "goal" && g.ref && g.selected,
                              )
                              .map((g) => (
                                <option key={g.key} value={`new:${g.ref}`}>
                                  Nhập mới: {g.title}
                                </option>
                              ))}
                          </select>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={checked}
                disabled={busy}
                onChange={(e) => setChecked(e.target.checked)}
              />
              Tôi đã đối chiếu ngày, giờ, loại dữ liệu và xác nhận nhập{" "}
              {selected.length} dòng đã chọn.
            </label>
            <button
              className="button primary"
              disabled={busy || !checked || invalid || !selected.length}
              onClick={() => void commit()}
            >
              {busy ? "Đang nhập…" : `Xác nhận nhập ${selected.length} dòng`}
            </button>
            <p className="muted small">
              Dữ liệu được lưu cùng lúc. Gửi lại cùng một lần nhập không tạo bản
              sao.
            </p>
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
