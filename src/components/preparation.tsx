"use client";
import { useState } from "react";
import Dialog from "./dialog";
import DatePicker from "./date-picker";
import ImportHelp from "./import-help";
import { journeySettings, moveSemester } from "@/lib/schedule";
import { todayKey, type Profile } from "@/lib/timeline";
import { errorMessage } from "@/lib/errors";

export default function Preparation({
  profile,
  onSave,
  onImport,
  onSkip,
}: {
  profile: Profile;
  onSave: (p: Profile) => Promise<void>;
  onImport: () => void;
  onSkip: () => void;
}) {
  const terms = journeySettings(profile);
  const initial =
    terms.find((t) => t.start <= todayKey() && t.end >= todayKey()) || terms[0];
  const [term, setTerm] = useState(initial);
  const [ready, setReady] = useState(
    (profile.confirmed_semesters || []).includes(initial.index),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await onSave({
        ...profile,
        semester_settings: terms.map((t) =>
          t.index === term.index ? term : t,
        ),
        confirmed_semesters: [
          ...new Set([...(profile.confirmed_semesters || []), term.index]),
        ],
      });
      setReady(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={ready ? "Chuẩn bị học kỳ của bạn" : "Kỳ này bạn học từ ngày nào?"}
      description={
        ready
          ? "Từ thời khóa biểu và mục tiêu đến một tuần có kế hoạch."
          : "Chỉ cần xác nhận kỳ hiện tại. Các kỳ khác có thể chỉnh sau."
      }
      wide
      onClose={() => {
        if (!busy) onSkip();
      }}
    >
      <div className="form">
        {!ready ? (
          <>
            <p>
              UniTracker dành cho người tự sắp xếp việc học: thêm lịch cố định,
              đặt mục tiêu, rồi chọn thời gian làm việc trong tuần.
            </p>
            <div className="form-row">
              <DatePicker
                label="Kỳ hiện tại bắt đầu"
                value={term.start}
                onChange={(day) => setTerm(moveSemester(term, day))}
              />
              <DatePicker
                label="Kỳ hiện tại kết thúc"
                value={term.end}
                min={term.start}
                onChange={(end) => setTerm({ ...term, end })}
              />
            </div>
            <p className="muted small">
              Tuần bắt đầu vào thứ Hai. Đổi ngày đầu sẽ dịch ngày kết thúc tương
              ứng.
            </p>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void confirm()}
            >
              {busy ? "Đang lưu…" : "Xác nhận kỳ hiện tại"}
            </button>
          </>
        ) : (
          <>
            <ImportHelp day={todayKey()} termEnd={term.end} onSkip={onSkip} />
            <button className="button primary" onClick={onImport}>
              Tôi đã có file · Nhập lịch & mục tiêu
            </button>
            <p className="muted small">
              Bạn sẽ xem lại và xác nhận trước khi lưu. Sau đó mở ngay Tuần &
              phiên học với dữ liệu vừa nhập.
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
