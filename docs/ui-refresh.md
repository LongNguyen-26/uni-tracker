# UniTracker — Brief chỉnh UI

Tài liệu này là nguồn duy nhất cho đợt chỉnh giao diện. Đặt tại `docs/ui-refresh.md`.
Mỗi lượt làm việc chỉ nhận **một mục** (A–F). Không đổi logic, dữ liệu, route hay schema.

---

## 0. Nguyên tắc

Vấn đề hiện tại không phải "thiếu nội dung" mà là **chữ bị thu nhỏ trong khi số lượng phần tử vẫn nhiều**. Kết quả: vừa rối (chữ nhỏ xếp cạnh nhau) vừa trống (chrome chiếm chỗ, nội dung không lên được).

Tối giản ở đây nghĩa là: **bớt số phần tử, phóng to phần còn lại.** Không phải bớt chữ và giữ nguyên số phần tử.

Ba quy tắc bất biến cho toàn bộ đợt này:

1. Không có `font-size` nào dưới 13px, trừ nhãn trục biểu đồ (12px).
2. Mỗi thông tin xuất hiện đúng một lần trên một màn hình.
3. Nếu một phần tử không trả lời được câu hỏi "người dùng làm gì với nó", nó bị xoá.

---

## 1. Tokens

Khai báo tập trung (CSS variables hoặc `tailwind.config`), không hardcode rải rác.

### Type scale — chỉ 6 bậc

| Vai trò | size / weight / tracking | Dùng ở đâu |
|---|---|---|
| `page-title` | 30 / 600 / -0.02em | Tiêu đề trang |
| `section` | 19 / 600 / -0.01em | "Tiến trình kỳ học", "Thời gian dành cho điều gì" |
| `card-title` | 16 / 600 | Tên mục tiêu, tên hoạt động |
| `body` | 15 / 400 | Mô tả, nội dung |
| `meta` | 13 / 400 | Ngày, thời lượng, nhãn phụ |
| `axis` | 12 / 500 | **Chỉ** nhãn trục biểu đồ |

Số liệu (giờ, ngày, %) luôn dùng `font-variant-numeric: tabular-nums`.

### Màu chữ — chỉ 3 cấp

```
--ink-900: #14181F   /* chữ chính */
--ink-600: #4A5361   /* chữ phụ, mô tả */
--ink-400: #6B7482   /* meta — không dùng cấp nào nhạt hơn */
```

Mọi màu chữ xám hơn `--ink-400` phải bị thay. Đây là nguyên nhân chính của cảm giác "mờ, rối".

### Nền & viền

```
--bg:        #FFFFFF
--surface:   #F7F8F7   /* nền phụ, hover */
--border:    #E3E6E3   /* viền hairline 1px */
```

Màu thương hiệu (xanh lá hiện tại) **giữ nguyên**, không đổi hue.

### Spacing & radius

- Spacing: chỉ dùng `4 / 8 / 12 / 16 / 24 / 32 / 48`.
- Radius: chỉ 3 giá trị — `10px` (card), `8px` (input, button), `6px` (ô heatmap).
- Card padding: `20px`. Grid gap: `16px`.
- Content max-width: `1160px`. Sidebar: `224px`.

---

## 2. Chrome cần cắt (làm trước tiên, ở tất cả các trang)

Đây là bước rẻ nhất và có tác động lớn nhất. Mỗi mục dưới đây chiếm chỗ mà không mang thông tin:

- **Eyebrow chữ hoa** trên mọi tiêu đề trang: `NHÌN LẠI ĐỂ TIẾN XA HƠN`, `MỖI MỤC TIÊU, MỘT BƯỚC TIẾN`, `Ý ĐỊNH → THỰC TẾ`, `NHỮNG ĐIỀU ĐÁNG NHỚ`. **Xoá hết.**
- **Subtitle lặp ý tiêu đề**: "Biến những dự định thành những điều đã làm được.", "Lưu lại từng ngày bạn đã học hỏi…". **Xoá.**
- **Đuôi `→` trong link text**: "Tạo hành trình →", "Xem tất cả mục tiêu →", "Mở nhật ký →", "Phóng to học kỳ ›". Bỏ mũi tên trong chuỗi văn bản; nếu cần chỉ hướng, dùng icon riêng biệt cạnh nút.
- **Nhãn "Hoạt động" phía trên mỗi dòng nhật ký**: lặp lại hàng trăm lần, không phân biệt được gì. **Xoá**, thay bằng chấm màu mục tiêu.
- **Tagline footer** "Từng chút, mỗi ngày…": giữ tối đa một chỗ trong toàn app.

### Chuỗi meta nối bằng dấu chấm giữa

Dòng `Năm 3 · học kỳ 1 · tuần 6/26 · 52 giờ 45 phút đã ghi · 21 ngày có hoạt động · chuỗi 2 ngày` là ví dụ rõ nhất của "chữ nhỏ xếp cạnh nhau". Đổi thành hàng chỉ số:

