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

-- ---------- THÔNG BÁO (@nhắc tên trong bình luận) ----------
-- Nhẹ: mỗi lần ai đó @nhắc bạn trong bình luận PR/PO → 1 dòng thông báo. Chuông
-- ở header hiện số CHƯA ĐỌC (read_at IS NULL); bấm vào mở đúng chứng từ.
CREATE TABLE IF NOT EXISTS notifications (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL DEFAULT 'mention',   -- 'mention' | 'comment'
  document_type TEXT,                              -- 'PR' | 'PO' | 'Invoice'
  document_id   BIGINT,
  actor_name    TEXT,                              -- người gây ra thông báo
  body          TEXT,                              -- trích nội dung bình luận
  comment_id    BIGINT,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at);

-- ---------- MỞ LẠI PR bị từ chối: thêm trạng thái lịch sử 'Reopened' ----------
-- Cho phép ghi 1 dòng approval_history khi Manager mở lại PR (Rejected → Pending).
ALTER TABLE approval_history DROP CONSTRAINT IF EXISTS approval_history_status_check;
ALTER TABLE approval_history DROP CONSTRAINT IF EXISTS ah_status_check_v2;
ALTER TABLE approval_history ADD  CONSTRAINT ah_status_check_v2
  CHECK (status IN ('Approved','Rejected','Submitted','Reopened'));

-- ---------- FILE HASH chống trùng tệp đính kèm (UAT-17) ----------
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS file_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_attachments_hash ON attachments(file_hash);
-- Tệp đính kèm được map theo (loại chứng từ, id chứng từ) — index để trang chi tiết
-- PR/PO/PRQ/Hóa đơn lấy đúng tệp của mình nhanh (thay vì quét toàn bảng).
CREATE INDEX IF NOT EXISTS idx_attachments_doc ON attachments(document_type, document_id);

-- ---------- CREDIT NOTE (§14): giảm nghĩa vụ của hóa đơn ----------
CREATE TABLE IF NOT EXISTS credit_notes (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id  BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount      NUMERIC(18,2) NOT NULL,
  reason      TEXT,
  created_by  BIGINT REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_credit_notes_inv ON credit_notes(invoice_id);
-- Thêm trạng thái 'Credited' cho hóa đơn (đã điều chỉnh giảm).
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS inv_status_check_v2;
ALTER TABLE invoices ADD  CONSTRAINT inv_status_check_v2
  CHECK (status IN ('Pending','Matched','Warning','Failed','Paid','Credited'));

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

-- ---------- VAT trên PR (G-PR-01): thuế suất từng dòng + tổng VAT ----------
-- total_amount GIỮ nguyên là tiền chưa thuế (net) để không đổi ngưỡng duyệt hiện có;
-- vat_total là phần thuế cộng thêm → tổng gồm thuế = total_amount + vat_total.
ALTER TABLE purchase_request_items ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) NOT NULL DEFAULT 10;
ALTER TABLE purchase_requests      ADD COLUMN IF NOT EXISTS vat_total NUMERIC(18,2) NOT NULL DEFAULT 0;

-- ---------- ĐỒNG BỘ HÓA ĐƠN từ Google Sheet/Drive + AUTO-MATCH PO (§11.4) ----------
-- Không dựa vào cột "Số PO": tự tìm PO bằng khóa tổng hợp NCC(MST)+mã/giá+tiền.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS source         TEXT;    -- vd 'google-sheet'
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS source_ref     TEXT;    -- Invoice_ID/fileId nguồn (chống nhập lại)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_series TEXT;    -- ký hiệu (KHHDon)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS seller_tax_id  TEXT;    -- MST người bán (đọc từ XML)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS match_key      TEXT;    -- khóa tổng hợp auto-match (audit)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS match_score    NUMERIC(6,4); -- điểm tin cậy 0..1
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS match_level    TEXT;    -- AUTO | REVIEW | NONE | MANUAL
-- Chống nhập lại cùng một bản ghi nguồn (mỗi source_ref chỉ vào 1 lần).
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_source_ref
  ON invoices(source_ref) WHERE source_ref IS NOT NULL;

-- Thuế suất TỪNG DÒNG hóa đơn (đọc từ XML/Sheet) để đối chiếu VAT theo dòng với PO.
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2);

