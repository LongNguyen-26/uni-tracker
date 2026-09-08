"use client";
import { useState } from "react";
import type { ImportContext } from "@/lib/importer";
import { aiImportPrompt, importTemplate } from "@/lib/import-guide";

export default function ImportHelp({
  day,
  termEnd,
  onSkip,
  context = "schedule",
}: {
  context?: ImportContext;
  day: string;
  termEnd: string;
  onSkip?: () => void;
}) {
  const [copied, setCopied] = useState(false),
    [showPrompt, setShowPrompt] = useState(false);
  function download() {
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", importTemplate(day, termEnd, context)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "unitracker-mau.csv";
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="import-help">
      <strong>
        Bạn cần chuẩn bị hai thứ — thời khóa biểu và mục tiêu học kỳ này.
      </strong>
      <p>
        UniTracker giúp bạn tìm thời gian tự học giữa lịch có sẵn, rồi ghi lại
        việc đã làm. Dán prompt cùng ảnh TKB và mục tiêu vào ChatGPT, tải file
        được tạo rồi nhập bên dưới.
      </p>
      <div className="row-actions">
        <button
          type="button"
          className="button primary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(aiImportPrompt(day, termEnd, context));
              setCopied(true);
            } catch {
              setShowPrompt(true);
            }
          }}
        >
          {copied ? "Đã sao chép prompt" : "Sao chép prompt cho AI"}
        </button>
        <button type="button" className="button" onClick={download}>
          Tải file mẫu
        </button>
        {onSkip && (
          <button type="button" className="text-button" onClick={onSkip}>
            Tự nhập, bỏ qua
          </button>
        )}
      </div>
      <details open={showPrompt || undefined}>
        <summary>Xem prompt và quy tắc nhập</summary>
        <textarea
          aria-label="Prompt cho AI"
          readOnly
          value={aiImportPrompt(day, termEnd, context)}
          rows={12}
          onFocus={(e) => e.currentTarget.select()}
        />
      </details>
    </div>
  );
}