```
┌──────────────┬──────────────┬──────────────┐
│ 52g 45p      │ 21           │ 2            │
│ đã ghi kỳ này│ ngày có học  │ ngày liên tục│
└──────────────┴──────────────┴──────────────┘
   số: 22px/600        nhãn: 13px/--ink-400
```

Bối cảnh "Năm 3 · học kỳ 1 · tuần 6/26" chuyển lên breadcrumb hoặc thành một dòng `meta` riêng dưới tiêu đề.

Áp dụng cùng cách cho `199 ngày có mặt · 199 phiên · chuỗi 2 ngày` trong thẻ mục tiêu.

---

## 3. Các mục công việc

### A. Sidebar

**Vấn đề:** 280px chiều rộng cho 3 mục nav cao ~40px, chữ 14px → tỉ lệ khoảng trắng quá lớn, vùng bấm nhỏ.

**Sửa:**
- Thu về `224px`.
- Nav item: cao `44px`, padding `10px 12px`, icon `20px`, chữ `15px/500`, radius `8px`, khoảng cách giữa các item `2px`.
- Trạng thái active: nền xanh nhạt + thanh dọc `3px` bên trái, chữ `--ink-900`.
- Dưới nav, thêm divider rồi một khối **"Hôm nay"**: số giờ đã ghi trong ngày (22px/600) + nút "Bắt đầu phiên" full-width. Lấp khoảng trống bằng chức năng chứ không bằng khoảng trắng.
- Giữ nguyên khối user ở đáy.

**Nghiệm thu:** vùng bấm mỗi nav item ≥ 44px chiều cao; không còn khoảng trắng dọc > 120px liên tục trong sidebar.

---

### B. Chú thích & căn lề của heatmap (trang Hành trình đại học)

**Vấn đề 1 — chú thích:** 8 mục legend nhồi một hàng ở ~11px, cộng thêm một dòng văn xuôi dày đặc (`Màu mục tiêu, đậm theo giờ đã log · Viền đứt: phiên dự định · Dấu góc: hạn đã chốt · Nền dải tuần: khoảng sự kiện…`). Người đọc phải giải mã 12 quy ước trước khi hiểu lưới.

**Sửa:**
- Giữ inline **tối đa 4 mục** hay dùng nhất: Hôm nay, Có deadline, Giờ đã làm, Khoảng sự kiện. Font `13px`, gap `20px`, cho phép xuống dòng (`flex-wrap`), không ép một hàng.
- **Xoá hoàn toàn dòng văn xuôi.** Chuyển toàn bộ quy ước vào popover mở từ icon `ⓘ` cạnh tiêu đề "Tiến trình kỳ học": bảng 2 cột, mỗi dòng là **một ô mẫu 18px vẽ đúng style thật** + mô tả `14px`. Vẽ ô mẫu, đừng mô tả bằng lời.
- Thêm tooltip khi hover từng ô trong lưới: ngày, tổng giờ, danh sách mục tiêu, deadline nếu có. Đây mới là "chú thích" đúng nghĩa; legend chỉ còn là dự phòng.

**Vấn đề 2 — lệch:** nhãn tháng (Th8, Th9…) không thẳng cột đầu của tháng; nhãn thứ (T2…CN) không trùng tâm hàng ô.

**Sửa:**
- Khai báo `--cell: 16px; --cell-gap: 4px` (view kỳ) và `--cell: 11px` (view 4 năm). Mọi tính toán vị trí đều dẫn xuất từ hai biến này.
- Nhãn tháng render **trong cùng CSS grid** với các cột tuần, dùng `grid-column-start = index tuần chứa ngày 1 của tháng`, `justify-self: start`. Không dùng `position: absolute` hay `%` — đó là nguyên nhân lệch.
- Nhãn thứ: `height: var(--cell); line-height: var(--cell)` để tâm chữ trùng tâm ô.
- Tăng ô ở view kỳ từ ~14px lên `16px` — lưới hiện chưa dùng hết chiều ngang.

**Nghiệm thu:** ở mọi độ rộng cửa sổ từ 1280px trở lên, cạnh trái của nhãn "Th9" trùng cạnh trái của ô ngày 01/09 (sai số 0px); không còn `font-size` < 13px trong component legend.

---

### C. Bộ chọn tuần (trang Tuần & phiên học)

**Vấn đề:** label "Tuần bắt đầu" chỉ nằm trên ô input, khiến hai mũi tên `‹ ›`, chuỗi `— 13/09/2026` và link "Tuần này" bị lệch trục so với input.

**Sửa:** gộp thành một hàng duy nhất cao `40px`, `align-items: center`:

```
[ ‹ ] [ 📅 Tuần 07/09 – 13/09/2026  ▾ ] [ › ]   [ Tuần này ]
 40px            auto, radius 8px          40px    nút ghost 40px
```

