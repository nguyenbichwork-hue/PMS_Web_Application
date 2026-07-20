# Purchase Management System (PMS) — MVP

Số hóa toàn bộ quy trình mua hàng, chạy được **end-to-end** ngay trên máy local:

```
PR  →  Approval (multi-level, configurable)  →  PO (auto-generated)
    →  Goods Receipt  →  Invoice  →  3-way Matching  →  Payment
```

Một hệ thống workflow thật (database, trạng thái, phân quyền, kiểm tra dữ liệu) — không phải form PO đơn giản.

---

## 1. Chạy nhanh

```bash
npm install
npm run dev
```

Mở http://localhost:3000 → tự chuyển tới trang đăng nhập.

> Lần chạy đầu tiên hệ thống tự tạo schema + nạp dữ liệu demo (mất vài giây).

### Tài khoản demo (mật khẩu: `password`)

| Role       | Email                | Quyền chính                                  |
|------------|----------------------|----------------------------------------------|
| Employee   | employee@demo.com    | Tạo PR, xem PR của mình                        |
| Purchasing | purchasing@demo.com  | Convert PR→PO, quản lý NCC/hàng hóa, gửi PO    |
| Manager    | manager@demo.com     | Duyệt / từ chối PR                             |
| Finance    | finance@demo.com     | Nhập Invoice, kiểm tra matching, thanh toán    |
| Admin      | admin@demo.com       | Quản lý user, master data, cấu hình workflow   |

Reset dữ liệu demo: dừng server rồi chạy `npm run db:reset`.

---

## 2. Kịch bản demo end-to-end (5 phút)

1. **Manager** đăng nhập → mở PR `PR-2026-0006` (Pending Approval) → **Duyệt**.
   → PR nhỏ (<20 triệu) chỉ cần Manager → PR chuyển **Approved** và **PO tự động được tạo**.
2. **Purchasing** đăng nhập → mở PO vừa sinh → điều chỉnh giá / ngày giao (được ghi **lịch sử điều chỉnh**) → **Duyệt PO** → **Download PDF** / **Send Email Supplier**.
3. **Purchasing/Finance** → **Goods Receipt** → tạo GR, nhập số lượng thực nhận.
4. **Finance** → **Invoice** → nhập hóa đơn cho PO → hệ thống **tự đối chiếu 4 bước** và hiện kết quả.
5. Xem **Dashboard**: cards + biểu đồ (theo tháng / NCC / công ty).

### Dữ liệu matching có sẵn (Invoice module)

| Invoice        | Kịch bản              | Kết quả  |
|----------------|-----------------------|----------|
| INV-BOSCH-0001 | Khớp hoàn toàn         | MATCHED  |
| INV-BOSCH-0002 | Khớp hoàn toàn         | MATCHED  |
| INV-BOSCH-0003 | Khớp hoàn toàn         | MATCHED  |
| INV-BOSCH-0004 | Sai **số lượng** (6>4) | FAILED   |
| INV-BOSCH-0005 | Sai **đơn giá** (+2tr) | FAILED   |

---

## 3. Kiến trúc

| Lớp            | Công nghệ |
|----------------|-----------|
| Frontend       | Next.js 15 (App Router) · TypeScript · TailwindCSS v4 · Recharts |
| Backend        | Next.js Server Actions (clean, database-first) |
| Database       | **PostgreSQL** qua **PGlite** (Postgres 16 nhúng, chạy local, không cần cài đặt) |
| Auth           | Session cookie theo role (5 role) |
| PDF            | jsPDF + autotable (sinh PDF PO) |
| Matching engine| Logic thuần `src/lib/matching.ts` (4 checks) |

### Thư mục chính

```
src/
  lib/
    schema.sql        # Toàn bộ DDL (database-first)
    db.ts             # PGlite singleton + auto init/seed
    seed.ts           # Dữ liệu demo (companies, supplier, products, 5 chuỗi PR→PO→GR→Invoice)
    auth.ts           # Đăng nhập + ma trận phân quyền can()
    approval.ts       # Resolve chuỗi phê duyệt theo ngưỡng (bảng approval_rules)
    matching.ts       # Engine đối chiếu Invoice (Supplier/Quantity/Price/Amount)
    po-generate.ts    # Tự sinh PO Draft từ PR đã duyệt
    pdf.ts            # Sinh PDF PO
  actions/            # Server actions: pr, po, gr, invoice, master, auth
  app/(app)/          # Dashboard, PR, PO, GR, Invoice, Suppliers, Products, Settings
  components/         # Sidebar, Filters, UI kit
scripts/
  flow-test.mjs       # Test tích hợp end-to-end (node scripts/flow-test.mjs)
  reset-db.mjs        # Reset dữ liệu demo
```

### Database (11+ bảng)

`companies`, `business_units`, `users`, `suppliers`, `products`, `approval_rules`,
`purchase_requests` (+items), `approval_history`, `purchase_orders` (+items, +change_history),
`goods_receipts` (+items), `invoices` (+items), `invoice_matching`, `attachments`.

Xem toàn bộ trong `src/lib/schema.sql`.

---

## 4. Matching engine — 4 checks

| Check     | Điều kiện hợp lệ                          |
|-----------|-------------------------------------------|
| Supplier  | Invoice.supplier == PO.supplier           |
| Quantity  | Invoice.qty ≤ Received qty (và ≤ PO qty)  |
| Price     | Invoice.unit_price == PO.unit_price       |
| Amount    | Invoice.total ≈ Expected amount (PO)      |

Kết quả tổng: **MATCHED** / **WARNING** / **FAILED** — kèm lý do cụ thể.

---

## 5. Chuyển sang Supabase / Postgres thật (khi lên production)

Thiết kế đã **database-first** nên việc chuyển đổi rất gọn:

1. Chạy `src/lib/schema.sql` trên Supabase (SQL Editor) — schema tương thích Postgres.
2. Thay `src/lib/db.ts`: đổi PGlite bằng `pg.Pool` (hoặc `@supabase/supabase-js`) — giữ nguyên chữ ký `query()/queryOne()`.
3. Thay `src/lib/auth.ts` bằng Supabase Auth; chuyển `attachments.file_url` sang Supabase Storage.

Toàn bộ query trong app đều là SQL Postgres tham số hóa, không phụ thuộc driver.

---

## 6. Kiểm thử

```bash
node scripts/flow-test.mjs   # test end-to-end: PR → approval chain → PO → GR → Invoice match
npx tsc --noEmit             # type-check
```
# PMS_Web_Application
