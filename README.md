# Purchase Management System (PMS) — MVP

Số hóa toàn bộ quy trình mua hàng, chạy được **end-to-end** ngay trên máy local:

```
PR  →  Approval (multi-level, configurable)  →  PO (auto-generated)
    →  Goods Receipt  →  Invoice  →  3-way Matching  →  Payment
```

Một hệ thống workflow thật (database, trạng thái, phân quyền, kiểm tra dữ liệu) — không phải form PO đơn giản.

### Tính năng chính
- **Quy trình end-to-end**: PR → duyệt nhiều cấp theo ngưỡng tiền → PO tự sinh → Nhận hàng (từng phần) → Hóa đơn → đối chiếu → thanh toán từng đợt.
- **Phê duyệt & kiểm soát**: luồng duyệt cấu hình được; **mở lại PR bị từ chối**; **SoD** (không tự duyệt PR của mình); **khóa sửa PO sau khi duyệt**.
- **Đối chiếu hóa đơn ↔ PO**: 3-way match (NCC · SL · Đơn giá theo dòng · VAT · Tổng tiền) với **ngưỡng tolerance cấu hình**; **chống trùng hóa đơn**; hóa đơn từng phần.
- **Truy vết**: màn **Document Chain** (PR→PO→GRN→INV→Payment) + **bình luận độc lập** trên chứng từ + **audit log** realtime.
- **Master data & tích hợp**: CRUD Công ty/NCC/Hàng hóa, **Nhập/Xuất Excel**, **Xuất PO ra mẫu MISA 34 cột**, đồng bộ **MISA** (MOCK/LIVE).
- **Phân quyền**: 5 vai trò, `can()` 2 lớp + **scope theo công ty** (chống IDOR); phiên đăng nhập ký HMAC.
- **Hướng dẫn ngay trong app**: menu **Hướng dẫn** (trang `/huong-dan`) — chỉ hiện phần người dùng có quyền.

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
3. **Mua hàng** mở PO (Nháp) → điều chỉnh giá / ngày giao (ghi **lịch sử điều chỉnh**, chỉ khi Nháp) →
   **Duyệt PO** → **Xuất PDF** / **Xuất Excel mẫu MISA** / **Gửi email NCC**.
4. **Mua hàng / Kế toán** → **Nhận hàng (GR)** → nhập số lượng thực nhận (từng phần được cộng dồn).
5. **Kế toán** → **Hóa đơn** → nhập hóa đơn cho PO → hệ thống **tự đối chiếu** (xem §4); **chống trùng** cùng NCC+số HĐ.
6. **Thanh toán** từng đợt trên hóa đơn đã Khớp/Cảnh báo → **Đã thanh toán**.
7. **Truy vết & trao đổi**: nút **“Xem chuỗi chứng từ”** + khung **Bình luận** ở mọi chi tiết; **Dashboard** có thẻ số liệu, biểu đồ, bình luận gần đây.

> Master data (NCC, hàng hóa, pháp nhân) nhập tay trong app, **Nhập Excel**, hoặc
> **đồng bộ từ MISA** (Cấu hình). MISA chạy chế độ MOCK khi chưa điền credential.
>
> **Phạm vi so với đặc tả**: hệ thống hiện ≈ tập con MVP — xem
> [`Note_PR_PO_Project/GAP_VA_ROADMAP_theo_DacTa.md`](../Note_PR_PO_Project/GAP_VA_ROADMAP_theo_DacTa.md) (nội bộ) để biết phần còn thiếu & lộ trình.

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

### Database (20+ bảng)

`companies`, `business_units`, `users`, `suppliers`, `products`, `warehouses`, `units`,
`approval_rules`, `match_settings`,
`purchase_requests` (+items), `approval_history`, `purchase_orders` (+items, +change_history),
`goods_receipts` (+items), `invoices` (+items), `invoice_matching`, `payments`,
`comments`, `attachments`, `audit_log`, `misa_sync_state`.

DDL nền ở `src/lib/schema.sql`; các bảng bổ sung (idempotent) ở `src/lib/migrations.sql`.

---

## 4. Matching engine — 3-way match

| Check     | Điều kiện hợp lệ                                         |
|-----------|---------------------------------------------------------|
| Supplier  | NCC hóa đơn == NCC trên PO (null → cảnh báo)             |
| Quantity  | SL hóa đơn ≤ SL đã nhận (GR) **và** ≤ SL trên PO         |
| Price     | Đơn giá **theo từng dòng** (map mã→tên, chuẩn hóa chuỗi) |
| VAT       | Tiền thuế khớp kỳ vọng (chỉ cảnh báo khi lệch)          |
| Amount    | Tổng hóa đơn ≈ tổng kỳ vọng (chia tỷ lệ nếu từng phần)   |

- Kết quả tổng: **MATCHED** / **WARNING** / **FAILED** — kèm lý do tiếng Việt.
- **Ngưỡng tolerance** (giá / tổng tiền / số lượng) cấu hình ở **Cấu hình → Đối chiếu** (bảng `match_settings`).
- **Chống trùng**: cùng NCC + cùng số hóa đơn → chặn. Hóa đơn **Failed không giữ chỗ** số lượng còn lại của PO.
- Logic thuần ở `src/lib/matching.ts` (`buildPoPriceIndex`/`findPoPrice`/`evaluateMatch`) — test ở §6.

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
node scripts/flow-test.mjs                                   # end-to-end: PR → approval → PO → GR → Invoice
node --experimental-strip-types scripts/matching-test.ts     # engine đối chiếu + map + tolerance (13 case)
node --experimental-strip-types scripts/invoice-match-test.ts# kết quả đối chiếu khi nhập hóa đơn cho PO (8 case)
npx tsc --noEmit                                             # type-check
```
