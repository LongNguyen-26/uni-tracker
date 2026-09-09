"use client";
import { useState } from "react";
import { Copy, Check, Download } from "lucide-react";
import type { ImportContext } from "@/lib/importer";
import {
  aiImportPrompt,
  importTemplate,
  type ImportGuideOptions,
} from "@/lib/import-guide";

export default function ImportHelp({
  day,
  termEnd,
  onSkip,
  context = "schedule",
  termStart,
  goals,
}: {
  context?: ImportContext;
  day: string;
  termEnd: string;
  onSkip?: () => void;
} & ImportGuideOptions) {
  const [copied, setCopied] = useState(false),
    [showPrompt, setShowPrompt] = useState(false);
  const options = { termStart, goals };
  const prompt = aiImportPrompt(day, termEnd, context, options);
  const source =
    context === "timetable"
      ? "ảnh chụp thời khóa biểu hoặc lịch cố định"
      : context === "goals"
        ? "danh sách mục tiêu và cột mốc của bạn"
        : context === "activities"
          ? "kế hoạch tự học có sẵn và tên mục tiêu tương ứng"
          : "thời khóa biểu, mục tiêu/cột mốc và kế hoạch tự học của bạn";
  function download() {
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", importTemplate(day, termEnd, context, options)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "unitracker-" + context + ".csv";
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="import-help guided-import-help">
      <ol className="import-instructions">
        <li>
          <div>
            <strong>Sao chép hướng dẫn dành riêng cho bước này</strong>
            <p>
              Prompt đã kèm ngày học kỳ
              {goals?.length ? " và tên mục tiêu đã lưu" : ""}.
            </p>
            <div className="row-actions">
              <button
                type="button"
                className="button primary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(prompt);
                    setCopied(true);
                  } catch {
                    setShowPrompt(true);
                  }
                }}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}{" "}
                {copied ? "Đã sao chép prompt" : "Sao chép prompt cho AI"}
              </button>
              <button type="button" className="text-button" onClick={download}>
                <Download size={16} /> Tải file mẫu
              </button>
            </div>
            <details open={showPrompt || undefined}>
              <summary>Xem prompt</summary>
              {showPrompt && (
                <p>
                  Chưa sao chép tự động được. Chọn và sao chép nội dung bên
                  dưới.
                </p>
              )}
              <textarea
                aria-label="Prompt cho AI"
                readOnly
                value={prompt}
                rows={10}
                onFocus={(e) => e.currentTarget.select()}
              />
            </details>
          </div>
        </li>
        <li>
          <div>
            <strong>Dán vào ChatGPT hoặc Claude cùng dữ liệu của bạn</strong>
            <p>
              Đính kèm {source}. Tải file CSV hoặc JSON mà AI tạo, rồi chọn file
              bên dưới để xem lại.
            </p>
          </div>
        </li>
      </ol>
      {onSkip && (
        <button type="button" className="text-button" onClick={onSkip}>
          Tự nhập, bỏ qua
        </button>
      )}
    </div>
  );
}