- Bỏ label "Tuần bắt đầu" (nội dung đã tự nói).
- Gộp cả khoảng ngày vào trong ô, bỏ chuỗi `— 13/09/2026` rời bên ngoài.
- Hai chevron thành nút vuông `40×40`, cùng border và radius với input.
- "Tuần này" thành nút ghost cao `40px`, không phải text link lơ lửng.

**Nghiệm thu:** tất cả phần tử trong hàng có `height: 40px` và cùng một baseline.

---

### D. Lưới lịch tuần trống (trang Tuần & phiên học)

**Vấn đề:** trục 06:00–23:00 luôn render đầy đủ dù tuần chưa có phiên nào → ~700px chiều cao trống trơn. Đây là nguồn chính của cảm giác "trống".

**Sửa:**
- **Tự co trục giờ:** mặc định hiển thị từ (giờ sớm nhất có sự kiện − 1h) đến (muộn nhất + 1h), tối thiểu 08:00–20:00. Thêm nút "Hiện 24 giờ".
- **Empty state có hành động:** khi tuần chưa có phiên nào, thay lưới rỗng bằng khối trong lòng lưới: "4 hoạt động chưa được xếp giờ" + nút "Xếp vào khoảng trống". Màn hình trống là một lời mời hành động, không phải một cái hố.
- **Chuyển khối "Chưa xếp giờ" thành cột phải `260px`** đặt cạnh lưới thay vì nằm dưới. Vừa lấp khoảng trống ngang, vừa làm rõ thao tác kéo-thả vào lưới.
- Khối "Quỹ giờ theo mục tiêu": 8 dòng đang dùng chuỗi `Quỹ tuần 0 phút · thực làm 2 giờ · còn lại 0 phút` — cùng lỗi chuỗi meta. Đổi thành bảng 4 cột có header (Mục tiêu | Quỹ | Thực làm | Còn lại), số canh phải, `tabular-nums`.

**Nghiệm thu:** với tuần rỗng, chiều cao vùng lịch ≤ 420px và trong đó có ít nhất một nút hành động.

---

### E. Nhật ký hoạt động

**Vấn đề:** thẻ chiếm toàn bộ chiều rộng nhưng nội dung chỉ nằm ở ~40% bên trái → khoảng trắng chết chạy suốt danh sách. Mỗi mục lại có nhãn "Hoạt động" thừa và metadata 11px.

**Sửa:** đổi thẻ thành **một hàng**, dùng hết chiều ngang:

```
● Luyện IELTS Listening & Reading                          45 phút   ✎ 🗑
  Chinh phục IELTS 7.0
│ │                                                        │         │
chấm  tên 16px/600 + mục tiêu 13px --ink-400          15px tabular  hiện khi hover
màu
```

- Xoá nhãn "Hoạt động".
- Thời lượng canh phải, `tabular-nums`, `15px` — đây là con số người dùng quét nhanh nhất.
- Nút sửa/xoá chỉ hiện khi hover hoặc focus; vùng bấm `32×32`.
- Header nhóm ngày: `sticky`, `13px`, kèm **tổng giờ của ngày đó canh phải** — thông tin mới, không phải trang trí.
- Bỏ khung viền từng thẻ, chỉ dùng divider `1px --border` giữa các dòng. Hiện tại 999 khung bo tròn giống hệt nhau là nhiễu thị giác.

**Nghiệm thu:** không còn vùng trắng ngang > 200px giữa nội dung và mép phải của một dòng nhật ký.

---

### F. Trang Mục tiêu

- Hàng cuối đang hụt một ô (8 thẻ / 3 cột): thêm thẻ **"Thêm mục tiêu"** viền đứt làm ô cuối — vừa lấp chỗ vừa hữu dụng.
- Trong thẻ, đổi `199 ngày có mặt · 199 phiên · chuỗi 2 ngày` thành 3 chỉ số nhỏ có nhãn dưới số (xem mục 2).
- Thống nhất chiều cao thẻ trong cùng hàng (`align-items: stretch`), đẩy khối nút xuống đáy thẻ bằng `margin-top: auto`.
- Thẻ chưa có dữ liệu ("Chưa ghi giờ nào") hiện cao bằng thẻ có dữ liệu nhưng rỗng ruột → thay bằng nội dung ngắn hơn và để thẻ thấp hơn, hoặc thêm gợi ý hành động.

---

## 4. Cách làm việc

- Một lượt = một mục (A–F). Không gộp.
- Trước khi sửa: liệt kê file + số dòng sẽ đụng, chờ duyệt.
- Không thêm thư viện mới. Không đổi màu thương hiệu. Không thêm animation. Không đổi route, schema, hay logic tính toán.
- Sau khi sửa, tự kiểm bằng grep và dán kết quả:
  ```
  rg "text-\[1[012]px\]|font-size:\s*1[012]px|text-\[11px\]" src/
  rg "text-xs" src/          # đối chiếu từng chỗ còn lại có chính đáng không
  ```
- Không tự ý "cải thiện thêm" ngoài phạm vi mục đang làm.
