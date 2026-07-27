"use server";
import { revalidatePath } from "next/cache";
import { query, queryOne, withTransaction, firstRow } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { canAccessCompany, isCrossCompany } from "@/lib/access";
import { evaluateMatch, buildPoPriceIndex, findPoPrice, type MatchLine } from "@/lib/matching";
import { autoMatchInvoiceToPo, scoreCandidate, type AutoMatchPo, type CandidateScore } from "@/lib/po-automatch";
import { fetchPurchaseInvoices, googleSyncConfigured } from "@/lib/google-invoices";
import type { SheetInvoice } from "@/lib/google-sheet-parse";
import { writeInvoiceAllocations, invoiceDupKey, type AllocInvItem, type AllocPoItem } from "@/lib/allocation";
import { logAudit } from "@/lib/audit";

// =====================================================================
// ĐỒNG BỘ HÓA ĐƠN từ Google Sheet → tự map vào PO (KHÔNG cần cột "Số PO").
// Dùng khóa tổng hợp NCC(MST)+mã/tên+giá+tiền (src/lib/po-automatch.ts).
//   • previewInvoiceSyncAction — đọc Sheet, auto-match, trả bản xem trước (KHÔNG ghi).
//   • confirmInvoiceSyncAction — ghi các hóa đơn người dùng xác nhận (transaction).
// =====================================================================

// Dòng tối giản để đối chiếu ở client (reconcileLines) — dùng chung kiểu ReconLine.
export interface SyncLine {
  itemCode: string | null;
  description: string | null;
  quantity: number;
  unitPrice: number;
  vatRate: number | null;
  receivedQty?: number | null; // SL đã nhận (GRN) — chỉ có ở dòng PO
}

export interface SyncPreviewItem {
  sourceRef: string;              // Invoice_ID (khóa nguồn)
  invoiceNumber: string | null;
  invoiceSeries: string | null;
  invoiceDate: string | null;
  sellerName: string | null;
  sellerTaxId: string | null;
  total: number;
  vat: number;
  lineCount: number;
  level: "AUTO" | "REVIEW" | "NONE";
  matchKey: string | null;
  invLines: SyncLine[];           // dòng hóa đơn (để bung đối chiếu từng dòng)
  best: {
    poId: number; poNumber: string; supplierName: string | null;
    score: number; coverage: number; matchedLines: number; totalLines: number; reasons: string[];
  } | null;
  // Mỗi ứng viên kèm dòng PO để client tự đối chiếu theo PO đang chọn.
  candidates: { poId: number; poNumber: string; score: number; poLines: SyncLine[] }[];
}

export interface SyncPreview {
  configured: boolean;
  error?: string;
  totalPurchase: number;   // tổng HĐ mua vào đọc được
  alreadyImported: number; // đã nhập trước đó (bỏ qua)
  items: SyncPreviewItem[];
}

