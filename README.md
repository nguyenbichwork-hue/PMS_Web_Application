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

> Lần chạy đầu tiên hệ thống tự tạo schema (mất vài giây). Việc có nạp dữ liệu
> mẫu hay không phụ thuộc cấu hình bên dưới.

### Đăng nhập

Hệ thống dùng **tài khoản thật** (không còn tài khoản demo `@demo.com`):

| Tài khoản              | Vai trò   | Quyền chính                                      |
|------------------------|-----------|--------------------------------------------------|
| `admin@k-homes.vn`     | Quản trị  | Quản lý user, pháp nhân, master data, cấu hình workflow, **dọn Nhật ký** |

> Mật khẩu Admin đặt qua `ADMIN_PASSWORD` trong `.env.local` (không ghi vào repo).
> Tạo thêm tài khoản trong **Cấu hình → Người dùng** hoặc **Nhập Excel**.

### Chế độ dữ liệu (chọn trong `.env.local`)

| Chế độ | Điều kiện | Ghi chú |
|---|---|---|
| **Local demo** | không có `DATABASE_URL` | PGlite, tự seed dữ liệu mẫu — dùng để dùng thử nhanh |
| **ACCOUNTS_ONLY** ✅ | `DATABASE_URL` + `ACCOUNTS_ONLY=true` | Supabase giữ **tài khoản**, nghiệp vụ chạy PGlite local |
| **Full-Postgres** | `DATABASE_URL`, `ACCOUNTS_ONLY≠true` | Toàn bộ DB trên Supabase/Postgres |

> **Tắt hẳn dữ liệu mẫu**: đặt `DB_SEED=false` — áp dụng cho mọi chế độ, dùng khi
> đã chuyển sang **nhập dữ liệu THẬT** (hệ thống chỉ tạo sẵn 1 pháp nhân trống để
> bắt đầu). Reset DB local: dừng server rồi `npm run db:reset`.

---

## 2. Luồng nghiệp vụ end-to-end

1. **Nhân viên** tạo **PR** (Yêu cầu mua) → gửi duyệt.
2. **Quản lý / Kế toán** **Duyệt / Từ chối** theo ngưỡng cấu hình (bảng `approval_rules`).
   Khi PR được duyệt hết chuỗi → **PO tự động được sinh** (Draft).
3. **Mua hàng** mở PO → điều chỉnh giá / ngày giao (ghi **lịch sử điều chỉnh**) →
   **Duyệt PO** → **Xuất PDF** / **Gửi email NCC**.
4. **Mua hàng / Kế toán** → **Nhận hàng (GR)** → nhập số lượng thực nhận.
5. **Kế toán** → **Hóa đơn** → nhập hóa đơn cho PO → hệ thống **tự đối chiếu** (xem §4).
6. **Dashboard**: thẻ số liệu + biểu đồ (theo tháng / NCC / công ty).

> Master data (NCC, hàng hóa, pháp nhân) nhập tay trong app, **Nhập Excel**, hoặc
> **đồng bộ từ MISA** (Cấu hình). MISA chạy chế độ MOCK khi chưa điền credential.

---

## 3. Kiến trúc

| Lớp            | Công nghệ |
|----------------|-----------|
| Frontend       | Next.js 15 (App Router) · TypeScript · TailwindCSS v4 · Recharts |
| Backend        | Next.js Server Actions (clean, database-first) |
| Database       | **PostgreSQL** — tri-mode: **PGlite** nhúng (local) ⇄ **Supabase** (accounts-only) ⇄ Supabase (full). Xem `src/lib/db.ts` |
| Auth           | Session cookie ký HMAC theo role (5 role) |
| Tích hợp       | **MISA AMIS** (đồng bộ master data, MOCK/LIVE) · **Nhập Excel** (gộp hoặc theo phần) |
| PDF            | jsPDF + autotable (sinh PDF PO) |
| Matching engine| Logic thuần `src/lib/matching.ts` (4 checks) |

### Thư mục chính

```
src/
  lib/
    schema.sql        # Toàn bộ DDL (database-first)
    db.ts             # Tầng DB tri-mode (PGlite ⇄ Supabase) + auto init, seed có điều kiện
    accounts.ts       # Đồng bộ tài khoản Supabase ⇄ local (chế độ ACCOUNTS_ONLY)
    seed.ts           # Dữ liệu MẪU (chỉ chạy khi DB_SEED bật; tắt bằng DB_SEED=false)
    auth.ts           # Đăng nhập + ma trận phân quyền can()
    misa/             # Client + đồng bộ master data từ MISA AMIS (MOCK/LIVE)
    import-excel.ts   # Nhập Excel danh mục (NCC, hàng hóa, tài khoản…)
    approval.ts       # Resolve chuỗi phê duyệt theo ngưỡng (bảng approval_rules)
    matching.ts       # Engine đối chiếu Invoice (Supplier/Quantity/Price/Amount)
    po-generate.ts    # Tự sinh PO Draft từ PR đã duyệt
    pdf.ts            # Sinh PDF PO
  actions/            # Server actions: pr, po, gr, invoice, master, auth
  app/(app)/          # Dashboard, PR, PO, GR, Invoice, Suppliers, Products, Settings
  components/         # Sidebar, Filters, UI kit
scripts/
  flow-test.mjs             # Test tích hợp end-to-end (node scripts/flow-test.mjs)
  reset-db.mjs              # Reset DB local (xóa .pglite)
  check-db.mjs              # Đếm bản ghi các bảng chính trên DB đang cấu hình
  clean-accounts.mjs        # Dọn tài khoản Supabase (giữ whitelist tài khoản thật)
  supabase-accounts-only.mjs# Dọn Supabase còn đúng bảng users (chế độ ACCOUNTS_ONLY)
  set-admin-password.mjs    # Đặt mật khẩu Admin trên Supabase (từ ADMIN_PASSWORD)
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

## 5. Supabase / Postgres (đã tích hợp)

Tầng DB đã **database-first** và hỗ trợ Supabase sẵn — bật bằng biến môi trường,
không phải sửa code:

1. Đặt `DATABASE_URL` (Supabase, Transaction pooler) trong `.env.local`.
2. Chọn chế độ: `ACCOUNTS_ONLY=true` (Supabase chỉ giữ tài khoản) hoặc bỏ trống
   (full-Postgres). Nạp schema: `npm run db:migrate`.
3. Toàn bộ query là SQL Postgres tham số hóa (`query()/queryOne()`) — chạy nguyên
   trên cả PGlite lẫn Supabase.

> Còn lại khi lên production: hash mật khẩu người dùng, đặt `PMS_SESSION_SECRET`
> riêng, chuyển `attachments` sang Supabase Storage (`src/lib/storage.ts`).

---

## 6. Kiểm thử

```bash
node scripts/flow-test.mjs   # test end-to-end: PR → approval chain → PO → GR → Invoice match
npx tsc --noEmit             # type-check
```
