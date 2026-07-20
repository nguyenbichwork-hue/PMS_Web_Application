# 📓 Nhật ký thay đổi — Hệ thống Quản lý Mua hàng (PMS)

> Ghi lại mọi thứ ĐÃ THÊM / ĐÃ SỬA. Mới nhất ở trên cùng.

---

## Phiên 18/07/2026

### ✅ Đã sửa (fix)
1. **Lỗi duyệt PR "không duyệt được"** — nguyên nhân: PGlite báo `inconsistent types deduced for parameter $2` ở câu UPDATE khóa-lạc-quan trong `src/actions/pr.ts` (tham số `$2` dùng ở 2 ngữ cảnh kiểu). **Fix:** ép kiểu `::int`. Đã kiểm chứng duyệt 1/2/3 cấp đều chạy + PO tự sinh.
2. **Nút menu (drawer mobile) mở ra bị lỗi** — header `.glass` dùng `backdrop-filter` biến nó thành containing block, nhốt drawer `position:fixed`. **Fix:** `createPortal` drawer ra `document.body` (`src/components/MobileMenu.tsx`).
3. **Lỗi file PDF (tiếng Việt bị vỡ ký tự)** — jsPDF dùng font `helvetica` không hỗ trợ Unicode tiếng Việt. **Fix:** bỏ jsPDF, chuyển sang **trang in HTML** `/(print)/purchase-order/[id]` (font hệ thống → tiếng Việt chuẩn), nút "Xuất PDF / In" mở trang này và tự bật hộp thoại in để lưu PDF. Xóa `src/lib/pdf.ts`.

### ✅ Đã thêm (feature)
1. **Trang đăng nhập mới** — logo K-Homès (SVG), nền blur mềm + thẻ kính mờ (`src/app/login/*`, `src/components/KHomesLogo.tsx`).
2. **Responsive điện thoại toàn app** — thẻ viewport, Sidebar → drawer hamburger, header co gọn, bảng cuộn ngang, padding co theo màn hình.
3. **Nhập dữ liệu từ Excel** (Cấu hình → Nhập Excel, chỉ Admin) — nạp 6 nhóm master (Công ty, Phòng ban, Người dùng, NCC, Hàng hóa, Hạn mức duyệt) theo mẫu `08_Du_Lieu_Can_Chuan_Bi.xlsx`; **upsert** (trùng mã/email → cập nhật, không xóa). Files: `src/lib/import-excel.ts`, `src/actions/import.ts`. Đã thêm dependency `exceljs`.
4. **Bộ icon SVG** (`src/components/icons.tsx`) thay emoji ở menu + tab Cấu hình.
5. **Đổi màu giao diện (Admin)** — Cấu hình → Giao diện: 6 tông màu (Tím/Xanh dương/Xanh lá/Xanh ngọc/Hồng đỏ/Vàng cam), đổi ngay + lưu localStorage. Cơ chế override biến `--color-brand-*` theo `data-accent` (`src/components/AccentPicker.tsx`, `globals.css`).

### ✅ Đã thêm (đợt "làm hết")
6. **Trang "Việc của tôi" + chuông thông báo** — gom chứng từ đang chờ hành động theo vai trò + phân quyền công ty (PR chờ bạn duyệt, PO nháp cần duyệt, PO cần gửi NCC, PO đã nhận chưa có hóa đơn, hóa đơn chờ đối chiếu/chờ thanh toán). Chuông ở header hiện số việc; mục "Việc của tôi" trên sidebar. Files: `src/lib/tasks.ts`, `src/app/(app)/my-tasks/page.tsx`.

7. **Tìm kiếm toàn cục (Ctrl+K)** — command palette tìm nhanh PR/PO/hóa đơn/GR/NCC/hàng hóa theo số hoặc tên (có phân quyền công ty & Employee), điều hướng bằng ↑↓/Enter. Ô tìm kiếm ở header. Files: `src/actions/search.ts`, `src/components/CommandPalette.tsx`.

8. **Xuất Excel danh sách** — nút "⬇ Excel" trên 4 trang (Yêu cầu mua, Đơn đặt hàng, Nhận hàng, Hóa đơn); xuất theo đúng bộ lọc đang xem + phân quyền công ty. Route `src/app/export/[type]/route.ts` (dùng exceljs).

9. **Thanh toán nhiều đợt (bảng `payments`)** — bảng `payments` mới; 1 hóa đơn trả được nhiều đợt (ngày/số tiền/phương thức/tham chiếu). Panel hiển thị đã trả · còn lại · lịch sử + thanh tiến độ; nút "Ghi nhận" (1 đợt) và "Trả hết". Tự chuyển hóa đơn sang **Paid** khi trả đủ. Files: `payments` trong `migrations.sql`, `addPaymentAction`/`markInvoicePaidAction` trong `src/actions/invoice.ts`, `PaymentPanel.tsx`. **Đã kiểm thử 5/5** (trả từng đợt, tự Paid, chặn trả dư). *(Đã restart dev để tạo bảng.)*

