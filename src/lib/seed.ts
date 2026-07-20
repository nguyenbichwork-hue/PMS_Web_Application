import type { QueryDb } from "./db";
import { evaluateMatch } from "./matching";

// Seeds demo data exactly once (guarded by a company-count check).
export async function seed(pg: QueryDb): Promise<void> {
  const existing = await pg.query<{ c: number }>(`SELECT count(*)::int AS c FROM companies`);
  if ((existing.rows[0]?.c ?? 0) > 0) return;

  const one = async (sql: string, params: unknown[] = []) =>
    (await pg.query<{ id: number }>(sql, params)).rows[0];

  // ---------------- Companies ----------------
  const kh = await one(
    `INSERT INTO companies (company_code, company_name, tax_code, address)
     VALUES ('KH','K-Homès','0312345678','12 Nguyễn Huệ, Q1, TP.HCM') RETURNING id`
  );
  const wh = await one(
    `INSERT INTO companies (company_code, company_name, tax_code, address)
     VALUES ('WH','WellHome','0398765432','45 Lê Lợi, Q1, TP.HCM') RETURNING id`
  );
  const pk = await one(
    `INSERT INTO companies (company_code, company_name, tax_code, address)
     VALUES ('PK','Peaki','0356781234','88 Trần Hưng Đạo, Q5, TP.HCM') RETURNING id`
  );

  // ---------------- Business units ----------------
  for (const [cid, code, name] of [
    [kh.id, "KH-OPS", "Operations"],
    [kh.id, "KH-PRJ", "Projects"],
    [wh.id, "WH-OPS", "Operations"],
    [pk.id, "PK-RD", "R&D"],
  ] as [number, string, string][]) {
    await pg.query(
      `INSERT INTO business_units (company_id, bu_code, bu_name) VALUES ($1,$2,$3)`,
      [cid, code, name]
    );
  }

  // ---------------- Users (one per role) ----------------
  const users = [
    ["Emma Nguyen", "employee@demo.com", "Operations", "Employee", kh.id],
    ["Peter Tran", "purchasing@demo.com", "Procurement", "Purchasing", kh.id],
    ["Michael Le", "manager@demo.com", "Operations", "Manager", kh.id],
    ["Fiona Pham", "finance@demo.com", "Finance", "Finance", kh.id],
    ["Alan Admin", "admin@demo.com", "IT", "Admin", kh.id],
  ] as [string, string, string, string, number][];
  const userId: Record<string, number> = {};
  for (const [name, email, dept, role, cid] of users) {
    const u = await one(
      `INSERT INTO users (name, email, department, role, company_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [name, email, dept, role, cid]
    );
    userId[role] = u.id;
  }

  // ---------------- Supplier master ----------------
  const bosch = await one(
    `INSERT INTO suppliers (supplier_code, supplier_name, tax_code, address, contact_name, phone, email, bank_account, payment_term, currency)
     VALUES ('SUP-BOSCH','Bosch Vietnam','0301122334','Etown, Cộng Hòa, Tân Bình, TP.HCM','Mr. Klaus','028-1234-5678','sales@bosch.vn','VCB-007-123456','NET30','VND') RETURNING id`
  );
  await one(
    `INSERT INTO suppliers (supplier_code, supplier_name, tax_code, address, contact_name, phone, email, payment_term, currency)
     VALUES ('SUP-LG','LG Electronics VN','0305566778','Hai Bà Trưng, Hà Nội','Ms. Ha','024-9999-1111','sales@lg.vn','NET45','VND') RETURNING id`
  );

  // ---------------- Product master ----------------
  const prod: Record<string, { id: number; name: string; unit: string; vat: number; price: number }> = {};
  const products = [
    ["cook", "BOSCH-COOK-01", "Bếp từ Bosch", "Appliance", "PCS", 10, 15_000_000],
    ["dish", "BOSCH-DW-01", "Máy rửa chén Bosch", "Appliance", "PCS", 10, 20_000_000],
    ["lock", "BOSCH-LOCK-01", "Khóa Bosch", "Hardware", "PCS", 10, 3_000_000],
  ] as [string, string, string, string, string, number, number][];
  for (const [key, code, name, cat, unit, vat, price] of products) {
    const p = await one(
      `INSERT INTO products (item_code, item_name, category, unit, vat_rate, default_supplier, accounting_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [code, name, cat, unit, vat, bosch.id, "156-" + code]
    );
    prod[key] = { id: p.id, name, unit, vat, price };
  }

  // ---------------- Approval rules (configurable) ----------------
  const rules = [
    [0, 20_000_000, JSON.stringify(["Manager"])],
    [20_000_000, 100_000_000, JSON.stringify(["Manager", "Finance"])],
    [100_000_000, null, JSON.stringify(["Manager", "Finance", "Admin"])],
  ] as [number, number | null, string][];
  for (const [min, max, levels] of rules) {
    await pg.query(
      `INSERT INTO approval_rules (document_type, amount_min, amount_max, levels)
       VALUES ('PR',$1,$2,$3::jsonb)`,
      [min, max, levels]
    );
  }

  // ---------------- 5 full PR → PO → GR → Invoice chains ----------------
  const chains = [
    { key: "cook", qty: 5, scenario: "match" as const },
    { key: "dish", qty: 3, scenario: "match" as const },
    { key: "lock", qty: 10, scenario: "match" as const },
    { key: "cook", qty: 4, scenario: "qty" as const }, // invoice bills 6
    { key: "dish", qty: 2, scenario: "price" as const }, // invoice unit price +2M
  ];

  let idx = 0;
  for (const ch of chains) {
    idx++;
    const p = prod[ch.key];
    const subtotal = ch.qty * p.price;
    const vat = Math.round((subtotal * p.vat) / 100);
    const grand = subtotal + vat;
    const seq = String(idx).padStart(4, "0");
    const day = String(idx).padStart(2, "0");

    // PR (already approved & completed)
    const pr = await one(
      `INSERT INTO purchase_requests
        (pr_number, request_date, requester_id, department, company_id, purpose, priority, required_date, status, total_amount, current_level)
       VALUES ($1,$2,$3,'Operations',$4,$5,'Normal',$6,'Completed',$7,2) RETURNING id`,
      [
        `PR-2026-${seq}`,
        `2026-06-${day}`,
        userId["Employee"],
        kh.id,
        `Mua ${p.name} cho dự án`,
        `2026-07-${day}`,
        subtotal,
      ]
    );
    await pg.query(
      `INSERT INTO purchase_request_items
        (pr_id, item_code, item_name, description, quantity, unit, estimated_price, supplier_suggestion, line_no)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1)`,
      [pr.id, products.find((x) => x[2] === p.name)?.[1], p.name, p.name, ch.qty, p.unit, p.price, bosch.id]
    );
    await pg.query(
      `INSERT INTO approval_history (document_type, document_id, approver_id, approval_level, status, comment, approved_time)
       VALUES ('PR',$1,$2,1,'Approved','Approved by manager','2026-06-${day}')`,
      [pr.id, userId["Manager"]]
    );

    // PO (generated from PR, sent to supplier & received)
    const lineAmount = subtotal + vat;
    const po = await one(
      `INSERT INTO purchase_orders
        (po_number, pr_id, supplier_id, company_id, order_date, delivery_date, payment_term, currency, status, subtotal, vat_total, grand_total)
       VALUES ($1,$2,$3,$4,$5,$6,'NET30','VND','Received',$7,$8,$9) RETURNING id`,
      [`PO-2026-${seq}`, pr.id, bosch.id, kh.id, `2026-06-${day}`, `2026-07-${day}`, subtotal, vat, grand]
    );
    const poItem = await one(
      `INSERT INTO purchase_order_items
        (po_id, item_code, description, quantity, unit, unit_price, discount, vat_rate, amount, line_no)
       VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,1) RETURNING id`,
      [po.id, products.find((x) => x[2] === p.name)?.[1], p.name, ch.qty, p.unit, p.price, p.vat, lineAmount]
    );

    // Goods Receipt (full quantity received)
    const gr = await one(
      `INSERT INTO goods_receipts (gr_number, po_id, receive_date, warehouse, receiver_id, status)
       VALUES ($1,$2,$3,'Kho Trung Tâm',$4,'Completed') RETURNING id`,
      [`GR-2026-${seq}`, po.id, `2026-07-${day}`, userId["Purchasing"]]
    );
    await pg.query(
      `INSERT INTO goods_receipt_items (gr_id, po_item_id, item_code, description, received_qty)
       VALUES ($1,$2,$3,$4,$5)`,
      [gr.id, poItem.id, products.find((x) => x[2] === p.name)?.[1], p.name, ch.qty]
    );

    // Invoice — scenario-dependent
    let invQty = ch.qty;
    let invPrice = p.price;
    if (ch.scenario === "qty") invQty = ch.qty + 2; // exceeds PO/received
    if (ch.scenario === "price") invPrice = p.price + 2_000_000; // over-billed
    const invSub = invQty * invPrice;
    const invVat = Math.round((invSub * p.vat) / 100);
    const invTotal = invSub + invVat;

    const evalResult = evaluateMatch({
      invoiceSupplierId: bosch.id,
      poSupplierId: bosch.id,
      supplierName: "Bosch Vietnam",
      invoiceQty: invQty,
      poQty: ch.qty,
      receivedQty: ch.qty,
      invoiceUnitPrice: invPrice,
      poUnitPrice: p.price,
      invoiceTotal: invTotal,
      expectedTotal: grand,
    });

    const statusMap: Record<string, string> = {
      MATCHED: "Matched",
      WARNING: "Warning",
      FAILED: "Failed",
    };
    const inv = await one(
      `INSERT INTO invoices
        (invoice_number, invoice_date, supplier_id, tax_code, po_id, total_amount, vat_amount, status, match_result)
       VALUES ($1,$2,$3,'0301122334',$4,$5,$6,$7,$8) RETURNING id`,
      [
        `INV-BOSCH-${seq}`,
        `2026-07-${day}`,
        bosch.id,
        po.id,
        invTotal,
        invVat,
        statusMap[evalResult.overall],
        evalResult.overall,
      ]
    );
    await pg.query(
      `INSERT INTO invoice_items (invoice_id, item_code, description, quantity, unit_price, amount)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [inv.id, products.find((x) => x[2] === p.name)?.[1], p.name, invQty, invPrice, invSub]
    );
    for (const c of evalResult.checks) {
      await pg.query(
        `INSERT INTO invoice_matching (invoice_id, check_name, result, reason)
         VALUES ($1,$2,$3,$4)`,
        [inv.id, c.check_name, c.result, c.reason]
      );
    }
  }

  // ---------------- Extra live-demo documents ----------------
  // A PR awaiting the Manager's approval (so the approval queue is not empty).
  const pendingSubtotal = 2 * prod["lock"].price;
  const pr6 = await one(
    `INSERT INTO purchase_requests
      (pr_number, request_date, requester_id, department, company_id, purpose, priority, required_date, status, total_amount, current_level)
     VALUES ('PR-2026-0006', '2026-07-15', $1, 'Operations', $2, 'Bổ sung khóa cửa cho tòa B', 'High', '2026-07-25', 'Pending Approval', $3, 0) RETURNING id`,
    [userId["Employee"], kh.id, pendingSubtotal]
  );
  await pg.query(
    `INSERT INTO purchase_request_items
      (pr_id, item_code, item_name, description, quantity, unit, estimated_price, supplier_suggestion, line_no)
     VALUES ($1,'BOSCH-LOCK-01','Khóa Bosch','Khóa cửa thông minh',2,'PCS',$2,$3,1)`,
    [pr6.id, prod["lock"].price, bosch.id]
  );
  await pg.query(
    `INSERT INTO approval_history (document_type, document_id, approver_id, approval_level, status, comment, approved_time)
     VALUES ('PR',$1,$2,0,'Submitted','Submitted for approval','2026-07-15')`,
    [pr6.id, userId["Employee"]]
  );

  // A Draft PR still being edited.
  await pg.query(
    `INSERT INTO purchase_requests
      (pr_number, request_date, requester_id, department, company_id, purpose, priority, required_date, status, total_amount)
     VALUES ('PR-2026-0007', '2026-07-16', $1, 'Operations', $2, 'Dự trù thiết bị bếp mẫu', 'Normal', '2026-08-01', 'Draft', 0)`,
    [userId["Employee"], wh.id]
  );
}

// =====================================================================
// DỮ LIỆU BỔ SUNG (idempotent) — mua thêm thiết bị IT/văn phòng từ nhiều NCC
// khác nhau, đủ trạng thái nghiệp vụ. Chạy sau seed() mỗi lần khởi động nhưng
// CHỈ NẠP MỘT LẦN (mốc: đã có NCC 'SUP-DELL'). Không xóa dữ liệu hiện có.
// =====================================================================
export async function seedMoreData(pg: QueryDb): Promise<void> {
  const done = await pg.query<{ c: number }>(`SELECT count(*)::int c FROM suppliers WHERE supplier_code='SUP-DELL'`);
  if ((done.rows[0]?.c ?? 0) > 0) return;

  const one = async (sql: string, p: unknown[] = []) => (await pg.query<{ id: number }>(sql, p)).rows[0];
  const scalar = async (sql: string, p: unknown[] = []) => (await pg.query<{ id: number }>(sql, p)).rows[0]?.id as number | undefined;

  const kh = await scalar(`SELECT id FROM companies WHERE company_code='KH'`);
  if (!kh) return; // dữ liệu gốc chưa có → bỏ qua
  const wh = (await scalar(`SELECT id FROM companies WHERE company_code='WH'`)) ?? kh;
  const pk = (await scalar(`SELECT id FROM companies WHERE company_code='PK'`)) ?? kh;
  const uid = async (email: string) => (await scalar(`SELECT id FROM users WHERE email=$1`, [email])) ?? null;
  const uEmp = await uid("employee@demo.com");
  const uPur = await uid("purchasing@demo.com");
  const uMan = await uid("manager@demo.com");
  const uFin = await uid("finance@demo.com");

  // ---- Nhà cung cấp mới ----
  const suppliers: [string, string, string, string, string, string, string, string, string][] = [
    ["SUP-DELL", "Dell Technologies VN", "0301234501", "Bitexco, Q1, TP.HCM", "Mr. Huy", "028-3822-1111", "b2b@dell.vn", "ACB-111-222", "NET30"],
    ["SUP-HP", "HP Inc. Vietnam", "0301234502", "Keangnam, Hà Nội", "Ms. Lan", "024-3556-2222", "sales@hp.vn", "VCB-333-444", "NET45"],
    ["SUP-LOGI", "An Phát (Logitech)", "0301234503", "Thái Hà, Hà Nội", "Mr. Sơn", "024-3999-3333", "order@anphat.vn", "TCB-555-666", "NET15"],
    ["SUP-SAMSUNG", "Samsung Vina", "0301234504", "SC VivoCity, Q7, TP.HCM", "Ms. Trang", "028-3776-4444", "corp@samsung.vn", "BIDV-777-888", "NET30"],
    ["SUP-PANA", "Panasonic Vietnam", "0301234505", "Long Biên, Hà Nội", "Mr. Bình", "024-3873-5555", "sales@panasonic.vn", "MB-888-999", "NET30"],
    ["SUP-FPT", "FPT Trading", "0301234506", "Cầu Giấy, Hà Nội", "Ms. Mai", "024-7300-6666", "b2b@fpt.com.vn", "VCB-999-000", "NET30"],
    ["SUP-DAIKIN", "Daikin Air VN", "0301234507", "Bình Thạnh, TP.HCM", "Mr. Tú", "028-3512-7777", "project@daikin.vn", "ACB-000-111", "NET45"],
    ["SUP-OFFICE", "Nội thất Hòa Phát", "0301234508", "KCN Phố Nối, Hưng Yên", "Ms. Hoa", "0221-3765-8888", "sales@noithathoaphat.vn", "VCB-121-212", "NET30"],
  ];
  const supId: Record<string, number> = {};
  for (const [code, name, tax, addr, ct, ph, em, bank, term] of suppliers) {
    const s = await one(
      `INSERT INTO suppliers (supplier_code, supplier_name, tax_code, address, contact_name, phone, email, bank_account, payment_term, currency)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'VND') RETURNING id`,
      [code, name, tax, addr, ct, ph, em, bank, term]
    );
    supId[code] = s.id;
  }

  // ---- Thiết bị / hàng hóa mới ----  [code, name, category, unit, vat, price, supplierCode]
  const products: [string, string, string, string, number, number, string][] = [
    ["DELL-LAT-5540", "Laptop Dell Latitude 5540", "Thiết bị IT", "Cái", 10, 22_500_000, "SUP-DELL"],
    ["DELL-MON-27", 'Màn hình Dell 27" P2725H', "Thiết bị IT", "Cái", 10, 4_200_000, "SUP-DELL"],
    ["DELL-DOCK", "Dock Dell WD19S", "Phụ kiện", "Cái", 10, 3_100_000, "SUP-DELL"],
    ["HP-LJ-M428", "Máy in HP LaserJet M428", "Thiết bị IT", "Cái", 10, 6_800_000, "SUP-HP"],
    ["HP-TONER-59A", "Mực in HP 59A", "Vật tư", "Hộp", 10, 2_100_000, "SUP-HP"],
    ["HP-SWITCH-24", "Switch mạng HP 24 cổng", "Thiết bị IT", "Cái", 10, 5_400_000, "SUP-HP"],
    ["LOGI-MK270", "Bộ chuột phím Logitech MK270", "Phụ kiện", "Bộ", 10, 450_000, "SUP-LOGI"],
    ["LOGI-C920", "Webcam Logitech C920", "Phụ kiện", "Cái", 10, 1_650_000, "SUP-LOGI"],
    ["LOGI-H390", "Tai nghe Logitech H390", "Phụ kiện", "Cái", 10, 650_000, "SUP-LOGI"],
    ["SS-SSD-1TB", "SSD Samsung 980 1TB", "Vật tư", "Cái", 10, 1_900_000, "SUP-SAMSUNG"],
    ["SS-MON-32", 'Màn hình Samsung 32" cong', "Thiết bị IT", "Cái", 10, 7_500_000, "SUP-SAMSUNG"],
    ["PANA-PROJ", "Máy chiếu Panasonic PT-VMZ", "Thiết bị IT", "Cái", 10, 28_000_000, "SUP-PANA"],
    ["DAIKIN-AC-2HP", "Máy lạnh Daikin Inverter 2HP", "Thiết bị", "Bộ", 10, 18_500_000, "SUP-DAIKIN"],
    ["OFF-CHAIR-ERG", "Ghế công thái học Hòa Phát", "Nội thất", "Cái", 10, 3_200_000, "SUP-OFFICE"],
    ["OFF-DESK-ADJ", "Bàn nâng hạ điện Hòa Phát", "Nội thất", "Cái", 10, 4_800_000, "SUP-OFFICE"],
    ["FPT-UPS-3KVA", "Bộ lưu điện UPS 3KVA", "Thiết bị IT", "Cái", 10, 9_200_000, "SUP-FPT"],
  ];
  const prod: Record<string, { id: number; name: string; unit: string; vat: number; price: number; code: string; sup: string }> = {};
  for (const [code, name, cat, unit, vat, price, sup] of products) {
    const pRow = await one(
      `INSERT INTO products (item_code, item_name, category, unit, vat_rate, default_supplier, accounting_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [code, name, cat, unit, vat, supId[sup], "156-" + code]
    );
    prod[code] = { id: pRow.id, name, unit, vat, price, code, sup };
  }

  // ---- Chuỗi mua sắm thực tế theo từng trạng thái ----
  let seq = 100;
  type Stage = "draft_pr" | "pending_pr" | "approved_po" | "sent_po" | "partial_gr" | "received" | "invoiced" | "partpaid" | "paid";
  const chain = async (o: {
    code: string; qty: number; purpose: string; day: number; stage: Stage;
    company?: number; dept?: string; priority?: string; partial?: number;
  }) => {
    seq++;
    const p = prod[o.code];
    const company = o.company ?? kh;
    const s = String(seq).padStart(4, "0");
    const date = `2026-07-${String(o.day).padStart(2, "0")}`;
    const deliver = `2026-08-${String(o.day).padStart(2, "0")}`;
    const subtotal = o.qty * p.price;
    const vat = Math.round((subtotal * p.vat) / 100);
    const grand = subtotal + vat;
    const supplier = supId[p.sup];

    const isDraft = o.stage === "draft_pr";
    const isPending = o.stage === "pending_pr";
    const prStatus = isDraft ? "Draft" : isPending ? "Pending Approval" : "Completed";
    const pr = await one(
      `INSERT INTO purchase_requests (pr_number, request_date, requester_id, department, company_id, purpose, priority, required_date, status, total_amount, current_level, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$3) RETURNING id`,
      [`PR-2026-${s}`, date, uEmp, o.dept ?? "Operations", company, o.purpose, o.priority ?? "Normal", deliver, prStatus, subtotal, isDraft || isPending ? 0 : 2]
    );
    await pg.query(
      `INSERT INTO purchase_request_items (pr_id, item_code, item_name, description, quantity, unit, estimated_price, supplier_suggestion, line_no)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1)`,
      [pr.id, p.code, p.name, p.name, o.qty, p.unit, p.price, supplier]
    );
    if (isPending) {
      await pg.query(
        `INSERT INTO approval_history (document_type, document_id, approver_id, approval_level, status, comment, approved_time)
         VALUES ('PR',$1,$2,0,'Submitted','Gửi duyệt',$3)`,
        [pr.id, uEmp, date]
      );
      return;
    }
    if (isDraft) return;
    await pg.query(
      `INSERT INTO approval_history (document_type, document_id, approver_id, approval_level, status, comment, approved_time)
       VALUES ('PR',$1,$2,1,'Approved','Duyệt',$3)`,
      [pr.id, uMan, date]
    );

    const poStatus =
      o.stage === "approved_po" ? "Approved" :
      o.stage === "sent_po" ? "Sent" :
      o.stage === "partial_gr" ? "Partially Received" : "Received";
    const po = await one(
      `INSERT INTO purchase_orders (po_number, pr_id, supplier_id, company_id, order_date, delivery_date, payment_term, currency, status, subtotal, vat_total, grand_total, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,'NET30','VND',$7,$8,$9,$10,$11) RETURNING id`,
      [`PO-2026-${s}`, pr.id, supplier, company, date, deliver, poStatus, subtotal, vat, grand, uPur]
    );
    const poItem = await one(
      `INSERT INTO purchase_order_items (po_id, item_code, description, quantity, unit, unit_price, discount, vat_rate, amount, line_no)
       VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,1) RETURNING id`,
      [po.id, p.code, p.name, o.qty, p.unit, p.price, p.vat, grand]
    );
    if (o.stage === "approved_po" || o.stage === "sent_po") return;

    const recvQty = o.stage === "partial_gr" ? (o.partial ?? Math.max(1, Math.floor(o.qty / 2))) : o.qty;
    const gr = await one(
      `INSERT INTO goods_receipts (gr_number, po_id, receive_date, warehouse, receiver_id, status)
       VALUES ($1,$2,$3,'Kho Trung Tâm',$4,'Completed') RETURNING id`,
      [`GR-2026-${s}`, po.id, date, uPur]
    );
    await pg.query(
      `INSERT INTO goods_receipt_items (gr_id, po_item_id, item_code, description, received_qty) VALUES ($1,$2,$3,$4,$5)`,
      [gr.id, poItem.id, p.code, p.name, recvQty]
    );
    if (o.stage === "partial_gr" || o.stage === "received") return;

    const invSub = o.qty * p.price;
    const ev = evaluateMatch({
      invoiceSupplierId: supplier, poSupplierId: supplier, supplierName: p.name,
      invoiceQty: o.qty, poQty: o.qty, receivedQty: recvQty,
      invoiceUnitPrice: p.price, poUnitPrice: p.price,
      invoiceTotal: grand, expectedTotal: grand, invoiceVat: vat, expectedVat: vat,
    });
    const stMap: Record<string, string> = { MATCHED: "Matched", WARNING: "Warning", FAILED: "Failed" };
    const inv = await one(
      `INSERT INTO invoices (invoice_number, invoice_date, supplier_id, po_id, total_amount, vat_amount, status, match_result, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [`INV-2026-${s}`, date, supplier, po.id, grand, vat, stMap[ev.overall], ev.overall, uFin]
    );
    await pg.query(
      `INSERT INTO invoice_items (invoice_id, item_code, description, quantity, unit_price, amount) VALUES ($1,$2,$3,$4,$5,$6)`,
      [inv.id, p.code, p.name, o.qty, p.price, invSub]
    );
    for (const c of ev.checks)
      await pg.query(`INSERT INTO invoice_matching (invoice_id, check_name, result, reason) VALUES ($1,$2,$3,$4)`, [inv.id, c.check_name, c.result, c.reason]);
    if (o.stage === "invoiced") return;

    if (o.stage === "paid") {
      await pg.query(
        `INSERT INTO payments (invoice_id, payment_date, amount, method, reference, created_by) VALUES ($1,$2,$3,'Chuyển khoản',$4,$5)`,
        [inv.id, date, grand, `UNC-${s}`, uFin]
      );
      await pg.query(`UPDATE invoices SET status='Paid' WHERE id=$1`, [inv.id]);
    } else if (o.stage === "partpaid") {
      await pg.query(
        `INSERT INTO payments (invoice_id, payment_date, amount, method, reference, created_by) VALUES ($1,$2,$3,'Chuyển khoản',$4,$5)`,
        [inv.id, date, Math.round(grand / 2), `UNC-${s}A`, uFin]
      );
    }
  };

  await chain({ code: "DELL-LAT-5540", qty: 5, purpose: "Trang bị laptop cho phòng Dự án", dept: "Projects", day: 3, stage: "paid", priority: "High" });
  await chain({ code: "DELL-MON-27", qty: 10, purpose: "Bổ sung màn hình cho Vận hành", day: 5, stage: "partpaid" });
  await chain({ code: "HP-LJ-M428", qty: 2, purpose: "Máy in cho phòng Kế toán", dept: "Finance", day: 6, stage: "received" });
  await chain({ code: "OFF-CHAIR-ERG", qty: 15, purpose: "Ghế công thái học cho nhân viên", day: 7, stage: "sent_po" });
  await chain({ code: "DAIKIN-AC-2HP", qty: 3, purpose: "Lắp máy lạnh văn phòng tầng 3", day: 8, stage: "pending_pr", priority: "High" });
  await chain({ code: "LOGI-C920", qty: 20, purpose: "Bộ WFH (webcam) cho nhân viên", day: 9, stage: "invoiced" });
  await chain({ code: "SS-MON-32", qty: 6, purpose: "Màn hình lớn cho phòng thiết kế", company: pk, dept: "R&D", day: 10, stage: "partial_gr", partial: 4 });
  await chain({ code: "PANA-PROJ", qty: 2, purpose: "Máy chiếu cho phòng họp lớn", day: 11, stage: "pending_pr", priority: "Urgent" });
  await chain({ code: "SS-SSD-1TB", qty: 30, purpose: "Nâng cấp SSD toàn bộ máy trạm", day: 12, stage: "paid" });
  await chain({ code: "FPT-UPS-3KVA", qty: 4, purpose: "Lưu điện cho phòng server", day: 13, stage: "approved_po" });
  await chain({ code: "OFF-DESK-ADJ", qty: 10, purpose: "Bàn nâng hạ cho khối kỹ thuật", day: 14, stage: "draft_pr" });
  await chain({ code: "LOGI-MK270", qty: 25, purpose: "Thay chuột phím hỏng", company: wh, day: 15, stage: "received" });
  await chain({ code: "HP-SWITCH-24", qty: 2, purpose: "Mở rộng mạng LAN tầng 2", day: 16, stage: "paid" });
}