/** Nạp danh sách PO đang mở (kèm dòng + MST NCC + phần tiền còn lại) để auto-match. */
async function loadCandidatePos(user: Awaited<ReturnType<typeof requireUser>>): Promise<AutoMatchPo[]> {
  const where = [`po.status IN ('Sent','Confirmed','Approved','Partially Received','Received')`];
  const params: unknown[] = [];
  // Scope công ty: đội back-office (không phải Nhân viên) thấy PO mọi pháp nhân.
  if (!isCrossCompany(user) && user.company_id != null) {
    params.push(user.company_id);
    where.push(`po.company_id = $${params.length}`);
  }
  const pos = await query<{
    id: number; po_number: string; supplier_id: number | null; supplier_name: string | null;
    supplier_tax: string | null; grand_total: string; invoiced: string;
  }>(
    `SELECT po.id, po.po_number, po.supplier_id, s.supplier_name, s.tax_code AS supplier_tax,
            po.grand_total,
            COALESCE((SELECT sum(i.total_amount) FROM invoices i
                       WHERE i.po_id = po.id AND i.status <> 'Failed'),0) AS invoiced
       FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po.supplier_id
      WHERE ${where.join(" AND ")}
      ORDER BY po.id DESC`,
    params
  );
  if (pos.length === 0) return [];

  const lines = await query<{ id: number; po_id: number; item_code: string | null; description: string; unit_price: string; quantity: string; vat_rate: string | null; received: string }>(
    `SELECT poi.id, poi.po_id, poi.item_code, poi.description, poi.unit_price, poi.quantity, poi.vat_rate,
            COALESCE((SELECT sum(gri.received_qty) FROM goods_receipt_items gri WHERE gri.po_item_id = poi.id),0) AS received
       FROM purchase_order_items poi
      WHERE poi.po_id = ANY($1::bigint[])`,
    [pos.map((p) => p.id)]
  );
  const linesByPo = new Map<number, AutoMatchPo["lines"]>();
  for (const l of lines) {
    const arr = linesByPo.get(l.po_id) ?? [];
    arr.push({ itemCode: l.item_code, description: l.description, unitPrice: Number(l.unit_price), quantity: Number(l.quantity), vatRate: l.vat_rate == null ? null : Number(l.vat_rate), poItemId: l.id, receivedQty: Number(l.received) });
    linesByPo.set(l.po_id, arr);
  }

  return pos.map((p) => {
    const grand = Number(p.grand_total);
    return {
      poId: p.id,
      poNumber: p.po_number,
      supplierId: p.supplier_id,
      supplierTaxId: p.supplier_tax,
      supplierName: p.supplier_name,
      grandTotal: grand,
      remainingAmount: Math.max(0, grand - Number(p.invoiced)),
      lines: linesByPo.get(p.id) ?? [],
    };
  });
}

/** Đọc Sheet + auto-match, trả bản xem trước. KHÔNG ghi DB. */
export async function previewInvoiceSyncAction(): Promise<SyncPreview> {
  const user = await requireUser();
  if (!can(user.role, "invoice.manage")) throw new Error("FORBIDDEN");
  if (!googleSyncConfigured())
    return { configured: false, totalPurchase: 0, alreadyImported: 0, items: [] };

  let invoices: SheetInvoice[];
  try {
    invoices = await fetchPurchaseInvoices();
  } catch (e) {
    return { configured: true, error: e instanceof Error ? e.message : String(e), totalPurchase: 0, alreadyImported: 0, items: [] };
  }

  // Bỏ hóa đơn đã nhập (theo source_ref) — chống nhập lại.
  const imported = new Set(
    (await query<{ source_ref: string }>(`SELECT source_ref FROM invoices WHERE source_ref IS NOT NULL`))
      .map((r) => r.source_ref)
  );
  const fresh = invoices.filter((i) => i.lines.length > 0 && !imported.has(i.invoiceId));

  const candidatePos = await loadCandidatePos(user);
  const poById = new Map(candidatePos.map((p) => [p.poId, p]));
  const toSyncLines = (ls: AutoMatchPo["lines"]): SyncLine[] =>
    ls.map((l) => ({ itemCode: l.itemCode, description: l.description, quantity: l.quantity ?? 0, unitPrice: l.unitPrice, vatRate: l.vatRate ?? null, receivedQty: l.receivedQty ?? null }));

  const items: SyncPreviewItem[] = [];
  for (const inv of fresh) {
    const res = autoMatchInvoiceToPo(
      { sellerTaxId: inv.sellerTaxId, total: inv.total, lines: inv.lines },
      candidatePos
    );
    // Chỉ đưa lên bản xem trước hóa đơn CÓ ứng viên khả dĩ (AUTO/REVIEW) — tránh
    // ngập màn hình bằng hàng ngàn hóa đơn cũ không có PO tương ứng.
    if (res.level === "NONE") continue;
    const b: CandidateScore | null = res.best;
    items.push({
      sourceRef: inv.invoiceId,
      invoiceNumber: inv.invoiceNumber,
      invoiceSeries: inv.invoiceSeries,
      invoiceDate: inv.invoiceDate,
      sellerName: inv.sellerName,
      sellerTaxId: inv.sellerTaxId,
      total: inv.total,
      vat: inv.vat,
      lineCount: inv.lines.length,
      level: res.level,
      matchKey: b?.key ?? null,
      invLines: inv.lines.map((l) => ({ itemCode: l.itemCode, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, vatRate: l.taxRate ?? null })),
      best: b
        ? { poId: b.poId, poNumber: b.poNumber, supplierName: b.supplierName ?? null, score: b.score, coverage: b.coverage, matchedLines: b.matchedLines, totalLines: b.totalLines, reasons: b.reasons }
        : null,
      candidates: res.candidates.slice(0, 4).map((c) => ({
        poId: c.poId, poNumber: c.poNumber, score: c.score,
        poLines: toSyncLines(poById.get(c.poId)?.lines ?? []),
      })),
    });
  }
  // AUTO trước, rồi REVIEW; trong mỗi nhóm điểm cao trước.
  items.sort((a, b) => (a.level === b.level ? (b.best?.score ?? 0) - (a.best?.score ?? 0) : a.level === "AUTO" ? -1 : 1));

  return {
    configured: true,
    totalPurchase: invoices.length,
    alreadyImported: invoices.length - fresh.length,
    items,
  };
}

