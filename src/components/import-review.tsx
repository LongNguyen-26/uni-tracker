"use client";
import { useState } from "react";
import type { Goal } from "@/lib/timeline";
import { type ImportRow } from "@/lib/importer";

export const importChoices = {
  goal: "Mục tiêu",
  timetable: "Lịch cố định",
  session: "Hoạt động",
};
export function ImportReviewRow({
  row: r,
  index: i,
  issue,
  rows,
  goals,
  patch,
}: {
  row: ImportRow;
  index: number;
  issue: string;
  rows: ImportRow[];
  goals: Goal[];
  patch: (index: number, data: Partial<ImportRow>) => void;
}) {
  const [range, setRange] = useState(r.date !== r.end_date);
  const [timed, setTimed] = useState(Boolean(r.start_time || r.end_time));
  const change = (value: Partial<ImportRow>) => patch(i, value);
  const goalChange = (value: Partial<ImportRow["goal"]>) =>
    change({ goal: { ...r.goal, ...value } });
  const activity = r.kind === "session" || r.kind === "activity";
  const timeInput = (field: "start_time" | "end_time", label: string) => (
    <label>
      {label}
      <input
        aria-label={`${label} dòng ${i + 1}`}
        type="text"
        inputMode="numeric"
        placeholder="HH:mm"
        pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
        maxLength={5}
        value={r[field]}
        onChange={(e) => change({ [field]: e.target.value })}
      />
    </label>
  );
  return (
    <tr id={`import-${r.key}`} className={issue ? "invalid" : ""} tabIndex={-1}>
      <td>
        <input
          type="checkbox"
          aria-label={`Nhập ${r.title || `dòng ${i + 1}`}`}
          checked={r.selected}
          onChange={(e) => change({ selected: e.target.checked })}
        />
      </td>
      <td>
        {r.kind === "budget" ? (
          <strong>Quỹ giờ trên mục tiêu</strong>
        ) : (
          <select
            aria-label={`Loại dòng ${i + 1}`}
            value={r.kind === "activity" ? "session" : r.kind}
            onChange={(e) => {
              const kind = e.target.value as ImportRow["kind"];
              change({
                kind,
                issue: "",
                all_day: kind === "timetable" && !r.start_time && !r.end_time,
                ...(kind === "goal"
                  ? {
                      goal_id: "",
                      goal_ref: "",
                      ref: r.ref || `import:${r.key}`,
                    }
                  : {}),
              });
            }}
          >
            {Object.entries(importChoices).map(([key, title]) => (
              <option key={key} value={key}>
                {title}
              </option>
            ))}
          </select>
        )}
        <input
          aria-label={`Tên dòng ${i + 1}`}
          maxLength={160}
          value={r.title}
          onChange={(e) => change({ title: e.target.value })}
        />
        {activity && (
          <select
            aria-label={`Trạng thái dòng ${i + 1}`}
            value={r.kind === "activity" ? "completed" : "planned"}
            onChange={(e) =>
              change({
                kind: e.target.value === "completed" ? "activity" : "session",
                status: e.target.value as "planned" | "completed",
                source_error: undefined,
              })
            }
          >
            <option value="planned">Dự định</option>
            <option value="completed">Đã xong</option>
          </select>
        )}
        <details className="preview-details">
          <summary>
            {r.kind === "goal"
              ? "Thước đo, quỹ giờ & ghi chú"
              : "Ghi chú & chi tiết"}
          </summary>
          {r.kind === "goal" && (
            <>
              <label>
                Làm sao biết mục tiêu này đã xong?
                <select
                  value={r.goal.tracking_mode || "none"}
                  onChange={(e) =>
                    goalChange({
                      tracking_mode: e.target.value as Goal["tracking_mode"],
                      metric_current:
                        e.target.value === "numeric" ? 0 : undefined,
                      metric_target:
                        e.target.value === "numeric" ? 1 : undefined,
                      checklist:
                        e.target.value === "checklist"
                          ? r.goal.checklist || []
                          : [],
                    })
                  }
                >
                  <option value="none">Đặt thước đo sau</option>
                  <option value="numeric">Khi đạt được một con số</option>
                  <option value="checklist">
                    Khi làm xong một danh sách việc
                  </option>
                </select>
              </label>
              {r.goal.tracking_mode === "numeric" && (
                <>
                  <label>
                    Hiện tại
                    <input
                      type="number"
                      step="any"
                      value={r.goal.metric_current ?? ""}
                      onChange={(e) =>
                        goalChange({
                          metric_current:
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Mục tiêu
                    <input
                      type="number"
                      step="any"
                      value={r.goal.metric_target ?? ""}
                      onChange={(e) =>
                        goalChange({
                          metric_target:
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Đơn vị
                    <input
                      maxLength={30}
                      value={r.goal.metric_unit || ""}
                      onChange={(e) =>
                        goalChange({ metric_unit: e.target.value })
                      }
                    />
                  </label>
                </>
              )}
              {r.goal.tracking_mode === "checklist" && (
                <label>
                  Danh sách việc (mỗi dòng một việc)
                  <textarea
                    rows={4}
                    value={(r.goal.checklist || [])
                      .map((s) => s.title)
                      .join("\n")}
                    onChange={(e) =>
                      goalChange({
                        checklist: e.target.value
                          .split("\n")
                          .map((title, index) => ({
                            id:
                              r.goal.checklist?.[index]?.id || `step-${index}`,
                            title,
                            done: r.goal.checklist?.[index]?.done || false,
                          })),
                      })
                    }
                  />
                </label>
              )}
              <label>
                Quỹ giờ mỗi tuần
                <input
                  type="number"
                  min={0}
                  max={168}
                  step={0.5}
                  value={r.goal.weekly_hours ?? 0}
                  onChange={(e) =>
                    goalChange({ weekly_hours: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Màu
                <input
                  type="color"
                  value={r.goal.color || "#2563eb"}
                  onChange={(e) => goalChange({ color: e.target.value })}
                />
              </label>
            </>
          )}
          {r.kind === "timetable" && (
            <label>
              Loại lịch
              <select
                value={r.timetable?.kind || "fixed"}
                onChange={(e) =>
                  change({
                    timetable: {
                      kind: e.target.value as "class" | "fixed",
                      semester_index: r.timetable?.semester_index || 0,
                    },
                  })
                }
              >
                <option value="class">Lớp học</option>
                <option value="fixed">Việc cố định</option>
              </select>
            </label>
          )}
          <label>
            Ghi chú
            <textarea
              value={r.notes}
              maxLength={4000}
              onChange={(e) => change({ notes: e.target.value })}
            />
          </label>
        </details>
        {(issue || r.issue || r.warning) && (
          <small className={issue ? "overdue" : "muted"}>
            {issue || r.issue || r.warning}
          </small>
        )}
      </td>
      <td>
        <input
          aria-label={`Ngày dòng ${i + 1}`}
          type="date"
          value={r.date}
          onChange={(e) =>
            change({
              date: e.target.value,
              end_date:
                !range || r.date === r.end_date ? e.target.value : r.end_date,
            })
          }
        />
        {range ? (
          <>
            <label>
              Đến ngày
              <input
                aria-label={`Ngày kết thúc dòng ${i + 1}`}
                type="date"
                value={r.end_date}
                onChange={(e) =>
                  change({ end_date: e.target.value, explicit_end: true })
                }
              />
            </label>
            <button
              type="button"
              className="text-button small"
              onClick={() => {
                setRange(false);
                change({
                  end_date: r.date,
                  explicit_end: true,
                  ...(r.kind === "goal"
                    ? { goal: { ...r.goal, timing_mode: "fixed" } }
                    : {}),
                });
              }}
            >
              Chỉ một ngày
            </button>
          </>
        ) : (
          <button
            type="button"
            className="text-button small"
            onClick={() => {
              setRange(true);
              if (r.kind === "goal") goalChange({ timing_mode: "window" });
            }}
          >
            Kéo dài nhiều ngày
          </button>
        )}
        {r.kind === "timetable" && !r.all_day && range && (
          <small className="muted">Lặp theo thứ này đến ngày kết thúc</small>
        )}
        {r.kind === "goal" && range && (
          <label>
            Khoảng ngày
            <select
              value={r.goal.timing_mode === "flexible" ? "flexible" : "window"}
              onChange={(e) =>
                goalChange({
                  timing_mode: e.target.value as "window" | "flexible",
                })
              }
            >
              <option value="window">Đã xác định</option>
              <option value="flexible">Dự kiến, chưa chốt ngày</option>
            </select>
          </label>
        )}
      </td>
      <td>
        {r.kind === "timetable" && (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={Boolean(r.all_day)}
              onChange={(e) => change({ all_day: e.target.checked })}
            />
            Cả ngày
          </label>
        )}
        {r.kind === "timetable" && !r.all_day && (
          <>
            {timeInput("start_time", "Bắt đầu")}
            {timeInput("end_time", "Kết thúc")}
          </>
        )}
        {activity && (
          <>
            <select
              aria-label={`Nhập thời gian dòng ${i + 1}`}
              value={timed ? "time" : "minutes"}
              onChange={(e) => {
                setTimed(e.target.value === "time");
                if (e.target.value === "minutes")
                  change({ start_time: "", end_time: "", end_date: r.date });
              }}
            >
              <option value="time">Khung giờ (24h)</option>
              <option value="minutes">Chỉ số phút</option>
            </select>
            {timed ? (
              <>
                {timeInput("start_time", "Bắt đầu")}
                {timeInput("end_time", "Kết thúc")}
              </>
            ) : (
              <label>
                Số phút
                <input
                  aria-label={`Phút dòng ${i + 1}`}
                  type="number"
                  min={1}
                  max={1440}
                  value={r.minutes}
                  onChange={(e) => change({ minutes: e.target.value })}
                />
              </label>
            )}
          </>
        )}
        {r.kind === "budget" && (
          <label>
            Số giờ
            <input
              type="number"
              min={0}
              max={168}
              value={Number(r.minutes) / 60}
              onChange={(e) =>
                change({ minutes: String(Number(e.target.value) * 60) })
              }
            />
          </label>
        )}
      </td>
      <td>
        {r.kind !== "goal" && (
          <select
            aria-label={`Mục tiêu dòng ${i + 1}`}
            value={r.goal_id || (r.goal_ref ? `new:${r.goal_ref}` : "")}
            onChange={(e) =>
              change({
                goal_id: e.target.value.startsWith("new:")
                  ? ""
                  : e.target.value,
                goal_ref: e.target.value.startsWith("new:")
                  ? e.target.value.slice(4)
                  : "",
                source_error: r.source_error?.startsWith("Có nhiều mục tiêu")
                  ? undefined
                  : r.source_error,
              })
            }
          >
            <option value="">Không gắn mục tiêu</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
            {rows
              .filter((g) => g.kind === "goal" && g.ref)
              .map((g) => (
                <option key={g.key} value={`new:${g.ref}`}>
                  {g.title} · {g.selected ? "tạo mới" : "chưa chọn"}
                </option>
              ))}
            {r.goal_ref && !rows.some((g) => g.ref === r.goal_ref) && (
              <option value={`new:${r.goal_ref}`}>
                Chưa tìm thấy: {r.goal_ref}
              </option>
            )}
          </select>
        )}
      </td>
    </tr>
  );
}
