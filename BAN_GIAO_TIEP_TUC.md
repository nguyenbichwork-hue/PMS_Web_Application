# 📋 BÀN GIAO — Hệ thống Quản lý Mua hàng (PMS / PR–PO)

> File này gom **toàn bộ những gì đã làm từ đầu tới giờ** + trạng thái hiện tại + cách chạy + việc còn lại.
> Mục đích: mang về nhà mở lại và **tiếp tục làm việc với Claude** mà không mất mạch.
> Cập nhật: 17/07/2026.

---

## 0. Cách "tái sử dụng Claude" ở nhà (đọc trước)

Bộ nhớ (`memory/`) của Claude nằm trong hồ sơ máy hiện tại nên **KHÔNG đi theo** về nhà. File này thay thế cho việc đó.
Khi mở lại ở nhà, chỉ cần nói với Claude đại ý:

> "Đọc file `BAN_GIAO_TIEP_TUC.md` trong thư mục dự án để nắm bối cảnh rồi tiếp tục."

Claude sẽ đọc file này + đọc code là đủ để làm tiếp.

---

## 1. Đây là gì

Web app **MVP quản lý mua hàng** chạy được **end-to-end**, không phải mockup. Luồng nghiệp vụ đầy đủ:

```
Yêu cầu mua (PR) → Phê duyệt nhiều cấp → Đơn đặt hàng (PO) tự sinh
   → Gửi/Xác nhận NCC → Nhận hàng (GR) → Hóa đơn → Đối chiếu 3 chiều → (Thanh toán)
```

Kèm: dashboard biểu đồ, danh mục NCC/Hàng hóa, phân quyền 5 vai trò, nhật ký hệ thống, đính kèm tài liệu, xuất PDF cho PO, chế độ Sáng/Tối, 100% tiếng Việt.

## 2. Công nghệ

| Thành phần | Chọn dùng | Ghi chú |
|---|---|---|
| Framework | **Next.js 15.5.4** (App Router) + React 19 | Server Components + Server Actions (không có REST riêng) |
| Ngôn ngữ | TypeScript 5.7 (strict) | |
| Giao diện | TailwindCSS v4 (`@theme`, dark mode theo class) + Recharts | Tông tím/chàm gradient |
| **CSDL** | **PGlite 0.2** (PostgreSQL 16 nhúng, chạy trong tiến trình, **không cần cài DB ngoài**) | Lưu ở thư mục `.pglite/`. Lên production đổi sang PostgreSQL/Supabase bằng cách thay `src/lib/db.ts` |
| Đăng nhập | Cookie phiên **ký HMAC-SHA256** | Secret ở env `PMS_SESSION_SECRET` (mặc định dev: `pms-local-dev-secret-change-me`) |
| PDF / Excel / Word | jsPDF · exceljs · docx | exceljs/docx cài tạm bằng `--no-save` khi chạy script sinh file |

## 3. Cách chạy (ở nhà)

```bash
cd <thư mục dự án>
npm install            # cài dependencies
npm run dev            # chạy dev → http://localhost:3000
# hoặc kiểm bản production:
npm run build && npm start
```

**Tài khoản demo** (mật khẩu chung: `password`) — trang login có nút bấm-để-điền sẵn:

| Vai trò | Email | Làm được gì |
|---|---|---|
| Nhân viên | `employee@demo.com` | Tạo yêu cầu mua |
| Mua hàng | `purchasing@demo.com` | Làm PO, nhận hàng, quản lý NCC/hàng hóa |
| Quản lý | `manager@demo.com` | Duyệt yêu cầu mua |
| Kế toán | `finance@demo.com` | Nhập hóa đơn, đối chiếu, thanh toán |
| Quản trị | `admin@demo.com` | Quản lý người dùng + cấu hình |