-- ---------- ĐỐI CHIẾU ĐẦY ĐỦ theo đặc tả §9/§11/§12 ----------
-- Tiền tệ hóa đơn (§11.4 Currency) — mặc định VND; khác PO → chặn (trừ ngoại lệ FX).
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'VND';
-- Khóa CHỐNG TRÙNG hóa đơn (§9.2): MST người bán + ký hiệu + số hóa đơn (chuẩn hóa).
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS dup_key TEXT;
CREATE INDEX IF NOT EXISTS idx_invoices_dup_key ON invoices(dup_key);

-- ---------- PR: các trường người YÊU CẦU điền (ô vàng) — spec 07/2026 ----------
-- Mã công trình, địa điểm giao, tình trạng, hình thức thanh toán + % ứng trước.
-- (Ngày giao hàng dự kiến dùng lại cột required_date; BU/Phòng ban dùng department.)
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS project_code      TEXT;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS delivery_location TEXT;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS requester_status  TEXT;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS payment_method    TEXT;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS advance_percent   NUMERIC(6,2);
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS buyer             TEXT; -- Nhân viên mua hàng (ô vàng)
-- Hình thức thanh toán: số lần thanh toán + số tiền từng lần (module riêng, spec 07/2026).
-- payment_count = số lần trả (số nguyên, < 10); payment_installments = mảng JSON số tiền mỗi lần.
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS payment_count        INT;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS payment_installments JSONB;
-- NCC nhập tay ngay ở PR (khi chưa có trong danh mục NCC) — lưu tên + MST tự do theo dòng.
ALTER TABLE purchase_request_items ADD COLUMN IF NOT EXISTS supplier_text     TEXT;
ALTER TABLE purchase_request_items ADD COLUMN IF NOT EXISTS supplier_tax_text TEXT;

