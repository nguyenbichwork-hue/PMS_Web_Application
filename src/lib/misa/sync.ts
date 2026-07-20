import "server-only";
import {
  fetchDictionary,
  misaMode,
  MISA_DATA_TYPES,
  type MisaRecord,
} from "./client";

// ---------------------------------------------------------------------
// Đồng bộ MASTER DATA từ MISA -> DB local. MISA là NGUỒN (lõi); mỗi lần
// đồng bộ là idempotent: upsert theo mã tự nhiên (code) rồi gắn misa_id và
// đặt source='misa'. Nhờ đó dữ liệu seed sẵn (cùng mã) được "MISA tiếp quản"
// thay vì tạo trùng.
//
// Nhận `run` — một executor (sql, params) -> rows — để dùng được cả trong
// lúc bootstrap (truyền pg.query trực tiếp, tránh deadlock chờ ready) lẫn
// trong server action (truyền query() thông thường).
// ---------------------------------------------------------------------

type Run = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

const s = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
const statusOf = (r: MisaRecord): "Active" | "Inactive" => (r.inactive ? "Inactive" : "Active");
const num = (v: unknown, d: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export interface SyncResult {
  mode: "live" | "mock";
  counts: Record<string, number>;
  total: number;
}

async function syncUnits(run: Run): Promise<number> {
  const rows = await fetchDictionary(MISA_DATA_TYPES.UNIT);
  for (const r of rows) {
    const name = s(r.unit_name);
    if (!name) continue;
    await run(
      `INSERT INTO units (misa_id, unit_name, source, status)
       VALUES ($1,$2,'misa',$3)
       ON CONFLICT (unit_name) DO UPDATE SET
         misa_id = EXCLUDED.misa_id, source = 'misa', status = EXCLUDED.status`,
      [s(r.unit_id), name, statusOf(r)]
    );
  }
  return rows.length;
}

async function syncWarehouses(run: Run): Promise<number> {
  const rows = await fetchDictionary(MISA_DATA_TYPES.STOCK);
  for (const r of rows) {
    const code = s(r.stock_code);
    if (!code) continue;
    await run(
      `INSERT INTO warehouses (misa_id, stock_code, stock_name, source, status)
       VALUES ($1,$2,$3,'misa',$4)
       ON CONFLICT (stock_code) DO UPDATE SET
         misa_id = EXCLUDED.misa_id, stock_name = EXCLUDED.stock_name,
         source = 'misa', status = EXCLUDED.status`,
      [s(r.stock_id), code, s(r.stock_name) ?? code, statusOf(r)]
    );
  }
  return rows.length;
}

async function syncSuppliers(run: Run): Promise<number> {
  const rows = await fetchDictionary(MISA_DATA_TYPES.ACCOUNT_OBJECT);
  // object_type: 0 = chỉ Khách hàng -> bỏ; 1 = NCC, 2 = cả hai -> giữ.
  const suppliers = rows.filter((r) => r.object_type == null || Number(r.object_type) !== 0);
  for (const r of suppliers) {
    const code = s(r.account_object_code);
    if (!code) continue;
    await run(
      `INSERT INTO suppliers
         (supplier_code, supplier_name, tax_code, address, contact_name, phone, email, bank_account, misa_id, source, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'misa',$10)
       ON CONFLICT (supplier_code) DO UPDATE SET
         supplier_name = EXCLUDED.supplier_name,
         tax_code      = EXCLUDED.tax_code,
         address       = EXCLUDED.address,
         contact_name  = EXCLUDED.contact_name,
         phone         = EXCLUDED.phone,
         email         = EXCLUDED.email,
         bank_account  = COALESCE(EXCLUDED.bank_account, suppliers.bank_account),
         misa_id       = EXCLUDED.misa_id,
         source        = 'misa',
         status        = EXCLUDED.status`,
      [
        code,
        s(r.account_object_name) ?? code,
        s(r.company_tax_code),
        s(r.address),
        s(r.contact_name),
        s(r.tel) ?? s(r.phone),
        s(r.email),
        s(r.bank_account),
        s(r.account_object_id),
        statusOf(r),
      ]
    );
  }
  return suppliers.length;
}

async function syncProducts(run: Run): Promise<number> {
  const rows = await fetchDictionary(MISA_DATA_TYPES.INVENTORY_ITEM);
  for (const r of rows) {
    const code = s(r.inventory_item_code);
    if (!code) continue;
    await run(
      `INSERT INTO products
         (item_code, item_name, category, unit, vat_rate, accounting_code, misa_id, source, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'misa',$8)
       ON CONFLICT (item_code) DO UPDATE SET
         item_name       = EXCLUDED.item_name,
         category        = COALESCE(EXCLUDED.category, products.category),
         unit            = EXCLUDED.unit,
         vat_rate        = EXCLUDED.vat_rate,
         accounting_code = COALESCE(EXCLUDED.accounting_code, products.accounting_code),
         misa_id         = EXCLUDED.misa_id,
         source          = 'misa',
         status          = EXCLUDED.status`,
      [
        code,
        s(r.inventory_item_name) ?? code,
        s(r.category_name),
        s(r.unit_name) ?? "PCS",
        num(r.vat_rate, 10),
        s(r.purchase_account),
        s(r.inventory_item_id),
        statusOf(r),
      ]
    );
  }
  return rows.length;
}

async function syncOrgUnits(run: Run): Promise<number> {
  const rows = await fetchDictionary(MISA_DATA_TYPES.ORG_UNIT);
  // business_units cần company_id NOT NULL -> gắn vào pháp nhân đầu tiên.
  // Nếu chưa có công ty nào (đồng bộ chạy trước seed), bỏ qua; lần đồng bộ
  // thủ công sau (khi công ty đã tồn tại) sẽ nạp phòng ban.
  const co = await run(`SELECT id FROM companies ORDER BY id LIMIT 1`);
  const companyId = co[0]?.id;
  if (companyId == null) return 0;
  for (const r of rows) {
    const code = s(r.organization_unit_code);
    if (!code) continue;
    await run(
      `INSERT INTO business_units (company_id, bu_code, bu_name, misa_id, source)
       VALUES ($1,$2,$3,$4,'misa')
       ON CONFLICT (company_id, bu_code) DO UPDATE SET
         bu_name = EXCLUDED.bu_name, misa_id = EXCLUDED.misa_id, source = 'misa'`,
      [companyId, code, s(r.organization_unit_name) ?? code, s(r.organization_unit_id)]
    );
  }
  return rows.length;
}

async function recordState(run: Run, dataType: number, label: string, count: number): Promise<void> {
  await run(
    `INSERT INTO misa_sync_state (data_type, label, last_sync_time, last_count, last_run)
     VALUES ($1,$2, now(), $3, now())
     ON CONFLICT (data_type) DO UPDATE SET
       label = EXCLUDED.label, last_sync_time = now(),
       last_count = EXCLUDED.last_count, last_run = now()`,
    [dataType, label, count]
  );
}

/** Đồng bộ toàn bộ master data từ MISA. Thứ tự: ĐVT & Kho -> NCC -> Hàng hóa -> Phòng ban. */
export async function syncMisaMasterData(run: Run): Promise<SyncResult> {
  const steps: [number, string, (r: Run) => Promise<number>][] = [
    [MISA_DATA_TYPES.UNIT, "Đơn vị tính", syncUnits],
    [MISA_DATA_TYPES.STOCK, "Kho", syncWarehouses],
    [MISA_DATA_TYPES.ACCOUNT_OBJECT, "Nhà cung cấp", syncSuppliers],
    [MISA_DATA_TYPES.INVENTORY_ITEM, "Hàng hóa", syncProducts],
    [MISA_DATA_TYPES.ORG_UNIT, "Phòng ban", syncOrgUnits],
  ];
  const counts: Record<string, number> = {};
  let total = 0;
  for (const [dataType, label, fn] of steps) {
    const c = await fn(run);
    counts[label] = c;
    total += c;
    await recordState(run, dataType, label, c);
  }
  return { mode: misaMode(), counts, total };
}
