"use client";
import { useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/errors";
import type { RestoreItem, RestoreReview } from "@/lib/backup";

const labels: Record<string, string> = {
  goals: "Mục tiêu & cột mốc",
  focus_sessions: "Phiên & timer",
  activities: "Nhật ký & lịch sử tiến độ",
  weekly_budgets: "Quỹ giờ tuần",
  timetable_entries: "Lịch cố định",
  profiles: "Cài đặt hành trình",
};
export default function RestoreReviewPanel({
  items,
  review,
  onBack,
  onSaved,
}: {
  items: RestoreItem[];
  review: RestoreReview[];
  onBack: () => void;
  onSaved: () => Promise<void>;
}) {
  const [choices, setChoices] = useState<
    Record<string, "keep" | "skip" | "replace">
  >({});
  const [checked, setChecked] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [result, setResult] = useState<RestoreReview[] | null>(null);
  const batch = useRef("");
  const shown = result || review;
  return (
    <div className="form">
      <p>
        Khôi phục bổ sung vào dữ liệu đang có. Bản ghi trùng giữ nguyên; mục
        khác nhau được đối chiếu bên dưới. Timer đang chạy trong bản sao lưu sẽ
        ở trạng thái tạm dừng.
      </p>
      {Object.entries(labels).map(([table, label]) => {
        const rows = shown.filter((r) => r.table === table);
        if (!rows.length) return null;
        return (
          <details
            key={table}
            className="import-group"
            open={rows.some(
              (r) => r.status === "conflict" || r.status === "error",
            )}
          >
            <summary>
              <strong>{label}</strong> · {rows.length} bản ghi ·{" "}
              {rows.filter((r) => r.status === "new").length} mới ·{" "}
              {rows.filter((r) => r.status === "conflict").length} khác nội dung
            </summary>
            {rows.map((r) => (
              <div key={r.key} className="restore-row">
                <strong>{r.title}</strong>{" "}
                <span>
                  {
                    {
                      new: "Sẽ bổ sung",
                      same: "Đã có, giữ nguyên",
                      conflict: "Khác nội dung đang có",
                      error: "Cần xem lại",
                      saved: "Đã bổ sung",
                      kept: "Đã giữ bản đang có",
                      skipped: "Đã bỏ qua",
                    }[r.status]
                  }
                </span>
                {r.message && <p className="form-error">{r.message}</p>}
                {r.status === "conflict" && (
                  <>
                    <details>
                      <summary>Xem nội dung đang có và trong file</summary>
                      <div className="form-row">
                        <pre>{JSON.stringify(r.current, null, 2)}</pre>
                        <pre>{JSON.stringify(r.incoming, null, 2)}</pre>
                      </div>
                    </details>
                    <label>
                      Xử lý
                      <select
                        disabled={busy || !!result}
                        value={choices[r.key] || "keep"}
                        onChange={(e) => {
                          setChoices({
                            ...choices,
                            [r.key]: e.target.value as "keep" | "replace",
                          });
                          setChecked(false);
                          batch.current = "";
                        }}
                      >
                        <option value="keep">
                          Giữ dữ liệu đang có và gắn các liên kết vào đây
                        </option>
                        {table === "profiles" && (
                          <option value="replace">
                            Áp dụng cài đặt hành trình trong file
                          </option>
                        )}
                      </select>
                    </label>
                  </>
                )}
              </div>
            ))}
          </details>
        );
      })}
      {!result ? (
        <>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            Tôi đã đối chiếu; bổ sung bản ghi mới, giữ bản đang có theo lựa chọn
            trên.
          </label>
          <button
            className="button primary"
            disabled={!checked || busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                batch.current ||= crypto.randomUUID();
                const r = await getSupabase()!.rpc("restore_tracker_reviewed", {
                  p_items: items.map((i) => ({
                    ...i,
                    resolution: choices[i.key] || "keep",
                  })),
                  p_apply: true,
                  p_batch_id: batch.current,
                });
                if (r.error) throw r.error;
                setResult(r.data.rows);
                await onSaved();
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Đang khôi phục…" : "Xác nhận bổ sung dữ liệu"}
          </button>
          <button className="text-button" disabled={busy} onClick={onBack}>
            Quay lại nguồn
          </button>
        </>
      ) : (
        <p role="status">
          Đã bổ sung {result.filter((r) => r.status === "saved").length}, giữ{" "}
          {result.filter((r) => r.status === "kept").length}, còn{" "}
          {result.filter((r) => r.status === "error").length} bản ghi cần xem
          lại.
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  );
}
