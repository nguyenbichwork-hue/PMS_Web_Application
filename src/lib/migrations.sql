-- =====================================================================
-- Migrations CỘNG THÊM (idempotent) — chạy an toàn mỗi lần khởi động.
-- Chỉ THÊM bảng/cột mới (không sửa/không xóa) nên tương thích ngược hoàn
-- toàn với dữ liệu và code cũ.
-- =====================================================================

-- Nhật ký kiểm toán tổng quát: ai / làm gì / trên chứng từ nào / cũ→mới.
CREATE TABLE IF NOT EXISTS audit_log (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id      BIGINT REFERENCES users(id),
  actor_name    TEXT,
  document_type TEXT NOT NULL,
  document_id   BIGINT,
  action        TEXT NOT NULL,
  field         TEXT,
  old_value     TEXT,
  new_value     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_doc ON audit_log(document_type, document_id);

-- Người tạo chứng từ (audit trail).
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(id);
ALTER TABLE purchase_orders   ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(id);
ALTER TABLE goods_receipts    ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(id);
ALTER TABLE invoices          ADD COLUMN IF NOT EXISTS created_by BIGINT REFERENCES users(id);

-- Lý do hủy PO (phục vụ chức năng Cancel ở Phase 2).
ALTER TABLE purchase_orders   ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- ---------- THANH TOÁN (Payment) — 1 hóa đơn trả được nhiều đợt ----------
CREATE TABLE IF NOT EXISTS payments (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id    BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  payment_date  DATE NOT NULL DEFAULT current_date,
  amount        NUMERIC(18,2) NOT NULL DEFAULT 0,
  method        TEXT NOT NULL DEFAULT 'Chuyển khoản',   -- Chuyển khoản / Tiền mặt / Khác
  reference     TEXT,                                   -- số UNC / mã giao dịch
  note          TEXT,
  created_by    BIGINT REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pay_invoice ON payments(invoice_id);

-- =====================================================================
-- MISA AMIS Kế toán là NGUỒN MASTER DATA (lõi). Các cột dưới đây gắn mỗi
-- bản ghi danh mục với id gốc bên MISA để đồng bộ idempotent (upsert),
-- và cột `source` phân biệt dữ liệu đến từ 'misa' hay tạo 'local'.
-- =====================================================================
ALTER TABLE suppliers      ADD COLUMN IF NOT EXISTS misa_id TEXT;
ALTER TABLE suppliers      ADD COLUMN IF NOT EXISTS source  TEXT NOT NULL DEFAULT 'local';
-- Công nợ (số tiền nợ) NCC — nhập từ cột "Số tiền nợ" của file danh sách NCC.
ALTER TABLE suppliers      ADD COLUMN IF NOT EXISTS debt    NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE products       ADD COLUMN IF NOT EXISTS misa_id TEXT;
ALTER TABLE products       ADD COLUMN IF NOT EXISTS source  TEXT NOT NULL DEFAULT 'local';
ALTER TABLE business_units ADD COLUMN IF NOT EXISTS misa_id TEXT;
ALTER TABLE business_units ADD COLUMN IF NOT EXISTS source  TEXT NOT NULL DEFAULT 'local';

CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_misa ON suppliers(misa_id) WHERE misa_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_misa  ON products(misa_id)  WHERE misa_id IS NOT NULL;

-- Danh mục Đơn vị tính (MISA data_type = 4).
CREATE TABLE IF NOT EXISTS units (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  misa_id    TEXT UNIQUE,
  unit_name  TEXT NOT NULL UNIQUE,
  source     TEXT NOT NULL DEFAULT 'local',
  status     TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Danh mục Kho (MISA data_type = 3).
CREATE TABLE IF NOT EXISTS warehouses (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  misa_id    TEXT UNIQUE,
  stock_code TEXT NOT NULL UNIQUE,
  stock_name TEXT NOT NULL,
  source     TEXT NOT NULL DEFAULT 'local',
  status     TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trạng thái đồng bộ từng loại danh mục MISA (phục vụ đồng bộ tăng dần).
CREATE TABLE IF NOT EXISTS misa_sync_state (
  data_type      INT PRIMARY KEY,
  label          TEXT,
  last_sync_time TIMESTAMPTZ,
  last_count     INT NOT NULL DEFAULT 0,
  last_run       TIMESTAMPTZ
);

-- ---------- Nhận hàng TỪNG PHẦN: thêm trạng thái PO 'Partially Received' ----------
-- Đổi ràng buộc CHECK (idempotent: drop tên cũ + tên mới rồi add lại).
ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS po_status_check_v2;
ALTER TABLE purchase_orders ADD  CONSTRAINT po_status_check_v2
  CHECK (status IN ('Draft','Approved','Sent','Confirmed','Received','Partially Received','Closed','Cancelled'));

-- ---------- BÌNH LUẬN ĐỘC LẬP (tách khỏi approval_history) ----------
-- Bình luận tự do trên chứng từ (PR/PO/Invoice…) — KHÔNG gắn cấp duyệt,
-- KHÔNG đổi trạng thái. Trao đổi thảo luận xuyên suốt vòng đời chứng từ.
CREATE TABLE IF NOT EXISTS comments (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_type TEXT   NOT NULL,                 -- 'PR' | 'PO' | 'Invoice' | ...
  document_id   BIGINT NOT NULL,
  author_id     BIGINT REFERENCES users(id),
  author_name   TEXT,
  body          TEXT   NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comments_doc ON comments(document_type, document_id);

-- ---------- MỞ LẠI PR bị từ chối: thêm trạng thái lịch sử 'Reopened' ----------
-- Cho phép ghi 1 dòng approval_history khi Manager mở lại PR (Rejected → Pending).
ALTER TABLE approval_history DROP CONSTRAINT IF EXISTS approval_history_status_check;
ALTER TABLE approval_history DROP CONSTRAINT IF EXISTS ah_status_check_v2;
ALTER TABLE approval_history ADD  CONSTRAINT ah_status_check_v2
  CHECK (status IN ('Approved','Rejected','Submitted','Reopened'));

-- ---------- NGƯỠNG ĐỐI CHIẾU (tolerance) hóa đơn ↔ PO — cấu hình được (§12.2) ----------
-- 1 dòng duy nhất (id=1). % sai lệch được tự động chấp nhận cho đơn giá/tổng tiền/số lượng.
CREATE TABLE IF NOT EXISTS match_settings (
  id                    INT PRIMARY KEY,
  price_tolerance_pct   NUMERIC(6,3) NOT NULL DEFAULT 1,
  amount_tolerance_pct  NUMERIC(6,3) NOT NULL DEFAULT 1,
  qty_tolerance_pct     NUMERIC(6,3) NOT NULL DEFAULT 0,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO match_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
