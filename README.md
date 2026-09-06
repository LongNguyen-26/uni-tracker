# Uni Tracker

Ứng dụng tiếng Việt theo dõi hành trình đại học 4 năm, xây bằng Next.js, TypeScript và Supabase, triển khai trên Vercel.

## Tính năng

- Timeline 4 hàng × 2 học kỳ, mỗi kỳ 6 tháng, một ô cho mỗi ngày.
- Đổi năm và tháng nhập học; tự xử lý năm nhuận và ranh giới học kỳ.
- Tạo/sửa/xóa mục tiêu, lĩnh vực, ghi chú, deadline và tiến độ 0–100%.
- Lưu lịch sử tiến độ và ngày hoàn thành trong cùng transaction với mục tiêu.
- Nhật ký hoạt động, chi tiết theo ngày, lọc mục tiêu và tìm kiếm.
- Chuỗi ngày hoạt động, cảnh báo deadline/quá hạn và xuất dữ liệu JSON.
- Đăng ký, đăng nhập, đăng xuất và khôi phục mật khẩu bằng Supabase Auth.
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

Chỉ dùng publishable key ở client. Không đưa service role, secret key hoặc token triển khai vào Git.

## Database

Migration đã lưu trong `supabase/migrations`. Với một dự án Supabase mới, áp dụng lần lượt bằng Supabase CLI hoặc SQL Editor. Các bảng: `profiles`, `goals`, `activities`.

RLS dùng `auth.uid()` kiểm tra sở hữu cho đọc/ghi; khóa ngoại tổng hợp ngăn gắn hoạt động vào mục tiêu của người khác. Trigger `record_goal_progress` chạy dưới quyền người gọi và ghi lịch sử trong cùng transaction. Xóa mục tiêu giữ lại lịch sử, bỏ liên kết `goal_id`.

Các ngày là kiểu `date`; ngày ghi tiến độ tự động dùng múi giờ `Asia/Ho_Chi_Minh`. Ngày hoàn thành có thể nhập lại để ghi nhận một cột mốc trước đó. Khi mở lại rồi hoàn thành một mục tiêu, lịch sử các lần trước vẫn được giữ.

## Supabase Auth cho production

Trong Dashboard → Authentication:

1. URL Configuration: đặt Site URL là URL production Vercel; thêm URL production và `http://localhost:3000` vào Redirect URLs.
2. Bật Email provider và cho phép đăng ký.
3. Để email xác nhận và email đặt lại mật khẩu gửi tới mọi người dùng, cấu hình SMTP riêng. Dịch vụ email mặc định của Supabase giới hạn người nhận và lưu lượng, không dành cho ứng dụng public.
4. Giữ xác nhận email nếu cần xác minh quyền sở hữu email. Nếu chủ dự án chọn tắt xác nhận email, đăng ký có thể sử dụng ngay; chức năng quên mật khẩu vẫn cần SMTP.

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

`tests/database.sql` chạy trong transaction rồi ROLLBACK: kiểm tra RLS với hai người dùng, chống đổi chủ sở hữu, chống khóa ngoại chéo tài khoản, lịch sử hoàn thành nguyên tử, chống trùng khi sửa tên, giữ lịch sử khi xóa mục tiêu, và chặn truy cập ẩn danh. Chạy bằng SQL Editor hoặc công cụ có quyền quản trị trên database kiểm thử.

## Giới hạn chủ ý

- Deadline hiển thị trong ứng dụng; chưa gửi email/push nhắc việc.
- Người khác dùng tài khoản riêng; chưa có chia sẻ công khai hành trình cá nhân.
- Một hành trình 4 năm cho mỗi tài khoản. Các bản ghi ngoài khoảng này vẫn nằm trong mục tiêu/nhật ký, nhưng không xuất hiện trên heatmap.
