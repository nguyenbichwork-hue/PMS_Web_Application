-- =====================================================================
-- Purchase Management System — PostgreSQL schema (database-first)
-- Runs on PGlite (Postgres 16) locally; portable to Supabase/Postgres.
-- All money stored as NUMERIC(18,2). Status fields use CHECK constraints
-- (kept as TEXT instead of native ENUM for easy extension / portability).
-- =====================================================================

-- ---------- MASTER: legal entities -----------------------------------
CREATE TABLE IF NOT EXISTS companies (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_code  TEXT NOT NULL UNIQUE,
  company_name  TEXT NOT NULL,
  tax_code      TEXT,
  address       TEXT,
  status        TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business_units (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id  BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  bu_code     TEXT NOT NULL,
  bu_name     TEXT NOT NULL,
  UNIQUE (company_id, bu_code)
);

-- ---------- USERS & auth ---------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password      TEXT NOT NULL DEFAULT 'password',   -- demo only; hash in production
  department    TEXT,
  role          TEXT NOT NULL CHECK (role IN ('Employee','Purchasing','Manager','Finance','Admin')),
  company_id    BIGINT REFERENCES companies(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- SUPPLIER MASTER ------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  supplier_code  TEXT NOT NULL UNIQUE,
  supplier_name  TEXT NOT NULL,
  tax_code       TEXT,
  address        TEXT,
  contact_name   TEXT,
  phone          TEXT,
  email          TEXT,
  bank_account   TEXT,
  payment_term   TEXT DEFAULT 'NET30',
  currency       TEXT NOT NULL DEFAULT 'VND',
  status         TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- PRODUCT MASTER -------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_code         TEXT NOT NULL UNIQUE,
  item_name         TEXT NOT NULL,
  category          TEXT,
  unit              TEXT NOT NULL DEFAULT 'PCS',
  vat_rate          NUMERIC(5,2) NOT NULL DEFAULT 10,
  default_supplier  BIGINT REFERENCES suppliers(id) ON DELETE SET NULL,
  accounting_code   TEXT,
  status            TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- APPROVAL RULES (configurable workflow) -------------------
-- Threshold-based approval chains. amount_min inclusive, amount_max exclusive.
-- levels: ordered JSON array of role names required, e.g. ["Manager","Finance"].
CREATE TABLE IF NOT EXISTS approval_rules (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_type TEXT NOT NULL DEFAULT 'PR',
  amount_min    NUMERIC(18,2) NOT NULL DEFAULT 0,
  amount_max    NUMERIC(18,2),                      -- NULL = no upper bound
  levels        JSONB NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT true
);

-- ---------- PURCHASE REQUEST -----------------------------------------
CREATE TABLE IF NOT EXISTS purchase_requests (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pr_number      TEXT UNIQUE,
  request_date   DATE NOT NULL DEFAULT current_date,
  requester_id   BIGINT NOT NULL REFERENCES users(id),
  department     TEXT,
  company_id     BIGINT NOT NULL REFERENCES companies(id),
  purpose        TEXT,
  priority       TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Low','Normal','High','Urgent')),
  required_date  DATE,
  status         TEXT NOT NULL DEFAULT 'Draft'
                 CHECK (status IN ('Draft','Pending Approval','Approved','Rejected','Completed')),
  total_amount   NUMERIC(18,2) NOT NULL DEFAULT 0,
  current_level  INT NOT NULL DEFAULT 0,            -- how many approval levels cleared
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_request_items (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pr_id               BIGINT NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
  item_code           TEXT,
  item_name           TEXT NOT NULL,
  description         TEXT,
  quantity            NUMERIC(18,3) NOT NULL DEFAULT 1,
  unit                TEXT DEFAULT 'PCS',
  estimated_price     NUMERIC(18,2) NOT NULL DEFAULT 0,
  supplier_suggestion BIGINT REFERENCES suppliers(id),
  note                TEXT,
  line_no             INT NOT NULL DEFAULT 1
);

-- ---------- APPROVAL HISTORY (audit trail) ---------------------------
CREATE TABLE IF NOT EXISTS approval_history (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_type  TEXT NOT NULL,                     -- 'PR' | 'PO'
  document_id    BIGINT NOT NULL,
  approver_id    BIGINT REFERENCES users(id),
  approval_level INT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('Approved','Rejected','Submitted')),
  comment        TEXT,
  approved_time  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- PURCHASE ORDER -------------------------------------------
CREATE TABLE IF NOT EXISTS purchase_orders (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  po_number      TEXT UNIQUE,
  pr_id          BIGINT REFERENCES purchase_requests(id),
  supplier_id    BIGINT REFERENCES suppliers(id),
  company_id     BIGINT NOT NULL REFERENCES companies(id),
  order_date     DATE NOT NULL DEFAULT current_date,
  delivery_date  DATE,
  payment_term   TEXT DEFAULT 'NET30',
  currency       TEXT NOT NULL DEFAULT 'VND',
  status         TEXT NOT NULL DEFAULT 'Draft'
                 CHECK (status IN ('Draft','Approved','Sent','Confirmed','Received','Closed','Cancelled')),
  subtotal       NUMERIC(18,2) NOT NULL DEFAULT 0,
  vat_total      NUMERIC(18,2) NOT NULL DEFAULT 0,
  grand_total    NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  po_id        BIGINT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_code    TEXT,
  description  TEXT NOT NULL,
  quantity     NUMERIC(18,3) NOT NULL DEFAULT 1,
  unit         TEXT DEFAULT 'PCS',
  unit_price   NUMERIC(18,2) NOT NULL DEFAULT 0,
  discount     NUMERIC(18,2) NOT NULL DEFAULT 0,   -- absolute discount on the line
  vat_rate     NUMERIC(5,2)  NOT NULL DEFAULT 10,
  amount       NUMERIC(18,2) NOT NULL DEFAULT 0,   -- (qty*price - discount) + vat
  line_no      INT NOT NULL DEFAULT 1
);

-- Track every adjustment to a PO (supplier / price / delivery / term).
CREATE TABLE IF NOT EXISTS po_change_history (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  po_id        BIGINT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  field        TEXT NOT NULL,
  old_value    TEXT,
  new_value    TEXT,
  changed_by   BIGINT REFERENCES users(id),
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- GOODS RECEIPT --------------------------------------------
CREATE TABLE IF NOT EXISTS goods_receipts (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  gr_number    TEXT UNIQUE,
  po_id        BIGINT NOT NULL REFERENCES purchase_orders(id),
  receive_date DATE NOT NULL DEFAULT current_date,
  warehouse    TEXT,
  receiver_id  BIGINT REFERENCES users(id),
  status       TEXT NOT NULL DEFAULT 'Completed' CHECK (status IN ('Draft','Completed')),
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS goods_receipt_items (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  gr_id         BIGINT NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  po_item_id    BIGINT REFERENCES purchase_order_items(id),
  item_code     TEXT,
  description   TEXT,
  received_qty  NUMERIC(18,3) NOT NULL DEFAULT 0
);

-- ---------- INVOICE --------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_number  TEXT NOT NULL,
  invoice_date    DATE NOT NULL DEFAULT current_date,
  supplier_id     BIGINT REFERENCES suppliers(id),
  tax_code        TEXT,
  po_id           BIGINT REFERENCES purchase_orders(id),
  total_amount    NUMERIC(18,2) NOT NULL DEFAULT 0,
  vat_amount      NUMERIC(18,2) NOT NULL DEFAULT 0,
  file_attachment TEXT,
  status          TEXT NOT NULL DEFAULT 'Pending'
                  CHECK (status IN ('Pending','Matched','Warning','Failed','Paid')),
  match_result    TEXT,                              -- MATCHED | WARNING | FAILED
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id   BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  item_code    TEXT,
  description  TEXT,
  quantity     NUMERIC(18,3) NOT NULL DEFAULT 0,
  unit_price   NUMERIC(18,2) NOT NULL DEFAULT 0,
  amount       NUMERIC(18,2) NOT NULL DEFAULT 0
);

-- Persisted results of the 4-check matching engine.
CREATE TABLE IF NOT EXISTS invoice_matching (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id   BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  check_name   TEXT NOT NULL,                        -- Supplier | Quantity | Price | Amount
  result       TEXT NOT NULL CHECK (result IN ('PASS','WARNING','FAIL')),
  reason       TEXT,
  checked_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- ATTACHMENTS (polymorphic) --------------------------------
CREATE TABLE IF NOT EXISTS attachments (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_type TEXT NOT NULL,                       -- PR | PO | Invoice | Contract
  document_id   BIGINT NOT NULL,
  kind          TEXT,                                -- Quotation | PO_PDF | Invoice_PDF | Contract | DeliveryNote
  file_name     TEXT NOT NULL,
  file_url      TEXT NOT NULL,
  uploaded_by   BIGINT REFERENCES users(id),
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_pr_status ON purchase_requests(status);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_inv_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_pr_company ON purchase_requests(company_id);
