"use server";
import { revalidatePath } from "next/cache";
import { query, queryOne, withTransaction } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { canAccessCompany } from "@/lib/access";
import { evaluateMatch, buildPoPriceIndex, findPoPrice, type MatchLine } from "@/lib/matching";
import { scoreCandidate } from "@/lib/po-automatch";
import { writeInvoiceAllocations, type AllocInvItem, type AllocPoItem } from "@/lib/allocation";
import { logAudit } from "@/lib/audit";

// =====================================================================
// SỬA / BỎ MAP hóa đơn ↔ PO (theo yêu cầu "chỉnh sửa hoặc bỏ map").
//   • poId = null  → BỎ map: gỡ PO, xóa kết quả đối chiếu, trạng thái Pending.
//   • poId = số    → ĐỔI map sang PO khác + chạy lại đối chiếu 3 chiều (§11.4).
// Không tin dữ liệu client; đọc lại toàn bộ từ DB rồi tính lại.
// =====================================================================
export async function remapInvoiceAction(invoiceId: number, poId: number | null): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!can(user.role, "invoice.manage")) return { ok: false, error: "Không có quyền." };

  const inv = await queryOne<{
    id: number; invoice_number: string; invoice_date: string | null; supplier_id: number | null; seller_tax_id: string | null;
    total_amount: string; vat_amount: string; company_id: number | null;
  }>(
    `SELECT i.id, i.invoice_number, i.invoice_date::text AS invoice_date, i.supplier_id, i.seller_tax_id, i.total_amount, i.vat_amount, po.company_id
       FROM invoices i LEFT JOIN purchase_orders po ON po.id = i.po_id WHERE i.id = $1`,
    [invoiceId]
  );
  if (!inv) return { ok: false, error: "Không tìm thấy hóa đơn." };

  // ----- BỎ MAP -----------------------------------------------------------
  if (poId == null) {
    await withTransaction(async (exec) => {
      await exec(`DELETE FROM invoice_matching WHERE invoice_id = $1`, [invoiceId]);
      await exec(`DELETE FROM invoice_line_allocation WHERE invoice_id = $1`, [invoiceId]);
      await exec(
        `UPDATE invoices SET po_id = NULL, match_result = NULL, status = 'Pending',
                match_key = NULL, match_score = NULL, match_level = 'UNMAPPED' WHERE id = $1`,
        [invoiceId]
      );
      await logAudit(
        { actorId: user.id, actorName: user.name, documentType: "Invoice", documentId: invoiceId, action: "Unmap", oldValue: inv.invoice_number },
        exec
      );
    });
    revalidatePath(`/invoices/${invoiceId}`);
    revalidatePath("/reconciliation");
    return { ok: true };
  }

  // ----- ĐỔI MAP SANG PO khác --------------------------------------------
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
  if (!po) return { ok: false, error: "Không tìm thấy PO đã chọn." };
  if (!canAccessCompany(user, po.company_id)) return { ok: false, error: "Không có quyền với PO này." };

  const invItems = await query<{ id: number; item_code: string | null; description: string | null; quantity: string; unit_price: string; vat_rate: string | null }>(
    `SELECT id, item_code, description, quantity, unit_price, vat_rate FROM invoice_items WHERE invoice_id = $1`, [invoiceId]
  );
  const poItems = await query<{ id: number; item_code: string | null; description: string; unit_price: string; quantity: string; vat_rate: string | null; received: string }>(
    `SELECT poi.id, poi.item_code, poi.description, poi.unit_price, poi.quantity, poi.vat_rate,
            COALESCE((SELECT sum(gri.received_qty) FROM goods_receipt_items gri WHERE gri.po_item_id = poi.id),0) AS received
       FROM purchase_order_items poi WHERE poi.po_id = $1`, [poId]
  );
  const earliestRcv = await queryOne<{ d: string | null }>(
    `SELECT min(receive_date)::text AS d FROM goods_receipts WHERE po_id = $1`, [poId]
  );

  // NCC hóa đơn theo MST (kiểm NCC thật, không suy từ PO).
  let invoiceSupplierId: number | null = inv.supplier_id;
  if (inv.seller_tax_id) {
    const s = await queryOne<{ id: number }>(
      `SELECT id FROM suppliers WHERE replace(coalesce(tax_code,''),' ','') = replace($1,' ','') AND status='Active' ORDER BY id LIMIT 1`,
      [inv.seller_tax_id]
    );
    if (s) invoiceSupplierId = s.id;
  }

  const poIndex = buildPoPriceIndex(poItems.map((it) => ({ itemCode: it.item_code, description: it.description, unitPrice: Number(it.unit_price) })));
  const matchLines: MatchLine[] = invItems.map((l) => ({
    itemCode: l.item_code, description: l.description ?? undefined, invoicePrice: Number(l.unit_price),
    poPrice: findPoPrice(poIndex, { itemCode: l.item_code, description: l.description }),
  }));

  // SL đã nhận / đã xuất hóa đơn (LOẠI TRỪ chính hóa đơn này) cho PO mới.
  const received = await queryOne<{ q: string }>(
    `SELECT COALESCE(sum(gri.received_qty),0) AS q FROM goods_receipt_items gri JOIN goods_receipts gr ON gr.id = gri.gr_id WHERE gr.po_id = $1`, [poId]
  );
  const invoicedBefore = await queryOne<{ q: string }>(
    `SELECT COALESCE(sum(ii.quantity),0) AS q FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
      WHERE i.po_id = $1 AND i.status <> 'Failed' AND i.id <> $2`, [poId, invoiceId]
  );
  const invQty = invItems.reduce((s, l) => s + Number(l.quantity), 0);
  const invSub = invItems.reduce((s, l) => s + Number(l.quantity) * Number(l.unit_price), 0);
  const invVat = Number(inv.vat_amount);
  const invTotal = Number(inv.total_amount);
  const poQty = Number(po.po_qty);
  const alreadyInvoiced = Number(invoicedBefore?.q ?? 0);
  const remainingReceived = Math.max(0, Number(received?.q ?? 0) - alreadyInvoiced);
  const remainingPoQty = Math.max(0, poQty - alreadyInvoiced);
  const proratedTotal = poQty > 0 ? (invQty / poQty) * Number(po.grand_total) : Number(po.grand_total);
  const proratedVat = poQty > 0 ? (invQty / poQty) * Number(po.vat_total) : Number(po.vat_total);

  let ms: { price_tolerance_pct: string; amount_tolerance_pct: string; qty_tolerance_pct: string } | null = null;
  try { ms = await queryOne(`SELECT price_tolerance_pct, amount_tolerance_pct, qty_tolerance_pct FROM match_settings WHERE id = 1`); } catch { /* mặc định */ }

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
    invoiceDate: inv.invoice_date, earliestReceiptDate: earliestRcv?.d ?? null,
  });
  const matchStatus = { MATCHED: "Matched", WARNING: "Warning", FAILED: "Failed" }[result.overall]!;

  const scored = scoreCandidate(
    { sellerTaxId: inv.seller_tax_id, total: invTotal, lines: invItems.map((l) => ({ itemCode: l.item_code, description: l.description ?? "", quantity: Number(l.quantity), unitPrice: Number(l.unit_price) })) },
    {
      poId, poNumber: po.po_number, supplierId: po.supplier_id, supplierTaxId: po.supplier_tax,
      grandTotal: Number(po.grand_total),
      lines: poItems.map((it) => ({ itemCode: it.item_code, description: it.description, unitPrice: Number(it.unit_price) })),
    }
  );

  await withTransaction(async (exec) => {
    await exec(
      `UPDATE invoices SET po_id = $1, supplier_id = COALESCE($2, supplier_id), match_result = $3, status = $4,
              match_key = $5, match_score = $6, match_level = 'MANUAL' WHERE id = $7`,
      [poId, invoiceSupplierId, result.overall, matchStatus, scored.key, scored.score, invoiceId]
    );
    await exec(`DELETE FROM invoice_matching WHERE invoice_id = $1`, [invoiceId]);
    for (const c of result.checks) {
      await exec(`INSERT INTO invoice_matching (invoice_id, check_name, result, reason) VALUES ($1,$2,$3,$4)`, [invoiceId, c.check_name, c.result, c.reason]);
    }
    // Ghi lại PHÂN BỔ TỪNG DÒNG cho PO mới (§11.2/§15.2).
    const allocInv: AllocInvItem[] = invItems.map((l) => ({ id: l.id, itemCode: l.item_code, description: l.description, quantity: Number(l.quantity), unitPrice: Number(l.unit_price), vatRate: l.vat_rate == null ? null : Number(l.vat_rate) }));
    const allocPo: AllocPoItem[] = poItems.map((it) => ({ id: it.id, itemCode: it.item_code, description: it.description, quantity: Number(it.quantity), unitPrice: Number(it.unit_price), vatRate: it.vat_rate == null ? null : Number(it.vat_rate), receivedQty: Number(it.received) }));
    await writeInvoiceAllocations(exec, invoiceId, poId, allocInv, allocPo, ms ? Number(ms.price_tolerance_pct) : 1);
    await logAudit(
      { actorId: user.id, actorName: user.name, documentType: "Invoice", documentId: invoiceId, action: "Remap", newValue: `${inv.invoice_number} → ${po.po_number} · ${result.overall}` },
      exec
    );
  });

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/reconciliation");
  return { ok: true };
}