/** Ghi các hóa đơn người dùng đã chọn (mỗi mục: source_ref + po_id chọn). */
export async function confirmInvoiceSyncAction(formData: FormData): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const user = await requireUser();
  if (!can(user.role, "invoice.manage")) throw new Error("FORBIDDEN");

  const selections: { sourceRef: string; poId: number }[] = JSON.parse(String(formData.get("selections") ?? "[]"));
  if (selections.length === 0) return { imported: 0, skipped: 0, errors: ["Chưa chọn hóa đơn nào."] };

  // Đọc lại Sheet để lấy dữ liệu GỐC (không tin dữ liệu gửi từ client).
  const invoices = await fetchPurchaseInvoices();
  const byId = new Map(invoices.map((i) => [i.invoiceId, i]));

  const errors: string[] = [];
  let imported = 0, skipped = 0;

  for (const sel of selections) {
    const inv = byId.get(sel.sourceRef);
    if (!inv) { errors.push(`Không thấy hóa đơn nguồn ${sel.sourceRef}.`); continue; }
    try {
      const done = await importOneInvoice(user, inv, sel.poId);
      if (done) imported++; else skipped++;
    } catch (e) {
      errors.push(`${inv.invoiceNumber ?? sel.sourceRef}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  revalidatePath("/invoices");
  return { imported, skipped, errors };
}

/** Ghi 1 hóa đơn nguồn vào DB, gắn PO đã chọn + chạy 3-way match. Trả false nếu bỏ (đã có). */
async function importOneInvoice(
  user: Awaited<ReturnType<typeof requireUser>>,
  inv: SheetInvoice,
  poId: number
): Promise<boolean> {
  // Đã nhập rồi (source_ref) → bỏ qua, không nhân bản.
  const existed = await queryOne<{ id: number }>(`SELECT id FROM invoices WHERE source_ref = $1`, [inv.invoiceId]);
  if (existed) return false;

  // CHỐNG TRÙNG §9.2: khác source_ref nhưng CÙNG khóa (MST+ký hiệu+số HĐ) → chặn.
  const dupKey = invoiceDupKey(inv.sellerTaxId, inv.invoiceSeries, inv.invoiceNumber);
  if (inv.invoiceNumber) {
    const dup = await queryOne<{ id: number; invoice_number: string }>(
      `SELECT id, invoice_number FROM invoices WHERE dup_key = $1 LIMIT 1`, [dupKey]
    );
    if (dup) throw new Error(`Trùng hóa đơn (đã có #${dup.invoice_number}).`);
  }

  const po = await queryOne<{
    po_number: string; supplier_id: number | null; supplier_tax: string | null; company_id: number | null;
    currency: string | null; grand_total: string; vat_total: string; po_qty: string; po_sub: string;
  }>(
    `SELECT po.po_number, po.supplier_id, s.tax_code AS supplier_tax, po.company_id, po.currency, po.grand_total, po.vat_total,
            COALESCE((SELECT sum(quantity) FROM purchase_order_items WHERE po_id = po.id),0) AS po_qty,
            COALESCE((SELECT sum(quantity*unit_price - discount) FROM purchase_order_items WHERE po_id = po.id),0) AS po_sub
       FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po.supplier_id WHERE po.id = $1`,
    [poId]
  );
  if (!po) throw new Error("Không tìm thấy PO đã chọn.");
  if (!canAccessCompany(user, po.company_id)) throw new Error("FORBIDDEN");

  // Khớp NCC hóa đơn theo MST (để check Supplier có hiệu lực thật, không suy từ PO).
  let invoiceSupplierId: number | null = null;
  if (inv.sellerTaxId) {
    const s = await queryOne<{ id: number }>(
      `SELECT id FROM suppliers WHERE replace(coalesce(tax_code,''),' ','') = replace($1,' ','') AND status='Active' ORDER BY id LIMIT 1`,
      [inv.sellerTaxId]
    );
    invoiceSupplierId = s?.id ?? null;
  }

  const invSub = inv.lines.reduce((s, l) => s + Number(l.quantity) * Number(l.unitPrice), 0);
  const invVat = inv.vat || Math.round(invSub * 0.1);
  const invTotal = inv.total || invSub + invVat;

  // MAP dòng hóa đơn → dòng PO để so đơn giá (kèm id/SL/VAT + SL đã nhận GRN theo dòng).
  const poItems = await query<{ id: number; item_code: string | null; description: string; unit_price: string; quantity: string; vat_rate: string | null; received: string }>(
    `SELECT poi.id, poi.item_code, poi.description, poi.unit_price, poi.quantity, poi.vat_rate,
            COALESCE((SELECT sum(gri.received_qty) FROM goods_receipt_items gri WHERE gri.po_item_id = poi.id),0) AS received
       FROM purchase_order_items poi WHERE poi.po_id = $1`, [poId]
  );
  const poIndex = buildPoPriceIndex(poItems.map((it) => ({ itemCode: it.item_code, description: it.description, unitPrice: Number(it.unit_price) })));
  const matchLines: MatchLine[] = inv.lines.map((l) => ({
    itemCode: l.itemCode, description: l.description, invoicePrice: Number(l.unitPrice),
    poPrice: findPoPrice(poIndex, { itemCode: l.itemCode, description: l.description }),
  }));

  const received = await queryOne<{ q: string }>(
    `SELECT COALESCE(sum(gri.received_qty),0) AS q FROM goods_receipt_items gri JOIN goods_receipts gr ON gr.id = gri.gr_id WHERE gr.po_id = $1`, [poId]
  );
  const earliestRcv = await queryOne<{ d: string | null }>(
    `SELECT min(receive_date)::text AS d FROM goods_receipts WHERE po_id = $1`, [poId]
  );
  const invoicedBefore = await queryOne<{ q: string }>(
    `SELECT COALESCE(sum(ii.quantity),0) AS q FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id WHERE i.po_id = $1 AND i.status <> 'Failed'`, [poId]
  );
  const invQty = inv.lines.reduce((s, l) => s + Number(l.quantity), 0);
  const poQty = Number(po.po_qty);
  const alreadyInvoiced = Number(invoicedBefore?.q ?? 0);
  const remainingReceived = Math.max(0, Number(received?.q ?? 0) - alreadyInvoiced);
  const remainingPoQty = Math.max(0, poQty - alreadyInvoiced);
  const proratedTotal = poQty > 0 ? (invQty / poQty) * Number(po.grand_total) : Number(po.grand_total);
  const proratedVat = poQty > 0 ? (invQty / poQty) * Number(po.vat_total) : Number(po.vat_total);

  let ms: { price_tolerance_pct: string; amount_tolerance_pct: string; qty_tolerance_pct: string } | null = null;
  try { ms = await queryOne(`SELECT price_tolerance_pct, amount_tolerance_pct, qty_tolerance_pct FROM match_settings WHERE id = 1`); } catch { /* dùng mặc định */ }

  const result = evaluateMatch({
    invoiceSupplierId, poSupplierId: po.supplier_id,
    priceTolerancePct: ms ? Number(ms.price_tolerance_pct) : 1,
    amountTolerancePct: ms ? Number(ms.amount_tolerance_pct) : 1,
    qtyTolerancePct: ms ? Number(ms.qty_tolerance_pct) : 0,
    invoiceQty: invQty, poQty: remainingPoQty, receivedQty: remainingReceived,
    invoiceUnitPrice: invQty ? invSub / invQty : 0, poUnitPrice: poQty ? Number(po.po_sub) / poQty : 0,
    invoiceTotal: invTotal, expectedTotal: proratedTotal, lines: matchLines,
    invoiceVat: invVat, expectedVat: proratedVat,
    invoiceCurrency: "VND", poCurrency: po.currency ?? "VND",
    invoiceDate: inv.invoiceDate, earliestReceiptDate: earliestRcv?.d ?? null,
  });
  const matchStatus = { MATCHED: "Matched", WARNING: "Warning", FAILED: "Failed" }[result.overall]!;
  const storedSupplier = invoiceSupplierId ?? po.supplier_id;

  // Khóa tổng hợp + điểm tin cậy cho PO đã chọn (lưu vết theo yêu cầu "tạo một khóa").
  const scored = scoreCandidate(
    { sellerTaxId: inv.sellerTaxId, total: invTotal, lines: inv.lines },
    {
      poId, poNumber: po.po_number, supplierId: po.supplier_id, supplierTaxId: po.supplier_tax,
      grandTotal: Number(po.grand_total),
      lines: poItems.map((it) => ({ itemCode: it.item_code, description: it.description, unitPrice: Number(it.unit_price) })),
    }
  );

  await withTransaction(async (exec) => {
    const created = await firstRow<{ id: number }>(
      exec,
      `INSERT INTO invoices
         (invoice_number, invoice_date, supplier_id, po_id, total_amount, vat_amount, status, match_result,
          source, source_ref, invoice_series, seller_tax_id, currency, dup_key, match_key, match_score, match_level, created_by)
       VALUES ($1, COALESCE($2::date, current_date), $3, $4, $5, $6, $7, $8,
               'google-sheet', $9, $10, $11, $12, $13, $14, $15, $16, $17)
       RETURNING id`,
      [
        inv.invoiceNumber || `HD-${inv.invoiceId.slice(0, 12)}`, inv.invoiceDate, storedSupplier, poId, invTotal, invVat,
        matchStatus, result.overall, inv.invoiceId, inv.invoiceSeries, inv.sellerTaxId, "VND", dupKey,
        scored.key, scored.score, "MANUAL", user.id,
      ]
    );
    const allocInv: AllocInvItem[] = [];
    for (const l of inv.lines) {
      const row = await firstRow<{ id: number }>(
        exec,
        `INSERT INTO invoice_items (invoice_id, item_code, description, quantity, unit_price, amount, vat_rate)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [created!.id, l.itemCode || null, l.description || null, l.quantity, l.unitPrice, Number(l.quantity) * Number(l.unitPrice), l.taxRate ?? null]
      );
      allocInv.push({ id: row?.id ?? null, itemCode: l.itemCode || null, description: l.description || null, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), vatRate: l.taxRate ?? null });
    }
    for (const c of result.checks) {
      await exec(`INSERT INTO invoice_matching (invoice_id, check_name, result, reason) VALUES ($1,$2,$3,$4)`, [created!.id, c.check_name, c.result, c.reason]);
    }
    // Ghi vết PHÂN BỔ TỪNG DÒNG (§11.2/§15.2).
    const allocPo: AllocPoItem[] = poItems.map((it) => ({ id: it.id, itemCode: it.item_code, description: it.description, quantity: Number(it.quantity), unitPrice: Number(it.unit_price), vatRate: it.vat_rate == null ? null : Number(it.vat_rate), receivedQty: Number(it.received) }));
    await writeInvoiceAllocations(exec, created!.id, poId, allocInv, allocPo, ms ? Number(ms.price_tolerance_pct) : 1);
    await logAudit(
      { actorId: user.id, actorName: user.name, documentType: "Invoice", documentId: created!.id, action: "SyncImport", newValue: `${inv.invoiceNumber ?? inv.invoiceId} · ${result.overall}` },
      exec
    );
  });
  return true;
}
