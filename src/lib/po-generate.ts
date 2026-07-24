import "server-only";
import { dbExec, firstRow, type Executor } from "./db";
import { docNumber } from "./numbering";
import type { PRItem } from "./types";

/**
 * Automatically create a Draft PO from an approved PR — the core
 * "input once" automation. No manual re-keying: PO lines are derived
 * straight from PR lines. Purchasing may later adjust supplier / price /
 * delivery / term (tracked in po_change_history).
 * Nhận `exec` để chạy trong cùng transaction với bước duyệt PR (nguyên tử).
 * Returns the new PO id.
 */
export async function generatePOFromPR(prId: number, exec: Executor = dbExec): Promise<number> {
  // Don't double-generate.
  const existing = await firstRow<{ id: number }>(
    exec,
    `SELECT id FROM purchase_orders WHERE pr_id = $1 LIMIT 1`,
    [prId]
  );
  if (existing) return existing.id;

  const pr = await firstRow<{ company_id: number }>(
    exec,
    `SELECT company_id FROM purchase_requests WHERE id = $1`,
    [prId]
  );
  if (!pr) throw new Error("PR not found");

  const items = await exec<PRItem>(
    `SELECT * FROM purchase_request_items WHERE pr_id = $1 ORDER BY line_no`,
    [prId]
  );

  // Pick supplier: first line's suggestion, else product default supplier.
  let supplierId: number | null = items.find((i) => i.supplier_suggestion)?.supplier_suggestion ?? null;
  if (!supplierId && items[0]?.item_code) {
    const prod = await firstRow<{ default_supplier: number | null }>(
      exec,
      `SELECT default_supplier FROM products WHERE item_code = $1`,
      [items[0].item_code]
    );
    supplierId = prod?.default_supplier ?? null;
  }

  let subtotal = 0;
  let vatTotal = 0;
  const computed = items.map((it) => {
    const qty = Number(it.quantity);
    const price = Number(it.estimated_price);
    const lineNet = qty * price;
    // Kế thừa thuế suất khai ở PR (mặc định 10% nếu dòng PR chưa có).
    const vatRate = Number.isFinite(Number(it.vat_rate)) ? Number(it.vat_rate) : 10;
    const lineVat = (lineNet * vatRate) / 100;
    subtotal += lineNet;
    vatTotal += lineVat;
    return { it, qty, price, vatRate, amount: lineNet + lineVat };
  });
  const grand = subtotal + vatTotal;

  const po = await firstRow<{ id: number }>(
    exec,
    `INSERT INTO purchase_orders
       (pr_id, supplier_id, company_id, order_date, payment_term, currency, status, subtotal, vat_total, grand_total)
     VALUES ($1,$2,$3, current_date, 'NET30', 'VND', 'Draft', $4,$5,$6)
     RETURNING id`,
    [prId, supplierId, pr.company_id, subtotal, vatTotal, grand]
  );

  await exec(`UPDATE purchase_orders SET po_number = $1 WHERE id = $2`, [docNumber("PO", po!.id), po!.id]);

  let line = 1;
  for (const c of computed) {
    await exec(
      `INSERT INTO purchase_order_items
         (po_id, item_code, description, quantity, unit, unit_price, discount, vat_rate, amount, line_no)
       VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,$9)`,
      [po!.id, c.it.item_code, c.it.item_name, c.qty, c.it.unit ?? "PCS", c.price, c.vatRate, c.amount, line++]
    );
  }

  return po!.id;
}
