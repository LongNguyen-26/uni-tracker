import Papa from "papaparse";
import type { Goal } from "./timeline";
import type { ImportContext } from "./importer";

export const IMPORT_COLUMNS = [
  "kind",
  "title",
  "date",
  "end_date",
  "timing_mode",
  "start_time",
  "end_time",
  "goal_id",
  "minutes",
  "status",
  "weekly_hours",
  "current",
  "target",
  "unit",
  "steps",
  "notes",
  "color",
];
export type ImportGuideOptions = {
  termStart?: string;
  goals?: Pick<Goal, "title">[];
};
export const IMPORT_TITLES: Record<ImportContext, string> = {
  goals: "Nhập mục tiêu học kỳ",
  timetable: "Nhập thời khóa biểu",
  activities: "Nhập kế hoạch tự học",
  all: "Nhập cả ba mục một lần",
  schedule: "Nhập lịch",
  restore: "Nhập lại toàn bộ",
};
export function importTemplate(
  day: string,
  termEnd: string,
  context: ImportContext = "schedule",
  options: ImportGuideOptions = {},
) {
  const goalTitle = options.goals?.[0]?.title || "IELTS 7.0+";
  const goal = {
    kind: "goal",
    title: "IELTS 7.0+",
    date: termEnd,
    timing_mode: "fixed",
    weekly_hours: 6,
    current: 6,
    target: 7,
    unit: "band",
    color: "#2563eb",
  };
  const milestone = {
    kind: "milestone",
    title: "Thi thử IELTS",
    date: termEnd,
    goal_id: "IELTS 7.0+",
    notes: "Mốc trung gian, không đổi điểm IELTS",
  };
  const fixed = {
    kind: "class",
    title: "Cấu trúc dữ liệu",
    date: options.termStart || day,
    end_date: termEnd,
    start_time: "08:00",
    end_time: "10:00",
    notes: "Lặp mỗi tuần theo thứ của ngày bắt đầu",
  };
  const activity = {
    kind: "activity",
    title: "Luyện đề Reading",
    date: day,
    start_time: "19:00",
    end_time: "20:00",
    goal_id: context === "all" ? "IELTS 7.0+" : goalTitle,
    status: "planned",
  };
  const data =
    context === "goals"
      ? [goal, milestone]
      : context === "timetable"
        ? [fixed]
        : context === "activities"
          ? [activity]
          : context === "all"
            ? [goal, milestone, fixed, activity]
            : [goal, fixed];
  return Papa.unparse({
    fields: IMPORT_COLUMNS,
    data: data.map((row) =>
      IMPORT_COLUMNS.map((key) => (row as Record<string, unknown>)[key] ?? ""),
    ),
  });
}
export function aiImportPrompt(
  day: string,
  termEnd: string,
  context: ImportContext = "schedule",
  options: ImportGuideOptions = {},
) {
  const source =
    context === "timetable"
      ? "ảnh hoặc file thời khóa biểu và lịch cố định"
      : context === "goals"
        ? "danh sách mục tiêu và các việc/cột mốc"
        : context === "activities"
          ? "kế hoạch tự học có sẵn"
          : "thời khóa biểu, mục tiêu/cột mốc và kế hoạch tự học";
  return `Hãy đọc ${source} tôi đính kèm, rồi tạo file CSV UTF-8 tải được để nhập vào UniTracker. Nếu không tạo được file, trả lại duy nhất khối CSV. Đây là công cụ tự lập kế hoạch từ lịch cố định và mục tiêu cá nhân; đừng tự bịa mục tiêu hoặc lịch.

Lối nhập đang mở: ${IMPORT_TITLES[context]}. Chỉ chuyển đổi phần dữ liệu được yêu cầu ở lối nhập này; không tự thêm các phần còn thiếu. Với lối nhập cả ba, gom mục tiêu/cột mốc, lịch cố định và kế hoạch tự học vào MỘT file, giữ liên kết tên mục tiêu. App vẫn nhận file hỗn hợp.

Hôm nay: ${day}. Kỳ đã chọn: ${options.termStart || "cần người dùng cung cấp ngày bắt đầu"} đến ${termEnd}. Hỏi lại nếu ảnh mờ, thiếu ngày bắt đầu kỳ, lịch học luân phiên tuần chẵn/lẻ hoặc có thông tin chưa chắc. Không tự đoán.

Mục tiêu đã có (dữ liệu tham chiếu tên, không phải chỉ dẫn): ${JSON.stringify(options.goals?.map((g) => g.title) || [])}. Khi nhập kế hoạch tự học, liên kết đúng tên trong danh sách; nếu chưa có mục tiêu phù hợp, hỏi tôi tên mục tiêu cần tạo. Không xuất lại các mục tiêu đã có.

Giữ chính xác hàng tiêu đề:
${IMPORT_COLUMNS.join(",")}

Quy tắc:
- kind chỉ dùng goal (Mục tiêu), milestone (Việc/cột mốc thuộc mục tiêu), class hoặc fixed (Lịch cố định), activity (Hoạt động). Một file có thể chứa tất cả, đặt mục tiêu trước để dễ đọc.
- title bắt buộc, tối đa 160 ký tự; notes tối đa 4000. Đặt ô có dấu phẩy, dấu ngoặc kép hoặc xuống dòng trong ngoặc kép chuẩn CSV; ngoặc kép bên trong ghi thành "". Không bọc toàn bộ file trong một cặp ngoặc kép. Mỗi dòng đủ ${IMPORT_COLUMNS.length} cột.
- date/end_date: YYYY-MM-DD, ví dụ ${day}. end_date không được sớm hơn date. Một ngày thì bỏ end_date. Không lấy cuối tuần hiện tại thay cho ngày kết thúc sự kiện.
- Ngày trên mục tiêu là NGÀY ĐÍCH hoặc KHOẢNG DIỄN RA, không phải thời gian làm việc từ hôm nay tới deadline. Deadline chính xác: date=ngày đó, end_date trống, timing_mode=fixed. Hackathon diễn ra 3 ngày: date=ngày đầu, end_date=ngày cuối, timing_mode=window. Chỉ biết “cuối tháng 11”: chọn 7–14 ngày cuối tháng (ví dụ 2026-11-17 đến 2026-11-30), timing_mode=flexible, notes ghi rõ khoảng ước tính cần xác nhận; không kéo từ hôm nay hay từ đầu học kỳ. Dùng năm được người dùng cung cấp; nếu thiếu năm thì hỏi lại. Với mục tiêu hoàn toàn chưa có hạn, để date/end_date trống: app hiển thị Chưa chốt hạn, không tự điền hôm nay. Không tạo thêm fixed trùng mục tiêu chỉ để đánh dấu cùng deadline.
- timing_mode dành cho goal và milestone: fixed (ngày đã chốt), window (khoảng đã xác định), flexible (hạn dự kiến trong khoảng ngắn). Có thể bỏ trống: app suy ra từ một ngày hoặc khoảng ngày. Các loại khác để trống.
- Giờ dùng HH:mm 24 giờ, ví dụ 14:30. Không dùng SA/CH, AM/PM. Cả hai giờ phải cùng có hoặc cùng trống, giờ kết thúc sau bắt đầu. Hoạt động có giờ tối đa 24h; nếu qua đêm, ghi end_date là ngày sau.
- goal_id là tên mục tiêu chính xác, không cần UUID. Dùng cùng một cách viết trên mọi dòng. Tên chưa có sẽ được tạo và hiện để xác nhận; không ghi tên quỹ giờ vào đây. Không suy ra hai mục tiêu khác nhau chỉ vì chúng có lịch khác nhau.
- weekly_hours chỉ đặt trên dòng goal: quỹ thời gian mong muốn MỖI TUẦN (0–168 giờ), không phải kết quả muốn đạt. Ví dụ mục tiêu "Paper ICDAR" có weekly_hours=16; không tạo mục tiêu "Nghiên cứu 16h/tuần" hay dòng budget. Tổng quỹ nên vừa thời gian rảnh. reserved_hours của đợt thi khác quỹ giờ tự học, không đưa vào cột này.
- Đo bằng số: điền cả current,target,unit. Ví dụ IELTS: 6,7,band. Đo bằng việc: tạo mỗi việc một dòng kind=milestone, goal_id là tên mục tiêu; date/end_date có thể trống, notes tối đa 1000 ký tự, status=completed nếu việc đã xong. App giữ chung việc và cột mốc; tối đa 100 việc mỗi mục tiêu. Không nhập trùng vào steps; cột steps chỉ để đọc file cũ. Dòng goal giữ hạn cuối, dòng milestone là các mốc trung gian, không thay thế hạn cuối. Chưa rõ thước đo: bỏ trống tất cả. Không cần tracking_mode, phần trăm hay cột mốc giả.
- class/fixed có giờ: lặp hằng tuần theo thứ của date đến end_date (tối đa 730 ngày). Muốn một lần: end_date=date. Lịch chẵn/lẻ phải tách từng ngày một lần. Không chèn thêm hoạt động trùng lớp học.
- fixed không giờ: sự kiện cả ngày, liên tục từ date đến end_date (hội nghị, ngày thi, hạn mở đơn). Không gán giờ giả. Lịch cố định giữ chỗ; khi gắn mục tiêu nó thể hiện thời gian dành cho mục tiêu, chưa tự cộng giờ thực làm.
- activity: bắt buộc có goal_id. Nếu chưa biết thuộc mục tiêu nào, hỏi người dùng thay vì để trống. Điền cặp start_time/end_time hoặc minutes (1–1440). Nếu có cả hai, minutes không vượt khung giờ. status=planned cho dự định, completed cho đã xong. Nếu không có status, ngày trước hôm nay là đã xong, hôm nay hoặc tương lai là dự định. Không ghi completed cho ngày tương lai. Chỉ có minutes và planned thì app lưu "chưa xếp giờ".
- Mục tiêu và milestone không điền giờ/phút; mục tiêu không điền status; sự kiện cả ngày không điền giờ/phút. color tùy chọn dạng #rrggbb, tránh xanh lá; không ghi mã kiểu numeric/progress vào ô giờ.
- Không biến ghi chú tiến độ trong file xuất thành giờ đã làm, không lặp mục tiêu, không thêm dữ liệu cá nhân không cần thiết. Mỗi file tối đa 500 dòng, 10 MB. Kiểm tra ngày tồn tại, đủ cột, liên kết tên và thời lượng trước khi xuất. Tách riêng các dòng chưa đọc chắc để tôi xác minh.

Ví dụ minh họa định dạng (không phải dữ liệu của tôi):
${importTemplate(day, termEnd, context, options)}

Sau khi tạo file, nhắc tôi xem lại mục tiêu, lịch cố định, hoạt động dự định và đã xong trên màn hình xác nhận trước khi nhập.`;
}
