import Papa from "papaparse";

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
export function importTemplate(day: string, termEnd: string) {
  return Papa.unparse({
    fields: IMPORT_COLUMNS,
    data: [
      [
        "goal",
        "IELTS 7.0+",
        termEnd,
        "",
        "fixed",
        "",
        "",
        "",
        "",
        "",
        6,
        6,
        7,
        "band",
        "",
        "Mục tiêu học kỳ",
        "#2563eb",
      ],
      [
        "class",
        "Lớp IELTS",
        day,
        termEnd,
        "",
        "19:00",
        "20:30",
        "IELTS 7.0+",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "Lặp hàng tuần từ ngày bắt đầu đến ngày kết thúc",
        "",
      ],
    ],
  });
}
export function aiImportPrompt(day: string, termEnd: string) {
  return `Hãy đọc ảnh thời khóa biểu và danh sách mục tiêu tôi đính kèm, rồi tạo file CSV UTF-8 tải được để nhập vào UniTracker. Nếu không tạo được file, trả lại duy nhất khối CSV. Đây là công cụ tự lập kế hoạch từ lịch cố định và mục tiêu cá nhân; đừng tự bịa mục tiêu hoặc lịch.

Hôm nay: ${day}. Kỳ hiện tại kết thúc: ${termEnd}. Hỏi lại nếu ảnh mờ, thiếu ngày bắt đầu kỳ, lịch học luân phiên tuần chẵn/lẻ hoặc có thông tin chưa chắc. Không tự đoán.

Giữ chính xác hàng tiêu đề:
${IMPORT_COLUMNS.join(",")}

Quy tắc:
- kind chỉ dùng goal (Mục tiêu), class hoặc fixed (Lịch cố định), activity (Hoạt động). Một file có thể chứa tất cả, đặt mục tiêu trước để dễ đọc.
- title bắt buộc, tối đa 160 ký tự; notes tối đa 4000. Đặt ô có dấu phẩy, dấu ngoặc kép hoặc xuống dòng trong ngoặc kép chuẩn CSV; ngoặc kép bên trong ghi thành "". Không bọc toàn bộ file trong một cặp ngoặc kép. Mỗi dòng đủ ${IMPORT_COLUMNS.length} cột.
- date/end_date: YYYY-MM-DD, ví dụ ${day}. end_date không được sớm hơn date. Một ngày thì bỏ end_date. Không lấy cuối tuần hiện tại thay cho ngày kết thúc sự kiện.
- Ngày trên mục tiêu là NGÀY ĐÍCH hoặc KHOẢNG DIỄN RA, không phải thời gian làm việc từ hôm nay tới deadline. Deadline chính xác: date=ngày đó, end_date trống, timing_mode=fixed. Hackathon diễn ra 3 ngày: date=ngày đầu, end_date=ngày cuối, timing_mode=window. Chỉ biết “cuối tháng 11”: chọn 7–14 ngày cuối tháng (ví dụ 2026-11-17 đến 2026-11-30), timing_mode=flexible, notes ghi rõ khoảng ước tính cần xác nhận; không kéo từ hôm nay hay từ đầu học kỳ. Dùng năm được người dùng cung cấp; nếu thiếu năm thì hỏi lại. Với mục tiêu hoàn toàn chưa có hạn, hỏi trước; app vẫn nhận ngày trống và sẽ báo dùng hôm nay để người dùng sửa khi xem trước. Không tạo thêm fixed trùng mục tiêu chỉ để đánh dấu cùng deadline.
- timing_mode chỉ dành cho goal: fixed (ngày đã chốt), window (khoảng đã xác định), flexible (hạn dự kiến trong khoảng ngắn). Có thể bỏ trống: app suy ra từ một ngày hoặc khoảng ngày. Các loại khác để trống.
- Giờ dùng HH:mm 24 giờ, ví dụ 14:30. Không dùng SA/CH, AM/PM. Cả hai giờ phải cùng có hoặc cùng trống, giờ kết thúc sau bắt đầu. Hoạt động có giờ tối đa 24h; nếu qua đêm, ghi end_date là ngày sau.
- goal_id là tên mục tiêu chính xác, không cần UUID. Dùng cùng một cách viết trên mọi dòng. Tên chưa có sẽ được tạo và hiện để xác nhận; không ghi tên quỹ giờ vào đây. Không suy ra hai mục tiêu khác nhau chỉ vì chúng có lịch khác nhau.
- weekly_hours chỉ đặt trên dòng goal: quỹ thời gian mong muốn MỖI TUẦN (0–168 giờ), không phải kết quả muốn đạt. Ví dụ mục tiêu "Paper ICDAR" có weekly_hours=16; không tạo mục tiêu "Nghiên cứu 16h/tuần" hay dòng budget. Tổng quỹ nên vừa thời gian rảnh. reserved_hours của đợt thi khác quỹ giờ tự học, không đưa vào cột này.
- Đo bằng số: điền cả current,target,unit. Ví dụ IELTS: 6,7,band. Đo bằng việc: điền steps phân cách bằng |, ví dụ "Đề cương|Thực nghiệm|Bản thảo"; tối đa 100 bước, mỗi bước 160 ký tự. Chưa rõ thước đo: bỏ trống tất cả. Không cần tracking_mode, phần trăm hay cột mốc giả.
- class/fixed có giờ: lặp hằng tuần theo thứ của date đến end_date (tối đa 730 ngày). Muốn một lần: end_date=date. Lịch chẵn/lẻ phải tách từng ngày một lần. Không chèn thêm hoạt động trùng lớp học.
- fixed không giờ: sự kiện cả ngày, liên tục từ date đến end_date (hội nghị, ngày thi, hạn mở đơn). Không gán giờ giả. Lịch cố định giữ chỗ; khi gắn mục tiêu nó thể hiện thời gian dành cho mục tiêu, chưa tự cộng giờ thực làm.
- activity: điền cặp start_time/end_time hoặc minutes (1–1440). Nếu có cả hai, minutes không vượt khung giờ. status=planned cho dự định, completed cho đã xong. Nếu không có status, ngày trước hôm nay là đã xong, hôm nay hoặc tương lai là dự định. Không ghi completed cho ngày tương lai. Chỉ có minutes và planned thì app lưu "chưa xếp giờ".
- Mục tiêu không điền giờ/phút/status; sự kiện cả ngày không điền giờ/phút. color tùy chọn dạng #rrggbb, tránh xanh lá; không ghi mã kiểu numeric/progress vào ô giờ.
- Không biến ghi chú tiến độ trong file xuất thành giờ đã làm, không lặp mục tiêu, không thêm dữ liệu cá nhân không cần thiết. Mỗi file tối đa 500 dòng, 10 MB. Kiểm tra ngày tồn tại, đủ cột, liên kết tên và thời lượng trước khi xuất. Tách riêng các dòng chưa đọc chắc để tôi xác minh.

Ví dụ đúng hai dòng dữ liệu:
${importTemplate(day, termEnd)}

Sau khi tạo file, nhắc tôi xem lại mục tiêu, lịch cố định, hoạt động dự định và đã xong trên màn hình xác nhận trước khi nhập.`;
}
