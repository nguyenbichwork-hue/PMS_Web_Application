import "server-only";
import type { Executor } from "./db";
import { matchKey } from "./matching";

// =====================================================================
// GHI VẾT PHÂN BỔ TỪNG DÒNG hóa đơn ↔ dòng PO — "bảng hạng nhất" theo đặc tả
// §11.2/§15.2 (invoice_po_allocation). Kiểm soát số lượng/giá trị DỰA TRÊN LINE,
// không chỉ lưu po_id ở header. Dùng chung cho nhập đồng bộ & đổi map.
// =====================================================================

export interface AllocInvItem {
  id: number | null;
  itemCode: string | null;
  description: string | null;
  quantity: number;
  unitPrice: number;
  vatRate: number | null;
}
export interface AllocPoItem {
  id: number;
  itemCode: string | null;
  description: string | null;
  quantity: number;
  unitPrice: number;
  vatRate: number | null;
  receivedQty: number | null;
}

const near = (a: number, b: number, tol: number) => {
  const base = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / base <= tol;
};

/** Xóa phân bổ cũ rồi ghi lại theo cặp dòng HĐ↔dòng PO (khớp mã → tên). */
export async function writeInvoiceAllocations(
  exec: Executor,
  invoiceId: number,
  poId: number | null,
  invItems: AllocInvItem[],
  poItems: AllocPoItem[],
  priceTolerancePct = 1
): Promise<void> {
  await exec(`DELETE FROM invoice_line_allocation WHERE invoice_id = $1`, [invoiceId]);
  if (poId == null) return;

  const byCode = new Map<string, AllocPoItem>();
  const byDesc = new Map<string, AllocPoItem>();
  for (const p of poItems) {
    if (p.itemCode) byCode.set(matchKey(p.itemCode), p);
    if (p.description) byDesc.set(matchKey(p.description), p);
  }
  const priceTol = priceTolerancePct / 100;

  for (const inv of invItems) {
    let po: AllocPoItem | undefined;
    if (inv.itemCode) po = byCode.get(matchKey(inv.itemCode));
    if (!po && inv.description) po = byDesc.get(matchKey(inv.description));

    const priceStatus = po ? (near(inv.unitPrice, po.unitPrice, priceTol) ? "PASS" : "FAIL") : "FAIL";
    let qtyStatus = "PASS";
    if (po) {
      const recv = po.receivedQty;
      if (inv.quantity > po.quantity + 1e-9) qtyStatus = "FAIL";
      else if (recv != null && inv.quantity > recv + 1e-9) qtyStatus = "FAIL";
      else if (recv != null && inv.quantity < recv - 1e-9) qtyStatus = "WARNING";
      else if (recv == null && inv.quantity < po.quantity - 1e-9) qtyStatus = "WARNING";
    }
    let vatStatus = "PASS";
    if (po && inv.vatRate != null && po.vatRate != null) vatStatus = Math.abs(inv.vatRate - po.vatRate) <= 0.01 ? "PASS" : "WARNING";

    await exec(
      `INSERT INTO invoice_line_allocation
         (invoice_id, invoice_item_id, po_id, po_item_id, item_code, description,
          alloc_qty, alloc_amount, inv_unit_price, po_unit_price, received_qty,
          inv_vat_rate, po_vat_rate, price_status, qty_status, vat_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        invoiceId, inv.id, poId, po?.id ?? null, inv.itemCode, inv.description,
        inv.quantity, inv.quantity * inv.unitPrice, inv.unitPrice, po?.unitPrice ?? null, po?.receivedQty ?? null,
        inv.vatRate, po?.vatRate ?? null, priceStatus, qtyStatus, vatStatus,
      ]
    );
  }
}

/** Khóa CHỐNG TRÙNG hóa đơn (§9.2): MST người bán + ký hiệu + số hóa đơn (chuẩn hóa). */
export function invoiceDupKey(sellerTaxId: string | null, series: string | null, number: string | null): string {
  const norm = (s: string | null) => (s ?? "").toString().trim().toUpperCase().replace(/\s+/g, "");
  return [norm(sellerTaxId), norm(series), norm(number)].join("|");
}
