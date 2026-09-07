# Uni Tracker

Ứng dụng tiếng Việt theo dõi hành trình đại học 4, 5 hoặc 6 năm, xây bằng Next.js, TypeScript và Supabase, triển khai trên Vercel.

Website: https://uni-tracker-sigma.vercel.app

## Tính năng

- Timeline 4–6 hàng × 2 học kỳ. Mặc định mỗi kỳ 6 tháng; sửa ngày bắt đầu/kết thúc, tên và kỳ nghỉ riêng cho từng học kỳ trong Cài đặt.
- Khung luôn trọn tuần thứ Hai–Chủ nhật, giữ ngày học thực tế, làm nhạt ngày ngoài kỳ và đánh dấu ngày nghỉ. Phóng to từng kỳ bằng bộ chọn hoặc ô chặng đường hiện tại.
- Tạo/sửa/xóa mục tiêu với màu, tên và phạm vi một/nhiều kỳ. Chọn lịch cho một hạn cuối hoặc một khoảng ngày.
- Bốn cách ghi tiến độ: số hiện tại → mục tiêu và đơn vị (IELTS/GPA), checklist với % tự tính (Paper), % nhập tay, hoặc cột mốc đạt/chưa đạt.
- Màu gợi ý và ký hiệu riêng cho thi giữa kỳ (G), cuối kỳ (C), cột mốc (◆), thành tựu đã đạt (★).
- Ngày có nhiều mục tiêu chia ô chéo cho hai mục tiêu, chia góc cho 3–4; trên 4 có dấu chấm và danh sách đầy đủ khi mở ngày.
- Timeline có chế độ màu mục tiêu và chế độ năng suất theo thời lượng; lọc theo mục tiêu.
- Lưu lịch sử tiến độ và ngày hoàn thành trong cùng transaction với mục tiêu.
- Nhật ký hoạt động gắn với mục tiêu, có giờ bắt đầu/kết thúc và thời lượng thực làm đến giây. Sửa được cả nhật ký timer và nội dung lịch sử mục tiêu; sửa nhật ký không làm đổi mức hiện tại của mục tiêu.
- Trang Tuần của bạn: đặt quỹ giờ theo mục tiêu, so sánh ý định với giờ thực làm và số ngày duy trì.
- Tạo phiên học với khung giờ, lặp 1–52 tuần, tùy chọn bỏ kỳ nghỉ. Sửa hoặc xóa phiên chưa bắt đầu.
- Timer đếm ngược, toàn màn hình, tạm dừng/tiếp tục; chỉ một phiên chạy tại một thời điểm. Lưu trạng thái trên Supabase, trừ thời gian nghỉ, giới hạn bằng thời lượng đặt ra. Xem lại và xác nhận trước khi ghi nhật ký; phiên qua nửa đêm được chia theo ngày.
- Nhập JSON, Excel/CSV/TSV, bảng dán từ Docs, DOCX, lịch ICS, ảnh và PDF theo luồng đọc → sửa bản xem trước → xác nhận → lưu nguyên tử. Có file mẫu và chọn số tuần áp dụng.
- Báo cáo tuần/tháng: tổng thời gian, số ngày duy trì, biểu đồ từng ngày và tỷ lệ phân bổ thời gian cho từng mục tiêu.
- Chuỗi ngày hoạt động, cảnh báo deadline/quá hạn và xuất dữ liệu JSON.
- Đăng ký, đăng nhập, đăng xuất bằng Supabase Auth; nút hiện/ẩn mật khẩu và menu avatar ở góc phải. Khôi phục qua email có thể bật sau khi cấu hình SMTP.
- Dữ liệu riêng theo tài khoản, RLS trên toàn bộ bảng; dữ liệu demo chỉ để xem.
- Giao diện responsive và hộp thoại hỗ trợ bàn phím.

## Chạy cục bộ

Yêu cầu Node.js 20.9 trở lên.

```powershell
npm ci
Copy-Item .env.example .env.local
# Điền URL và publishable key Supabase của bạn vào .env.local
npm run dev
```