> Tất cả dữ liệu demo thuộc công ty **K-Homès**. Có sẵn PR/PO/Hóa đơn mẫu (3 khớp, 1 sai số lượng, 1 sai giá) để test đối chiếu.
> **Reset dữ liệu**: `npm run db:reset` (xóa `.pglite`, seed lại).

## 4. Web đang ở mức độ nào

**Mức: MVP hoàn chỉnh, chạy tốt LOCAL để nghiệm thu — CHƯA sẵn sàng deploy internet.**

| Hạng mục | Trạng thái |
|---|---|
| Luồng nghiệp vụ lõi (PR→PO→GR→Invoice→Matching) | ✅ Chạy end-to-end |
| Phân quyền 5 vai trò + chặn IDOR (lọc theo công ty) | ✅ |
| Phê duyệt nhiều cấp theo hạn mức + chống duyệt trùng (khóa lạc quan) | ✅ |
| Đối chiếu 3–4 chiều (NCC/SL/Giá theo dòng/VAT) | ✅ |
| Giao dịch (transaction) bọc các chuỗi ghi + nhật ký (audit log) | ✅ |
| Đính kèm tài liệu (tải lên/tải xuống) | ✅ (tải xuống đã test byte-khớp; **tải lên cần bấm thử trên trình duyệt**) |
| Sáng/Tối, tiếng Việt, dashboard, tìm/lọc, PDF | ✅ |
| Mượt khi chuyển trang/tab/lọc/theme | ✅ (đợt tối ưu mới nhất) |
| Bảo mật deploy (hash mật khẩu, HTTPS, RLS, rate-limit) | ⛔ Chưa — để khi deploy |
| CSDL thật (PostgreSQL/Supabase) thay PGlite | ⛔ Chưa — để khi deploy |

**Kiểm thử tự động (đã xanh):**
- `node scripts/full-verify.mjs` → **20/20** (toàn bộ đường SQL nghiệp vụ trên DB độc lập).
- `node --experimental-strip-types scripts/matching-test.ts` → **7/7** (engine đối chiếu).
- `node scripts/flow-test.mjs` → 7/7 (luồng cơ bản).
- `npm run build` → **20/20 route** biên dịch sạch; `npx tsc --noEmit` → 0 lỗi.

## 5. Những việc ĐÃ LÀM (theo thứ tự thời gian)

1. **Dựng MVP** toàn bộ hệ thống + seed dữ liệu demo (công ty K-Homès/WellHome/Peaki, NCC Bosch, 3 hàng hóa, 5 PR/PO/Invoice mẫu).
2. **4 tài liệu docx** (luồng dữ liệu, cơ cấu vận hành, hướng dẫn dùng, cấu trúc app) trong `F:\CompanyTask\Note_PR_PO_Project`.
3. **Làm mới UI** phong cách gradient tím/chàm, 100% tiếng Việt, error boundary, validation phía server.
4. **Đổi bố cục** chống các trang giống nhau (ModuleBanner theo tông màu từng module, list NCC/Hàng hóa dạng lưới thẻ) + **báo cáo Audit** (docx).
5. **Audit → sửa 3 lỗi 🔴 nghiêm trọng**: (a) cookie phiên giả mạo → **ký HMAC**; (b) check "Nhà cung cấp" vô hiệu → form hóa đơn chọn NCC thật + đối chiếu **giá theo từng dòng** + kiểm **VAT**; (c) **IDOR** → lọc dữ liệu theo `company_id`/vai trò ở mọi trang. Thêm transaction + audit log + hủy/xác nhận PO.
6. **Hoàn thiện tính năng + UX**: đính kèm tài liệu thật; chế độ Sáng/Tối; trang Hướng dẫn trong web (`/huong-dan`); Cài đặt bố cục 4 tab (Luồng duyệt/Người dùng/Công ty/Nhật ký) với sửa user & hạn mức duyệt runtime.
7. **Kiểm thử toàn diện** (mục 4) + xác minh tải file đính kèm end-to-end.
8. **Đối chiếu mẫu PO kế toán thật** của sếp (`[2026]_Purchase Order.xlsx`, 34 trường) → thêm 2 sheet vào file dữ liệu gửi sếp.
9. **File gửi sếp**: Excel dữ liệu cần chuẩn bị + Word checklist 1 trang.
10. **Tối ưu mượt "chuyển đổi qua lại"** (mới nhất): thanh tiến trình điều hướng, skeleton chờ, chuyển trang fade, spinner trên mục sidebar vừa bấm, đổi theme mượt, filter debounce + không nhảy trang + báo "đang lọc", nhớ tab Cài đặt qua URL.

