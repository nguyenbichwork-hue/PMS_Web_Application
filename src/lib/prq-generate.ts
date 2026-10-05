import "server-only";
import { type Executor } from "./db";

// =====================================================================
// Payment Requisition (Đề nghị thanh toán) — tính lại tổng tiền từ các dòng.
// Số tiền mỗi dòng GỒM THUẾ (lấy từ purchase_order_items.amount). Một PRQ trả
// cho MỘT nhà cung cấp.
// =====================================================================

/** Tính lại tổng PRQ từ các dòng. subtotal/vat suy ngược theo vat_rate của dòng
 *  PO gốc (dòng không gắn PO coi như thuế 0). grand_total = tổng tiền GỒM thuế. */
export async function recomputePRQTotals(exec: Executor, prqId: number): Promise<void> {
  const rows = await exec<{ amount: string; vat_rate: string | null }>(
    `SELECT it.amount, COALESCE(it.vat_rate, poi.vat_rate) AS vat_rate
       FROM payment_requisition_items it
       LEFT JOIN purchase_order_items poi ON poi.id = it.po_item_id
      WHERE it.prq_id = $1`,
    [prqId]
  );
  let subtotal = 0, vat = 0, grand = 0;
  for (const r of rows) {
    const amount = Number(r.amount);
    const rate = r.vat_rate != null && Number.isFinite(Number(r.vat_rate)) ? Number(r.vat_rate) : 0;
    const net = rate > 0 ? amount / (1 + rate / 100) : amount;
    subtotal += net;
    vat += amount - net;
    grand += amount;
  }
  await exec(
    `UPDATE payment_requisitions
        SET subtotal = $1, vat_total = $2, grand_total = $3, updated_at = now()
      WHERE id = $4`,
    [Math.round(subtotal), Math.round(vat), Math.round(grand), prqId]
  );
}