10. **Nhận hàng từng phần + nhiều hóa đơn/PO** — PO thêm trạng thái **"Nhận một phần"** (đổi CHECK constraint qua migration); GR cộng dồn số đã nhận, đủ → "Đã nhận hàng", thiếu → "Nhận một phần"; PO nhận một phần vẫn nhận tiếp & nhập hóa đơn được. **Đối chiếu nhiều hóa đơn**: hóa đơn sau **trừ số đã xuất hóa đơn trước** (chống xuất vượt) + kỳ vọng tính theo tỷ lệ cho hóa đơn từng phần. Files: `migrations.sql`, `src/actions/gr.ts`, `src/actions/invoice.ts`, `matching.ts` (đầu vào), UI badge trạng thái, lọc PO ở trang tạo GR/hóa đơn. **Đã kiểm thử 7/7**. *(Đã restart dev để đổi constraint.)*
11. **Badge nhắc hạn** — PR quá "ngày cần" (khi chờ duyệt/nháp) và PO quá "ngày giao" (khi chưa nhận đủ) hiện badge đỏ "Trễ Nn" / cam "Còn Nn" ngay trên danh sách. `DueBadge` trong `ui.tsx`.
12. **Phân trang** — 4 danh sách (PR/PO/GR/HĐ) phân trang 20 dòng/trang, giữ nguyên bộ lọc, đếm tổng chính xác. `src/components/Pagination.tsx`.

13. **Hướng dẫn sử dụng chi tiết** — tài liệu `HUONG_DAN_SU_DUNG.md` (14 mục, phủ toàn bộ tính năng) + mở rộng **trang `/huong-dan` trong app** (thêm mục Việc của tôi, Tìm kiếm Ctrl+K, Nhận từng phần, Thanh toán nhiều đợt, Xuất/Nhập Excel, Cấu hình, Điện thoại; cập nhật Xuất PDF/In & đối chiếu nhiều hóa đơn).

### 🎉 Hoàn tất toàn bộ yêu cầu "làm hết" (Fix PDF + 4 tính năng lớn + gói UX + hướng dẫn). Mọi bước tsc sạch + test riêng.

**Gợi ý làm tiếp (nếu muốn):** form GR hiển thị số CÒN LẠI mỗi dòng khi nhận một phần; nhắc hạn thanh toán theo `payment_term`; đồng bộ MISA thật (đang mock).

---

## Phiên 19/07/2026 — tinh chỉnh giao diện

14. **Bỏ nội dung kỹ thuật khỏi hướng dẫn người dùng** — gỡ mọi tham chiếu `localhost` / IP / cổng 3000 / tường lửa trong `HUONG_DAN_SU_DUNG.md` và trang `/huong-dan` (hướng dẫn chỉ nói cách DÙNG, không nói cách chạy/host).
15. **Phóng to nhẹ font hệ thống** — đặt `html { font-size: 17px }` trong `globals.css` (mặc định 16px). Vì Tailwind dùng rem, chữ + khoảng cách + thành phần đều to lên cân đối.
16. **Đổi vị trí thanh sidebar sang BÊN PHẢI** — `src/app/(app)/layout.tsx`: đưa `<Sidebar/>` xuống cuối flex row; chuyển nút hamburger sang cụm phải của header; `MobileMenu` drawer trượt từ **phải**; thanh chỉ báo mục đang chọn đổi sang cạnh phải. tsc sạch, dashboard 200 (DOM: `<main>` trước `<aside>`).
17. **Trả sidebar về BÊN TRÁI + nâng cấp thẩm mỹ (phong cách app lớn)** — `Sidebar.tsx` thiết kế lại: **workspace header** (logo K-Homès + tên), nav tinh gọn (pill active `bg-white/10 ring`, icon active sáng `brand-300`, hover mượt, nhãn nhóm nhỏ mờ), và **khối hồ sơ người dùng ở đáy** (avatar + tên + vai trò·phòng ban). **Header gọn lại**: bỏ tên/avatar/chip vai trò trùng lặp (đã chuyển vào sidebar), chỉ còn Tìm kiếm · chuông · Sáng/Tối · Đăng xuất. `MobileMenu`/`Sidebar` nhận prop `user`; drawer mobile trượt lại từ **trái**. tsc sạch, dashboard 200 (DOM: `<aside>` trước `<main>`).
18. **Login như app thật + tài khoản thử lưu trong RAM trình duyệt** — `LoginForm.tsx`: bỏ dòng "mật khẩu demo: password" và lưới tài khoản công khai; ô email/mật khẩu **để trống + placeholder** (không lộ thông tin). Danh sách tài khoản thử được nạp vào **`sessionStorage` (RAM phiên trình duyệt)** khi truy cập (tự xóa khi đóng tab). Thêm nút **"Tài khoản thử" kín đáo** (ẩn mặc định) để tự điền nhanh email+mật khẩu khi cần. *(Bước làm xác thực thật — Supabase — để đợt sau.)*