## 6. Tài liệu đã bàn giao (thư mục `F:\CompanyTask\Note_PR_PO_Project`)

| File | Nội dung |
|---|---|
| `01_Luong_Du_Lieu.docx` … `04_Cau_Truc_App.docx` | Luồng dữ liệu · cơ cấu vận hành · hướng dẫn dùng · cấu trúc app |
| `05_Lo_Trinh_Production.docx` | Lộ trình đưa lên production (đọc để biết việc deploy) |
| `06_Technical_Audit_Report.docx` | Báo cáo audit kỹ thuật |
| `07_Chuan_Bi_Production.xlsx` | Bản **kỹ thuật**: env/keys/hạ tầng (có placeholder rỗng, KHÔNG chứa secret) |
| **`08_Du_Lieu_Can_Chuan_Bi.xlsx`** | **Gửi sếp**: 6 sheet dữ liệu nghiệp vụ (dòng mẫu + dropdown) + sheet 07 đối chiếu mẫu PO kế toán + sheet 08 danh mục mã kế toán |
| **`09_Checklist_Du_Lieu_Gui_Sep.docx`** | **Gửi sếp**: checklist 1 trang, 3 nhóm ưu tiên, giải thích 5 vai trò |
| `[2026]_Purchase Order.xlsx` | Mẫu PO kế toán gốc của sếp (nguồn để đối chiếu) |

**Dữ liệu sếp cần gửi để test** (tóm tắt): Nhóm 1 bắt buộc = Công ty · Phòng ban · Người dùng+vai trò · NCC · Hàng hóa. Nhóm 2 = chốt hạn mức duyệt. Nhóm 3 (mã kế toán) = chỉ cần khi nối phần mềm kế toán.

## 7. Bản đồ code (file quan trọng)

```
src/
├─ lib/
│  ├─ db.ts            # PGlite singleton; chạy schema.sql → migrations.sql → seed()
│  ├─ schema.sql       # 18 bảng
│  ├─ migrations.sql   # thêm cột/bảng (idempotent) — CHẠY LÚC KHỞI ĐỘNG
│  ├─ seed.ts          # dữ liệu demo (guard: có công ty rồi thì bỏ qua)
│  ├─ auth.ts          # login(), cookie ký HMAC, ma trận quyền can()
│  ├─ access.ts        # pushCompanyScope() chống IDOR
│  ├─ matching.ts      # engine đối chiếu 3–4 chiều (logic thuần)
│  ├─ po-generate.ts   # sinh PO từ PR (nhận executor để chạy trong transaction)
│  ├─ storage.ts       # lưu file ./storage (đổi sang Supabase Storage khi deploy)
│  └─ audit.ts         # logAudit()
├─ actions/            # Server Actions: pr, po, invoice, attachment, admin, auth
├─ app/
│  ├─ (app)/           # layout + các trang: dashboard, purchase-requests, purchase-orders,
│  │                   #   goods-receipts, invoices, suppliers, products, settings, huong-dan
│  │  ├─ layout.tsx    # gắn NavProgress + PageTransition + Sidebar + ThemeToggle
│  │  └─ loading.tsx   # skeleton chờ dùng chung
│  ├─ api/attachments/[id]/route.ts   # tải file (có kiểm đăng nhập)
│  └─ login/           # trang đăng nhập + nút tài khoản demo
└─ components/
   ├─ Sidebar.tsx      # điều hướng (có spinner useLinkStatus trên mục vừa bấm)
   ├─ NavProgress.tsx  # thanh tiến trình đỉnh trang
   ├─ PageTransition.tsx # fade khi chuyển trang
   ├─ Filters.tsx      # tìm/lọc (debounce, không nhảy trang)
   ├─ ThemeToggle.tsx  # nút Sáng/Tối
   ├─ AttachmentPanel.tsx, module.tsx, ui.tsx
   └─ ...
scripts/               # test + sinh tài liệu (xem mục 4 & 6)
```

