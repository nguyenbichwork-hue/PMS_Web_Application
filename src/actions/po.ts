"use server";
import { revalidatePath } from "next/cache";
import { query, queryOne } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { POItem } from "@/lib/types";

async function logChange(
  poId: number,
  field: string,
  oldVal: unknown,
  newVal: unknown,
  userId: number,
  userName?: string
) {
  if (String(oldVal ?? "") === String(newVal ?? "")) return;
  await query(
    `INSERT INTO po_change_history (po_id, field, old_value, new_value, changed_by)
     VALUES ($1,$2,$3,$4,$5)`,
    [poId, field, oldVal === null || oldVal === undefined ? null : String(oldVal), newVal === null || newVal === undefined ? null : String(newVal), userId]
  );
  // Mirror vào audit_log tổng quát (who/what/old/new).
  await logAudit({
    actorId: userId,
    actorName: userName ?? null,
    documentType: "PO",
    documentId: poId,
    action: "Update",
    field,
    oldValue: oldVal as string | number | null,
    newValue: newVal as string | number | null,
  });
}

async function recomputeTotals(poId: number) {
  const items = await query<POItem>(`SELECT * FROM purchase_order_items WHERE po_id = $1`, [poId]);
  let subtotal = 0;
  let vat = 0;
  for (const it of items) {
    const net = Number(it.quantity) * Number(it.unit_price) - Number(it.discount);
    const lineVat = (net * Number(it.vat_rate)) / 100;
    subtotal += net;
    vat += lineVat;
    await query(`UPDATE purchase_order_items SET amount = $1 WHERE id = $2`, [net + lineVat, it.id]);
  }
  await query(
    `UPDATE purchase_orders SET subtotal = $1, vat_total = $2, grand_total = $3, updated_at = now() WHERE id = $4`,
    [subtotal, vat, subtotal + vat, poId]
  );
}

export async function updatePOAction(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "po.manage")) throw new Error("FORBIDDEN");
  const poId = Number(formData.get("po_id"));

  const current = await queryOne<{
    supplier_id: number | null;
    delivery_date: string | null;
    payment_term: string | null;
  }>(`SELECT supplier_id, delivery_date, payment_term FROM purchase_orders WHERE id = $1`, [poId]);
  if (!current) throw new Error("PO not found");

  const supplier_id = formData.get("supplier_id") ? Number(formData.get("supplier_id")) : null;
  const delivery_date = String(formData.get("delivery_date") ?? "") || null;
  const payment_term = String(formData.get("payment_term") ?? "") || null;

  await logChange(poId, "supplier", current.supplier_id, supplier_id, user.id, user.name);
  await logChange(poId, "delivery_date", current.delivery_date, delivery_date, user.id, user.name);
  await logChange(poId, "payment_term", current.payment_term, payment_term, user.id, user.name);

  await query(
    `UPDATE purchase_orders SET supplier_id = $1, delivery_date = $2, payment_term = $3, updated_at = now() WHERE id = $4`,
    [supplier_id, delivery_date, payment_term, poId]
  );

  // Line price updates
  const items = await query<POItem>(`SELECT * FROM purchase_order_items WHERE po_id = $1`, [poId]);
  for (const it of items) {
    const raw = formData.get(`price_${it.id}`);
    if (raw === null) continue;
    const newPrice = Number(raw);
    if (newPrice !== Number(it.unit_price)) {
      await logChange(poId, `price[line ${it.line_no}]`, it.unit_price, newPrice, user.id, user.name);
      await query(`UPDATE purchase_order_items SET unit_price = $1 WHERE id = $2`, [newPrice, it.id]);
    }
  }

  await recomputeTotals(poId);
  revalidatePath(`/purchase-orders/${poId}`);
}

export async function approvePOAction(poId: number) {
  const user = await requireUser();
  if (!can(user.role, "po.manage")) throw new Error("FORBIDDEN");
  await query(
    `UPDATE purchase_orders SET status = 'Approved', updated_at = now() WHERE id = $1 AND status = 'Draft'`,
    [poId]
  );
  await query(
    `INSERT INTO approval_history (document_type, document_id, approver_id, approval_level, status, comment)
     VALUES ('PO',$1,$2,1,'Approved','PO approved')`,
    [poId, user.id]
  );
  await logAudit({ actorId: user.id, actorName: user.name, documentType: "PO", documentId: poId, action: "Approve" });
  revalidatePath(`/purchase-orders/${poId}`);
}

export async function sendPOAction(poId: number) {
  const user = await requireUser();
  if (!can(user.role, "po.manage")) throw new Error("FORBIDDEN");
  await query(
    `UPDATE purchase_orders SET status = 'Sent', updated_at = now() WHERE id = $1 AND status IN ('Approved','Draft')`,
    [poId]
  );
  await logAudit({ actorId: user.id, actorName: user.name, documentType: "PO", documentId: poId, action: "Send" });
  revalidatePath(`/purchase-orders/${poId}`);
}

/** Nhà cung cấp xác nhận PO (Phase 2). */
export async function confirmPOAction(poId: number) {
  const user = await requireUser();
  if (!can(user.role, "po.manage")) throw new Error("FORBIDDEN");
  await query(
    `UPDATE purchase_orders SET status = 'Confirmed', updated_at = now() WHERE id = $1 AND status = 'Sent'`,
    [poId]
  );
  await logAudit({ actorId: user.id, actorName: user.name, documentType: "PO", documentId: poId, action: "SupplierConfirm" });
  revalidatePath(`/purchase-orders/${poId}`);
}

/** Hủy PO kèm lý do (Phase 2). Không cho hủy nếu đã nhận hàng/đóng. */
export async function cancelPOAction(poId: number, reason: string) {
  const user = await requireUser();
  if (!can(user.role, "po.manage")) throw new Error("FORBIDDEN");
  if (!reason.trim()) throw new Error("Vui lòng nhập lý do hủy.");
  const updated = await queryOne<{ id: number }>(
    `UPDATE purchase_orders SET status = 'Cancelled', cancel_reason = $2, updated_at = now()
      WHERE id = $1 AND status IN ('Draft','Approved','Sent','Confirmed') RETURNING id`,
    [poId, reason]
  );
  if (!updated) throw new Error("Không thể hủy PO ở trạng thái hiện tại.");
  await logAudit({ actorId: user.id, actorName: user.name, documentType: "PO", documentId: poId, action: "Cancel", newValue: reason });
  revalidatePath(`/purchase-orders/${poId}`);
}
