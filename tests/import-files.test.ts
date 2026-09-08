import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { extractFile } from "../src/lib/import-files";
import { parseTable, validateImportRow } from "../src/lib/importer";

test("Excel date and time cells produce unambiguous calendar values, with sheet selection", async () => {
  const sheet = XLSX.utils.aoa_to_sheet(
    [
      ["title", "date", "start_time", "end_time"],
      ["IELTS", new Date(2026, 8, 7), 9 / 24, 10 / 24],
    ],
    { cellDates: true },
  );
  sheet.B2.z = "m/d/yy";
  sheet.C2.z = "hh:mm";
  sheet.D2.z = "hh:mm";
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "HK1");
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      ["title", "date"],
      ["Paper", "2026-12-01"],
    ]),
    "HK2",
  );
  const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" });
  const file = new File([bytes], "schedule.xlsx");
  const result = await extractFile(file, () => {});
  assert.equal(result.sheets?.length, 2);
  const rows = parseTable(result.text, "timetable", "2026-09-07");
  assert.equal(rows[0].date, "2026-09-07");
  assert.equal(rows[0].start_time, "09:00");
  assert.equal(rows[0].end_time, "10:00");
  assert.equal(validateImportRow(rows[0], [], rows, "2026-09-07"), "");
});
test("file reader distinguishes JSON/Calendar and rejects unsupported or oversized files", async () => {
  assert.equal(
    (await extractFile(new File(["{}"], "data.json"), () => {})).format,
    "json",
  );
  assert.equal(
    (await extractFile(new File(["BEGIN:VCALENDAR"], "data.ics"), () => {}))
      .format,
    "ics",
  );
  await assert.rejects(
    () => extractFile(new File(["x"], "data.exe"), () => {}),
    /Hỗ trợ/,
  );
  await assert.rejects(
    () =>
      extractFile(
        new File([new Uint8Array(10 * 1024 * 1024 + 1)], "huge.csv"),
        () => {},
      ),
    /10 MB/,
  );
});