---

## Phiên 19/07/2026 — bảo mật

19. **Chống brute-force đăng nhập** — `src/lib/ratelimit.ts` + `loginAction`: sai 5 lần/15 phút theo IP → **khóa tạm 15 phút** (báo lỗi kèm thời gian). **Đã kiểm thử 11/11.**
20. **Rate-limit chống flood/DDoS tầng ứng dụng** — `src/middleware.ts`: giới hạn theo IP (ghi 60/phút, đọc 600/phút) → trả **429 + Retry-After** khi vượt. **Đã test thật** (bắn 65 POST → xuất hiện 429). *(DDoS thể tích thật cần thêm hạ tầng Cloudflare/WAF.)*
21. **Security headers (chống XSS/tiêm mã, clickjacking, MIME-sniffing)** — `next.config.mjs`: **CSP** (`default-src 'self'`, `object-src 'none'`, `base-uri/form-action 'self'`, `frame-ancestors 'none'`; dev cho `unsafe-eval`/`ws:` cho HMR), **X-Frame-Options: DENY**, **X-Content-Type-Options: nosniff**, **Referrer-Policy**, **Permissions-Policy**, HSTS (production). Đã verify headers có mặt & app không vỡ.
22. **Nhật ký đăng nhập** — `loginAction`/`logoutAction` ghi vào `audit_log`: **Login / Logout / LoginFailed** kèm **IP** và người thực hiện. Xem ở Cấu hình → **Nhật ký** (Admin).
23. **SQL Injection** — xác nhận toàn bộ truy vấn dùng **tham số hóa** (`$1..$n`); phần WHERE động chỉ ghép mảnh SQL cố định + số thứ tự placeholder, KHÔNG nối giá trị người dùng. **XSS**: React tự escape mọi dữ liệu render; không có `dangerouslySetInnerHTML` với dữ liệu người dùng (chỉ 1 script theme tĩnh) + CSP phòng thủ nhiều lớp.

**Khuyến nghị nâng cấp production:** dùng **nonce cho CSP script** (thay `'unsafe-inline'`), hash mật khẩu + Supabase Auth, chạy sau reverse-proxy có WAF/DDoS (Cloudflare), bật cookie `Secure`, `npm audit` định kỳ để vá CVE phụ thuộc.

24. **Xem nhật ký REALTIME (chỉ Admin)** — tab Cấu hình → **Nhật ký** tự động làm mới mỗi 4 giây (poll `fetchAuditAction`, gate `settings.manage`), có đèn **"Trực tiếp · HH:MM:SS"** + nút **Tạm dừng**. Chip hành động tô màu theo loại (Login xanh / LoginFailed đỏ / Logout xám). Sự kiện đăng nhập hiện ngay khi xảy ra. Files: `fetchAuditAction` trong `src/actions/admin.ts`, `AuditPanel` trong `SettingsTabs.tsx`.

26. **Tài liệu bàn giao** — `BAN_GIAO_2026-07-19.md`: trạng thái mới nhất, cách chạy, tài khoản, bản đồ code, bảo mật, dữ liệu test, **gotchas quan trọng** (orphan dev process, migration cần restart, `::int`, backdrop-filter portal…), việc còn lại. Bổ trợ cho `NHAT_KY_THAY_DOI.md` + `HUONG_DAN_SU_DUNG.md` + bàn giao cũ 17/07.

25. **Nạp nhiều dữ liệu thật để kiểm thử** — `seedMoreData` (idempotent, `src/lib/seed.ts`, gọi trong `db.ts`): thêm **8 NCC** (Dell/HP/Logitech-An Phát/Samsung/Panasonic/FPT/Daikin/Hòa Phát) + **16 thiết bị** (laptop, màn hình, máy in, webcam, máy chiếu, máy lạnh, SSD, switch, ghế/bàn công thái học, UPS…) + **13 chuỗi mua sắm** đủ trạng thái (paid / trả một phần / đã nhận / nhận một phần / đã gửi / đã duyệt / chờ duyệt / nháp) trên 3 công ty. Kết quả: **10 NCC · 19 hàng hóa · 20 PR · 15 PO** (xác nhận không nhân đôi). Bọc `try/catch` khi seed để không sập app; đã **db:reset** nạp lại sạch trên **1 tiến trình duy nhất** (tránh race làm trùng khóa).
