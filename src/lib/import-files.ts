export type FileText = {
  text: string;
  format: "table" | "json" | "ics";
  review: boolean;
  sheets?: { name: string; text: string }[];
};
export async function extractFile(
  file: File,
  onProgress: (s: string) => void,
): Promise<FileText> {
  if (file.size > 10 * 1024 * 1024) throw new Error("Mỗi file tối đa 10 MB.");
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (["json", "csv", "tsv", "txt", "ics"].includes(ext || ""))
    return {
      text: await file.text(),
      format: ext === "json" ? "json" : ext === "ics" ? "ics" : "table",
      review: false,
    };
  if (["xlsx", "xls"].includes(ext || "")) {
    const XLSX = await import("xlsx");
    const book = XLSX.read(await file.arrayBuffer(), {
      type: "array",
      cellDates: false,
      cellNF: true,
      dateNF: "yyyy-mm-dd",
    });
    // Decode Excel serials without converting through historical browser time zones.
    for (const name of book.SheetNames) {
      const sheet = book.Sheets[name];
      for (const address of Object.keys(sheet)) {
        if (address.startsWith("!")) continue;
        const cell = sheet[address];
        if (
          cell.t !== "n" ||
          typeof cell.v !== "number" ||
          !XLSX.SSF.is_date(cell.z || "")
        )
          continue;
        const d = XLSX.SSF.parse_date_code(cell.v, {
          date1904: book.Workbook?.WBProps?.date1904,
        });
        if (!d) continue;
        const format = (cell.z || "").replace(/"[^"]*"|\[[^\]]*\]/g, "");
        const isTime = !/[yd]/i.test(format);
        cell.t = "s";
        cell.v = isTime
          ? `${String(d.H).padStart(2, "0")}:${String(d.M).padStart(2, "0")}`
          : `${String(d.y).padStart(4, "0")}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
        delete cell.w;
        delete cell.z;
      }
    }
    const sheets = book.SheetNames.map((name) => ({
      name,
      text: XLSX.utils.sheet_to_csv(book.Sheets[name], {
        dateNF: "yyyy-mm-dd",
      }),
    }));
    if (!sheets.length) throw new Error("Excel không có trang tính.");
    return { text: sheets[0].text, format: "table", review: false, sheets };
  }
  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.convertToHtml({
      arrayBuffer: await file.arrayBuffer(),
    });
    const doc = new DOMParser().parseFromString(result.value, "text/html");
    const tables = [...doc.querySelectorAll("table")].map((t) =>
      [...t.querySelectorAll("tr")]
        .map((r) =>
          [...r.querySelectorAll("th,td")]
            .map((c) => (c.textContent || "").trim().replace(/\s+/g, " "))
            .join("\t"),
        )
        .join("\n"),
    );
    return {
      text: tables.join("\n\n") || doc.body.textContent || "",
      format: "table",
      review: true,
    };
  }
  if (ext === "pdf" || file.type.startsWith("image/")) {
    const recognize = async (image: File | HTMLCanvasElement) => {
      onProgress("Đang tải bộ đọc chữ Việt/Anh…");
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("vie+eng", 1, {
        logger: (m) =>
          onProgress(`${m.status} ${Math.round((m.progress || 0) * 100)}%`),
      });
      try {
        const r = await worker.recognize(image);
        return r.data.text;
      } finally {
        await worker.terminate();
      }
    };
    if (ext !== "pdf") {
      const bitmap = await createImageBitmap(file);
      const pixels = bitmap.width * bitmap.height;
      bitmap.close();
      if (pixels > 16000000)
        throw new Error(
          "Ảnh tối đa 16 triệu điểm ảnh; hãy cắt vùng chứa lịch trước khi nhập.",
        );
      return { text: await recognize(file), format: "table", review: true };
    }
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const loading = pdfjs.getDocument({ data: await file.arrayBuffer() });
    const pdf = await loading.promise;
    try {
      if (pdf.numPages > 10)
        throw new Error(
          "PDF tối đa 10 trang mỗi lần. Hãy tách các trang chứa lịch trước khi nhập.",
        );
      const pages: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        onProgress(`Đang đọc PDF ${i}/${pdf.numPages}…`);
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const lines = new Map<number, { x: number; text: string }[]>();
        for (const item of content.items) {
          if (!("str" in item)) continue;
          const y = Math.round(item.transform[5] / 3) * 3;
          const line = lines.get(y) || [];
          line.push({ x: item.transform[4], text: item.str });
          lines.set(y, line);
        }
        let text = [...lines.entries()]
          .sort((a, b) => b[0] - a[0])
          .map(([, items]) =>
            items
              .sort((a, b) => a.x - b.x)
              .map((x) => x.text)
              .join("\t"),
          )
          .join("\n");
        if (text.trim().length < 20) {
          const viewport = page.getViewport({ scale: 1.6 });
          if (viewport.width * viewport.height > 16000000)
            throw new Error(
              "Trang PDF quá lớn để đọc ảnh; hãy giảm kích thước.",
            );
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvas, viewport }).promise;
          text = await recognize(canvas);
        }
        pages.push(text);
        page.cleanup();
      }
      return { text: pages.join("\n\n"), format: "table", review: true };
    } finally {
      await loading.destroy();
    }
  }
  throw new Error("Hỗ trợ Excel, CSV/TSV, JSON, DOCX, ICS, ảnh và PDF.");
}