Các biến môi trường:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_AUTH_EMAIL_ENABLED` (mặc định `false`; chỉ bật `true` sau khi cấu hình email để hiện chức năng quên mật khẩu)

Chỉ dùng publishable key ở client. Không đưa service role, secret key hoặc token triển khai vào Git.

## Database

Migration đã lưu trong `supabase/migrations`. Với một dự án Supabase mới, áp dụng đủ bảy migration theo tên thời gian bằng Supabase CLI hoặc SQL Editor. Các bảng: `profiles`, `goals`, `activities`, `weekly_budgets`, `focus_sessions`, `import_batches`.

RLS dùng `auth.uid()` kiểm tra sở hữu cho đọc/ghi; khóa ngoại tổng hợp ngăn gắn hoạt động vào mục tiêu của người khác. Trigger `record_goal_progress` chạy dưới quyền người gọi và ghi lịch sử trong cùng transaction. Xóa mục tiêu giữ lại lịch sử, bỏ liên kết `goal_id`.

RPC `transition_session` khóa theo tài khoản và phiên, đo từng đoạn chạy và ghi nhật ký một lần. RPC `import_tracker` kiểm tra quyền ở database, xử lý tối đa 500 dòng trong một transaction, dùng mã lượt nhập và dấu vân tay dữ liệu để chống ghi trùng khi thử lại. Không cần service role trên trình duyệt.

Các ngày là kiểu `date`; ngày ghi tiến độ tự động dùng múi giờ `Asia/Ho_Chi_Minh`. Ngày hoàn thành có thể nhập lại để ghi nhận một cột mốc trước đó. Khi mở lại rồi hoàn thành một mục tiêu, lịch sử các lần trước vẫn được giữ.

Thống kê năng suất chỉ dùng nhật ký `event`, không đếm lịch sử cập nhật phần trăm hoặc hoàn thành tự động. Cột mốc độc lập không có thời lượng cũng không tính vào độ đều đặn. Hoạt động thông thường chưa nhập thời lượng được tính là một ngày duy trì nhưng không được suy ra số phút. Tuần bắt đầu thứ Hai; mẫu số của kỳ hiện tại chỉ tính những ngày đã qua. Màu nhạt biểu thị hoạt động, màu đậm và viền biểu thị deadline; nhiều mục tiêu cùng ngày vẫn có thể đọc đầy đủ qua nhãn và chi tiết ngày.

## Supabase Auth cho production

Trong Dashboard → Authentication:

1. URL Configuration: đặt Site URL là `https://uni-tracker-sigma.vercel.app`; thêm URL production và `http://localhost:3000` vào Redirect URLs.
2. Bật Email provider và cho phép đăng ký.
3. Cấu hình tạm hiện tại: tắt Custom SMTP và Confirm email. Người dùng đăng ký bằng email/mật khẩu và nhận session ngay; chưa xác minh chủ email.
4. Khôi phục mật khẩu qua email đang ẩn (`NEXT_PUBLIC_AUTH_EMAIL_ENABLED=false`). Khi có SMTP gửi được email tới mọi người dùng, bật cờ này và bật lại Confirm email nếu cần. Dịch vụ email mặc định Supabase giới hạn người nhận và lưu lượng.
5. Với Resend: host `smtp.resend.com`, port `465`, username `resend`, password là Resend API key, sender thuộc domain đã xác minh. URL Vercel chỉ dùng cho Site URL/redirect, không phải SMTP host.

Security Advisor hiện còn cảnh báo cấu hình sẵn có: [Leaked password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) chưa bật. Không có cảnh báo mới về RLS/quyền truy cập từ các bảng được thêm.

## Nhập dữ liệu

Mở **Nhập dữ liệu** hoặc **Tuần của bạn → Nhập lịch**. Tải file mẫu trong hộp thoại để có các tiêu đề cột phù hợp. Với bảng Docs, dán trực tiếp văn bản bảng (các cột cách nhau bằng tab). File Excel cho phép chọn sheet; ngày nên có đủ năm, giờ dùng `09:00`.

