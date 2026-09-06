# Uni Tracker

Ứng dụng tiếng Việt theo dõi hành trình đại học 4 năm, xây bằng Next.js, TypeScript và Supabase, triển khai trên Vercel.

Website: https://uni-tracker-sigma.vercel.app

## Tính năng

- Timeline 4 hàng × 2 học kỳ, mỗi kỳ 6 tháng, một ô cho mỗi ngày.
- Đổi năm và tháng nhập học; tự xử lý năm nhuận và ranh giới học kỳ.
- Tạo/sửa/xóa mục tiêu với màu tùy chọn; chọn theo tiến độ 0–100% hoặc cột mốc đạt/chưa đạt.
- Màu gợi ý và ký hiệu riêng cho thi giữa kỳ (G), cuối kỳ (C), cột mốc (◆), thành tựu đã đạt (★).
- Ngày có nhiều mục tiêu chia ô chéo cho hai mục tiêu, chia góc cho 3–4; trên 4 có dấu chấm và danh sách đầy đủ khi mở ngày.
- Timeline có chế độ màu mục tiêu và chế độ năng suất theo thời lượng; lọc theo mục tiêu.
- Lưu lịch sử tiến độ và ngày hoàn thành trong cùng transaction với mục tiêu.
- Nhật ký hoạt động gắn với mục tiêu, nhập thời lượng theo phút, ghi nhận cột mốc độc lập và màu riêng.
- Báo cáo tuần/tháng: tổng thời gian, số ngày duy trì, biểu đồ từng ngày và tỷ lệ phân bổ thời gian cho từng mục tiêu.
- Chuỗi ngày hoạt động, cảnh báo deadline/quá hạn và xuất dữ liệu JSON.
- Đăng ký, đăng nhập, đăng xuất bằng Supabase Auth; nút hiện/ẩn mật khẩu. Khôi phục qua email có thể bật sau khi cấu hình SMTP.
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

Migration đã lưu trong `supabase/migrations`. Với một dự án Supabase mới, áp dụng lần lượt bằng Supabase CLI hoặc SQL Editor. Các bảng: `profiles`, `goals`, `activities`.

RLS dùng `auth.uid()` kiểm tra sở hữu cho đọc/ghi; khóa ngoại tổng hợp ngăn gắn hoạt động vào mục tiêu của người khác. Trigger `record_goal_progress` chạy dưới quyền người gọi và ghi lịch sử trong cùng transaction. Xóa mục tiêu giữ lại lịch sử, bỏ liên kết `goal_id`.

Các ngày là kiểu `date`; ngày ghi tiến độ tự động dùng múi giờ `Asia/Ho_Chi_Minh`. Ngày hoàn thành có thể nhập lại để ghi nhận một cột mốc trước đó. Khi mở lại rồi hoàn thành một mục tiêu, lịch sử các lần trước vẫn được giữ.

Thống kê năng suất chỉ dùng nhật ký `event`, không đếm lịch sử cập nhật phần trăm hoặc hoàn thành tự động. Cột mốc độc lập không có thời lượng cũng không tính vào độ đều đặn. Hoạt động thông thường chưa nhập thời lượng được tính là một ngày duy trì nhưng không được suy ra số phút. Tuần bắt đầu thứ Hai; mẫu số của kỳ hiện tại chỉ tính những ngày đã qua. Màu nhạt biểu thị hoạt động, màu đậm và viền biểu thị deadline; nhiều mục tiêu cùng ngày vẫn có thể đọc đầy đủ qua nhãn và chi tiết ngày.

## Supabase Auth cho production

Trong Dashboard → Authentication:

1. URL Configuration: đặt Site URL là `https://uni-tracker-sigma.vercel.app`; thêm URL production và `http://localhost:3000` vào Redirect URLs.
2. Bật Email provider và cho phép đăng ký.
3. Cấu hình tạm hiện tại: tắt Custom SMTP và Confirm email. Người dùng đăng ký bằng email/mật khẩu và nhận session ngay; chưa xác minh chủ email.
4. Khôi phục mật khẩu qua email đang ẩn (`NEXT_PUBLIC_AUTH_EMAIL_ENABLED=false`). Khi có SMTP gửi được email tới mọi người dùng, bật cờ này và bật lại Confirm email nếu cần. Dịch vụ email mặc định Supabase giới hạn người nhận và lưu lượng.
5. Với Resend: host `smtp.resend.com`, port `465`, username `resend`, password là Resend API key, sender thuộc domain đã xác minh. URL Vercel chỉ dùng cho Site URL/redirect, không phải SMTP host.

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

`tests/timeline.test.ts` kiểm tra 8 học kỳ, ngày nhuận, đủ ngày không trùng, tháng nhập học, padding theo thứ và chuỗi ngày.

`tests/focus.test.ts` kiểm tra chia màu khi trùng deadline, giữ mọi cột mốc, biên tuần/tháng, thống kê thời gian và loại trừ lịch sử tự động. `tests/errors.test.ts` kiểm tra thông báo đăng nhập và gửi email.

`tests/database.sql` chạy trong transaction rồi ROLLBACK: kiểm tra RLS với hai người dùng, chống đổi chủ sở hữu, chống khóa ngoại chéo tài khoản, lịch sử hoàn thành nguyên tử, chống trùng khi sửa tên, giữ lịch sử khi xóa mục tiêu, và chặn truy cập ẩn danh. Chạy bằng SQL Editor hoặc công cụ có quyền quản trị trên database kiểm thử.

`tests/focus-database.sql` cũng rollback toàn bộ: kiểm tra ràng buộc cột mốc, màu, thời lượng, hoàn thành có metadata, gỡ liên kết và giữ màu/tên mục tiêu đã xóa.

## Giới hạn chủ ý

- Deadline hiển thị trong ứng dụng; chưa gửi email/push nhắc việc.
- Người khác dùng tài khoản riêng; chưa có chia sẻ công khai hành trình cá nhân.
- Một hành trình 4 năm cho mỗi tài khoản. Các bản ghi ngoài khoảng này vẫn nằm trong mục tiêu/nhật ký, nhưng không xuất hiện trên heatmap.