## 8. Việc CÒN LẠI (gợi ý làm tiếp)

**Có thể làm ngay ở local (nghiệp vụ Phase 2):**
- Nhận hàng / hóa đơn **từng phần** (partial GR & nhiều hóa đơn cho 1 PO).
- Thực thể **Thanh toán** (Payment) riêng.
- Hạn mức duyệt theo **công ty/phòng ban/nhóm hàng** (hiện chỉ theo giá trị).
- Chuẩn hóa `department` → khóa ngoại `business_units`.
- **Phân trang** danh sách.
- Nếu muốn **xuất PO đủ 34 cột** cho phần mềm kế toán: thêm trường BU trên PO, Mã kho, Mã đơn vị, Mã đối tượng THCP, Mã công trình (xem sheet 07 file 08).

**Chỉ làm khi deploy (không cần cho test):**
- **Hash mật khẩu** + Supabase Auth (hiện lưu plaintext, chỉ để demo).
- Chuyển **PGlite → PostgreSQL/Supabase** (đổi `db.ts`) + RLS.
- HTTPS, security headers, rate-limit, backup, email thật (Resend), lưu PDF phía server, Sentry/CI.

## 9. ⚠️ Lưu ý quan trọng (gotchas — đọc kỹ)

1. **Migration chỉ chạy khi KHỞI ĐỘNG LẠI server** (PGlite là singleton toàn cục, sống qua HMR). Sửa `migrations.sql`/`schema.sql` xong phải **restart** `npm run dev`.
2. **Chỉ 1 tiến trình được mở `.pglite` cùng lúc.** Đừng chạy script node đụng DB trong khi dev đang chạy → tranh chấp lock. Dừng dev trước.
3. **Cookie phiên đã ký HMAC.** Muốn test route bằng curl phải tạo cookie ký:
   `node -e "console.log('5.'+require('crypto').createHmac('sha256','pms-local-dev-secret-change-me').update('5').digest('base64url'))"` → dùng `-b "pms_session=<kết quả>"` (5 = id Admin).
4. **Đọc-ghi lại file .xlsx bằng exceljs làm RỚT dropdown/dòng-trống-định-dạng-sẵn.** Muốn sửa file Excel gửi sếp → sửa trong **generator** (`scripts/gen-boss-data-xlsx.mjs`) rồi chạy lại, ĐỪNG mở-ghi-đè trực tiếp.
5. **Tải LÊN file đính kèm** dùng inline server action (không có progressive-enhancement) → **không test bằng curl được**, phải bấm thử trong trình duyệt. (Nửa tải-xuống đã verify.)
6. **BẢO MẬT:** file `F:\CompanyTask\BANGIAO_K-HR_2026-07-15\...\CREDENTIALS.md` chứa **secret THẬT của dự án K-HR khác** — chỉ mượn CẤU TRÚC, **tuyệt đối không copy giá trị** vào dự án PMS. Khi cần key production thì hỏi để được gửi, đừng bịa. Không commit file secret lên GitHub.
7. Chạy file test `.ts`: `node --experimental-strip-types scripts/matching-test.ts` (tsconfig đã `exclude` thư mục `scripts`).

---

*Hết. Mọi thứ trong file này + code là đủ để tiếp tục. Chúc anh làm việc vui ở nhà!*