- JSON có thể chứa `goals`, `activities`, `sessions`, `budgets`; phiên đang chạy/đã hoàn tất không được khôi phục thành phiên mới. Nhật ký thực tế vẫn nhập được. Xuất JSON bao gồm cả cài đặt nhưng nhập hiện chỉ nhận dữ liệu nghiệp vụ; sửa cài đặt hành trình trong trang Cài đặt.
- CSV/TSV nhận ngày ISO hoặc ngày/tháng/năm và thứ T2–CN theo tuần bắt đầu đã chọn. Tên mục tiêu có thể ghép với mục tiêu hiện có hoặc chọn lại trong bản xem trước.
- ICS đọc sự kiện, lặp lịch, ngoại lệ; sự kiện cả ngày thành khoảng mục tiêu. Lịch dùng TZID cần kèm định nghĩa VTIMEZONE để tránh đổi giờ sai. Đây là nhập file, chưa đồng bộ trực tiếp với Google Calendar.
- Ảnh/PDF dùng đọc chữ trên thiết bị; cần mạng để tải bộ OCR Việt/Anh lần đầu. Chữ nhận được hiển thị để sửa thành bảng trước khi phân tích. Bảng phức tạp, chữ viết tay hoặc ảnh mờ có thể cần sửa nhiều; chưa tự hiểu mọi bố cục thời khóa biểu.
- Giới hạn mỗi file 10 MB, tối đa 500 dòng mỗi lượt, PDF 10 trang, ảnh/trang quét 16 triệu điểm ảnh. Nội dung file không được tải lên dịch vụ OCR; chỉ dữ liệu đã xác nhận mới được lưu Supabase.
- Phiên và quỹ giờ có thể áp dụng 1–52 tuần; mục tiêu và nhật ký quá khứ không được nhân bản theo tuần. Dòng trùng được cảnh báo/bỏ chọn, dòng sai phải sửa hoặc bỏ chọn trước khi xác nhận.

## Vercel và GitHub

Repo: https://github.com/LongNguyen-26/uni-tracker

Thêm hai biến môi trường trên vào Production, Preview và Development của Vercel. Liên kết GitHub với Vercel; push lên `main` tạo production deployment tự động. Mỗi pull request tạo preview theo cấu hình Vercel.

Các môi trường hiện dùng chung Supabase project. Không dùng dữ liệu thật khi thử chức năng phá hủy dữ liệu trên preview; có thể tạo Supabase project riêng cho staging khi cần.

## Kiểm tra

```powershell
npm run lint
npm test
npm run build
```

`tests/timeline.test.ts` và `tests/planning.test.ts` kiểm tra lịch trọn tuần, 4/5/6 năm, ngày thực tế, năm nhuận, khoảng học kỳ, loại mục tiêu, timer, lặp theo tuần, CSV/JSON và ICS. `tests/import-files.test.ts` kiểm tra Excel nhiều sheet và giữ đúng ngày/giờ Excel.

`tests/focus.test.ts` kiểm tra chia màu khi trùng deadline, giữ mọi cột mốc, biên tuần/tháng, thống kê thời gian và loại trừ lịch sử tự động. `tests/errors.test.ts` kiểm tra thông báo đăng nhập và gửi email.

`tests/database.sql` chạy trong transaction rồi ROLLBACK: kiểm tra RLS với hai người dùng, chống đổi chủ sở hữu, chống khóa ngoại chéo tài khoản, lịch sử hoàn thành nguyên tử, chống trùng khi sửa tên, giữ lịch sử khi xóa mục tiêu, và chặn truy cập ẩn danh. Chạy bằng SQL Editor hoặc công cụ có quyền quản trị trên database kiểm thử.

`tests/focus-database.sql` cũng rollback toàn bộ: kiểm tra ràng buộc cột mốc, màu, thời lượng, hoàn thành có metadata, gỡ liên kết và giữ màu/tên mục tiêu đã xóa.

`tests/planning-database.sql` rollback toàn bộ: kiểm tra numeric/checklist, quỹ giờ, timer bỏ thời gian nghỉ/chia ngày/xác nhận một lần, sửa nhật ký timer, import nguyên tử/chống trùng và ngăn truy cập chéo tài khoản.

## Giới hạn chủ ý

- Deadline hiển thị trong ứng dụng; chưa gửi email/push nhắc việc.
- Người khác dùng tài khoản riêng; chưa có chia sẻ công khai hành trình cá nhân.
- Một hành trình 4–6 năm cho mỗi tài khoản. Các bản ghi ngoài khoảng này vẫn nằm trong mục tiêu/nhật ký, nhưng không xuất hiện trên heatmap.
- Timer tiếp tục tính thời gian khi đóng tab, tối đa bằng thời lượng đã đặt; không đo khả năng người dùng thực sự đang chú ý. Hãy tạm dừng khi nghỉ và kiểm tra trước khi xác nhận.