-- ---------- PAYMENT REQUISITION (PRQ) — Đề nghị thanh toán (spec 07/2026) ----------
-- Sinh tự động sau khi Manager DUYỆT PO. Một PRQ trả cho MỘT nhà cung cấp, gồm dòng
-- từ 1 hoặc nhiều PO (partial / từng dòng). Số tiền dòng ĐÃ GỒM THUẾ. Xuất Excel theo
-- mẫu "Payment Requisition" của công ty (số TK + tên NH tự điền, sửa được).
CREATE TABLE IF NOT EXISTS payment_requisitions (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  prq_number    TEXT UNIQUE,
  company_id    BIGINT NOT NULL REFERENCES companies(id),
  supplier_id   BIGINT REFERENCES suppliers(id),
  payment_type  TEXT NOT NULL DEFAULT 'Normal',      -- 'Normal' | 'Advance'
  due_date      DATE,
  bank_account  TEXT,
  bank_name     TEXT,
  bank_address  TEXT,
  swift_code    TEXT,
  reason        TEXT,
  currency      TEXT NOT NULL DEFAULT 'VND',
  subtotal      NUMERIC(18,2) NOT NULL DEFAULT 0,     -- chưa thuế
  vat_total     NUMERIC(18,2) NOT NULL DEFAULT 0,
  grand_total   NUMERIC(18,2) NOT NULL DEFAULT 0,     -- GỒM thuế
  status        TEXT NOT NULL DEFAULT 'Draft'
                CHECK (status IN ('Draft','Submitted','Approved','Paid','Cancelled')),
  created_by    BIGINT REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prq_company  ON payment_requisitions(company_id);
CREATE INDEX IF NOT EXISTS idx_prq_supplier ON payment_requisitions(supplier_id);
-- Điều khoản thanh toán CHUYỂN từ PR sang PRQ (spec 08/2026): PRQ tạo tay, độc lập
-- với PR/PO. payment_method = hình thức TT; advance_percent = % ứng trước (khi Ứng trước);
-- payment_count = số lần trả (1..9); payment_installments = mảng JSON [{amount, days}].
ALTER TABLE payment_requisitions ADD COLUMN IF NOT EXISTS payment_method       TEXT;
ALTER TABLE payment_requisitions ADD COLUMN IF NOT EXISTS advance_percent      NUMERIC(6,2);
ALTER TABLE payment_requisitions ADD COLUMN IF NOT EXISTS payment_count        INT;
ALTER TABLE payment_requisitions ADD COLUMN IF NOT EXISTS payment_installments JSONB;
-- Ghi nhận CHI TIỀN (kế toán đánh dấu "đã chuyển tiền"): Approved → Paid (spec 08/2026).
-- paid_ref = số lệnh chi / ủy nhiệm chi (UNC) để đối chiếu sao kê.
ALTER TABLE payment_requisitions ADD COLUMN IF NOT EXISTS paid_date DATE;
ALTER TABLE payment_requisitions ADD COLUMN IF NOT EXISTS paid_by   BIGINT REFERENCES users(id);
ALTER TABLE payment_requisitions ADD COLUMN IF NOT EXISTS paid_ref  TEXT;

CREATE TABLE IF NOT EXISTS payment_requisition_items (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  prq_id       BIGINT NOT NULL REFERENCES payment_requisitions(id) ON DELETE CASCADE,
  po_id        BIGINT REFERENCES purchase_orders(id),
  po_item_id   BIGINT REFERENCES purchase_order_items(id),
  inv_no       TEXT,
  inv_date     DATE,
  description  TEXT,
  tax_code     TEXT,
  gl_account   TEXT,
  cost_center  TEXT,
  currency     TEXT NOT NULL DEFAULT 'VND',
  amount       NUMERIC(18,2) NOT NULL DEFAULT 0,      -- GỒM thuế
  line_no      INT NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_prq_items_prq ON payment_requisition_items(prq_id);
CREATE INDEX IF NOT EXISTS idx_prq_items_po  ON payment_requisition_items(po_id);
-- % thuế theo dòng PRQ (nhập nhanh: tiền trước thuế × (1+%/100) = số tiền gồm thuế).
ALTER TABLE payment_requisition_items ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2);

-- PHÂN BỔ TỪNG DÒNG hóa đơn ↔ dòng PO — "bảng hạng nhất" (§11.2/§15.2
-- invoice_po_allocation): kiểm soát số lượng/giá trị dựa trên LINE, không chỉ
-- lưu po_id trên header. Mỗi dòng hóa đơn ghép với đúng dòng PO + lưu vết đối chiếu.
CREATE TABLE IF NOT EXISTS invoice_line_allocation (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id      BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  invoice_item_id BIGINT REFERENCES invoice_items(id) ON DELETE CASCADE,
  po_id           BIGINT REFERENCES purchase_orders(id),
  po_item_id      BIGINT REFERENCES purchase_order_items(id),
  item_code       TEXT,
  description     TEXT,
  alloc_qty       NUMERIC(18,3) NOT NULL DEFAULT 0,   -- SL dòng hóa đơn phân bổ vào dòng PO
  alloc_amount    NUMERIC(18,2) NOT NULL DEFAULT 0,   -- tiền (chưa thuế) dòng hóa đơn
  inv_unit_price  NUMERIC(18,2),
  po_unit_price   NUMERIC(18,2),
  received_qty    NUMERIC(18,3),                      -- SL đã nhận (GRN) của dòng PO khi ghép
  inv_vat_rate    NUMERIC(5,2),
  po_vat_rate     NUMERIC(5,2),
  price_status    TEXT,                               -- PASS/WARNING/FAIL từng tiêu chí
  qty_status      TEXT,
  vat_status      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inv_alloc_invoice ON invoice_line_allocation(invoice_id);
CREATE INDEX IF NOT EXISTS idx_inv_alloc_po_item ON invoice_line_allocation(po_item_id);

-- =====================================================================
-- KHÁCH HÀNG (customers) + DỰ ÁN (projects) — bổ sung 07/2026
-- Trả lời 2 nỗi đau: (1) "đơn nào của khách nào" → gắn PR/PO với khách hàng;
-- (2) "dự án hầu như không có thông tin" → danh mục dự án có NGÂN SÁCH để
-- kiểm tra "còn đủ tiền không" khi duyệt PO.
-- =====================================================================

-- ---------- Danh mục KHÁCH HÀNG (toàn tập đoàn, giống suppliers) ----------
CREATE TABLE IF NOT EXISTS customers (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_code  TEXT NOT NULL UNIQUE,
  customer_name  TEXT NOT NULL,
  tax_code       TEXT,
  address        TEXT,
  contact_name   TEXT,
  phone          TEXT,
  email          TEXT,
  note           TEXT,
  status         TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Danh mục DỰ ÁN / CÔNG TRÌNH (có ngân sách) ----------
CREATE TABLE IF NOT EXISTS projects (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_code  TEXT NOT NULL UNIQUE,
  project_name  TEXT NOT NULL,
  company_id    BIGINT REFERENCES companies(id) ON DELETE SET NULL,
  customer_id   BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  budget        NUMERIC(18,2) NOT NULL DEFAULT 0,   -- 0 = không kiểm soát ngân sách
  manager_name  TEXT,
  location       TEXT,
  start_date    DATE,
  end_date      DATE,
  note          TEXT,
  status        TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Closed','Inactive')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projects_company ON projects(company_id);

-- ---------- Liên kết chứng từ mua ↔ khách hàng / dự án ----------
-- sales_order_ref: số đơn bán / hợp đồng bán để truy "mua phục vụ đơn nào".
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS customer_id     BIGINT REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS project_id      BIGINT REFERENCES projects(id)  ON DELETE SET NULL;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS sales_order_ref TEXT;
ALTER TABLE purchase_orders   ADD COLUMN IF NOT EXISTS customer_id     BIGINT REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE purchase_orders   ADD COLUMN IF NOT EXISTS project_id      BIGINT REFERENCES projects(id)  ON DELETE SET NULL;
ALTER TABLE purchase_orders   ADD COLUMN IF NOT EXISTS sales_order_ref TEXT;
CREATE INDEX IF NOT EXISTS idx_pr_project ON purchase_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_po_project ON purchase_orders(project_id);

-- =====================================================================
-- HIỆU NĂNG (08/2026): index cho các KHÓA NGOẠI + cột LỌC/SẮP XẾP nóng.
-- Trước đây phần lớn JOIN (suppliers/companies/pr) và câu ĐẾM ở list page,
-- dashboard, "Việc của tôi" phải SEQ SCAN toàn bảng vì thiếu index. Các
-- index dưới đây biến seq-scan → index-scan. An toàn: chỉ THÊM, idempotent,
-- chạy trong CÙNG một khối execMulti (1 round-trip khi khởi động).
-- ---------- purchase_orders: join NCC/công ty/PR + lọc theo ngày ----------
CREATE INDEX IF NOT EXISTS idx_po_supplier  ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_company   ON purchase_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_po_pr        ON purchase_orders(pr_id);
CREATE INDEX IF NOT EXISTS idx_po_order_date ON purchase_orders(order_date);
-- ---------- dòng chứng từ: cascade + EXISTS tìm kiếm theo tên/mã hàng ----------
CREATE INDEX IF NOT EXISTS idx_poi_po       ON purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_pri_pr       ON purchase_request_items(pr_id);
-- ---------- purchase_requests: PR nháp của tôi / lọc người yêu cầu ----------
CREATE INDEX IF NOT EXISTS idx_pr_requester ON purchase_requests(requester_id);
-- ---------- invoices: join/EXISTS theo PO + NCC ----------
CREATE INDEX IF NOT EXISTS idx_inv_po       ON invoices(po_id);
CREATE INDEX IF NOT EXISTS idx_inv_supplier ON invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_inv_items_inv ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_inv_match_inv ON invoice_matching(invoice_id);
-- ---------- nhận hàng ----------
CREATE INDEX IF NOT EXISTS idx_gr_po        ON goods_receipts(po_id);
CREATE INDEX IF NOT EXISTS idx_gri_gr       ON goods_receipt_items(gr_id);
-- ---------- lịch sử duyệt (đọc ở MỌI trang chi tiết) ----------
-- (attachments(document_type, document_id) đã có idx_attachments_doc ở trên.)
CREATE INDEX IF NOT EXISTS idx_apphist_doc  ON approval_history(document_type, document_id);
CREATE INDEX IF NOT EXISTS idx_pochg_po     ON po_change_history(po_id);
-- ---------- PRQ: hàng đợi chi tiền + chống trả trùng theo dòng PO ----------
CREATE INDEX IF NOT EXISTS idx_prq_status   ON payment_requisitions(status);
CREATE INDEX IF NOT EXISTS idx_prq_items_poitem ON payment_requisition_items(po_item_id);

-- ---------- LƯU TRỮ NGUỘI (OneDrive) — mốc thời gian file đính kèm được archive ----------
-- NULL = còn ở tầng nóng (Supabase/local); có giá trị = đã đẩy lên OneDrive (file_url 'od:…').
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
