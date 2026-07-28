import "server-only";
import { dbExec, firstRow, type Executor } from "./db";
import { docNumber } from "./numbering";

// =====================================================================
// Payment Requisition (Đề nghị thanh toán) — sinh tự động từ PO đã DUYỆT.
// Số tiền mỗi dòng GỒM THUẾ (lấy từ purchase_order_items.amount). Một PRQ trả
// cho MỘT nhà cung cấp; có thể gộp thêm dòng của các PO khác cùng NCC ở actions.
// =====================================================================

/** Tính lại tổng PRQ từ các dòng. subtotal/vat suy ngược theo vat_rate của dòng
 *  PO gốc (dòng không gắn PO coi như thuế 0). grand_total = tổng tiền GỒM thuế. */
export async function recomputePRQTotals(exec: Executor, prqId: number): Promise<void> {
  const rows = await exec<{ amount: string; vat_rate: string | null }>(
    `SELECT it.amount, poi.vat_rate
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

/**
 * Sinh PRQ nháp từ một PO đã duyệt. Nếu PO ĐÃ nằm trong một PRQ rồi thì trả về
 * id PRQ đó (không tạo trùng). Trả về id PRQ.
 */
export async function generatePRQFromPO(poId: number, exec: Executor = dbExec, userId?: number): Promise<number> {
  const existing = await firstRow<{ prq_id: number }>(
    exec,
    `SELECT prq_id FROM payment_requisition_items WHERE po_id = $1 LIMIT 1`,
    [poId]
  );
  if (existing) return existing.prq_id;

  const po = await firstRow<{ company_id: number; supplier_id: number | null; currency: string }>(
    exec,
    `SELECT company_id, supplier_id, currency FROM purchase_orders WHERE id = $1`,
    [poId]
  );
  if (!po) throw new Error("PO not found");

  const sup = po.supplier_id
    ? await firstRow<{ bank_account: string | null; tax_code: string | null }>(
        exec,
        `SELECT bank_account, tax_code FROM suppliers WHERE id = $1`,
        [po.supplier_id]
      )
    : null;

  const prq = await firstRow<{ id: number }>(
    exec,
    `INSERT INTO payment_requisitions
       (company_id, supplier_id, payment_type, currency, bank_account, status, created_by)
     VALUES ($1,$2,'Normal',$3,$4,'Draft',$5) RETURNING id`,
    [po.company_id, po.supplier_id, po.currency || "VND", sup?.bank_account ?? null, userId ?? null]
  );
  await exec(`UPDATE payment_requisitions SET prq_number = $1 WHERE id = $2`, [docNumber("PRQ", prq!.id), prq!.id]);

  const items = await exec<{ id: number; description: string; amount: string }>(
    `SELECT id, description, amount FROM purchase_order_items WHERE po_id = $1 ORDER BY line_no`,
    [poId]
  );
  let line = 1;
  for (const it of items) {
    await exec(
      `INSERT INTO payment_requisition_items
         (prq_id, po_id, po_item_id, description, tax_code, currency, amount, line_no)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [prq!.id, poId, it.id, it.description, sup?.tax_code ?? null, po.currency || "VND", Number(it.amount), line++]
    );
  }
  await recomputePRQTotals(exec, prq!.id);
  return prq!.id;
}
