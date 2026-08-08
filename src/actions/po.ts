"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query, queryOne, withTransaction, firstRow, type Executor } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { canAccessCompany } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { money } from "@/lib/format";
import type { POItem } from "@/lib/types";

/**
 * Kiểm tra NGÂN SÁCH dự án khi duyệt PO: nếu PO gắn dự án có ngân sách > 0 và
 * tổng đã cam kết (các PO khác đã duyệt của dự án) + PO này VƯỢT ngân sách thì
 * chặn duyệt. budget = 0 nghĩa là không kiểm soát. Trả lời nỗi đau "còn đủ tiền không".
 */
async function assertProjectBudget(exec: Executor, poId: number) {
  const po = await firstRow<{ project_id: number | null; grand_total: string }>(
    exec,
    `SELECT project_id, grand_total FROM purchase_orders WHERE id = $1`,
    [poId]
  );
  if (!po?.project_id) return;
  const proj = await firstRow<{ budget: string; project_name: string; status: string }>(
    exec,
    `SELECT budget, project_name, status FROM projects WHERE id = $1`,
    [po.project_id]
  );
  const budget = Number(proj?.budget) || 0;
  if (budget <= 0) return;
  const other = await firstRow<{ s: string }>(
    exec,
    `SELECT COALESCE(sum(grand_total),0) s FROM purchase_orders
      WHERE project_id = $1 AND id <> $2 AND status NOT IN ('Draft','Cancelled')`,
    [po.project_id, poId]
  );
  const committed = (Number(other?.s) || 0) + (Number(po.grand_total) || 0);
  if (committed > budget) {
    throw new Error(
      `Vượt ngân sách dự án "${proj?.project_name}". Ngân sách ${money(budget)}; ` +
        `đã cam kết ${money(Number(other?.s) || 0)}; PO này ${money(po.grand_total)} → tổng ${money(committed)}. ` +
        `Vui lòng tăng ngân sách dự án hoặc giảm giá trị đơn trước khi duyệt.`
    );
  }
}

/** Chặn IDOR: PO phải thuộc công ty user (Admin thấy tất cả). */
async function assertPOAccess(user: { role: string; company_id: number | null }, poId: number): Promise<void> {
  const row = await queryOne<{ company_id: number | null }>(
    `SELECT company_id FROM purchase_orders WHERE id = $1`,
    [poId]
  );
  if (!row) throw new Error("PO not found");
  if (!canAccessCompany(user as never, row.company_id)) throw new Error("FORBIDDEN");
}

async function logChange(
  exec: Executor,
  poId: number,
  field: string,
  oldVal: unknown,
  newVal: unknown,
  userId: number,
  userName?: string
) {
  if (String(oldVal ?? "") === String(newVal ?? "")) return;
  await exec(
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
  }, exec);
}

async function recomputeTotals(exec: Executor, poId: number) {
  const items = await exec<POItem>(`SELECT * FROM purchase_order_items WHERE po_id = $1`, [poId]);
  let subtotal = 0;
  let vat = 0;
  for (const it of items) {
    const net = Number(it.quantity) * Number(it.unit_price) - Number(it.discount);
    const lineVat = (net * Number(it.vat_rate)) / 100;
    subtotal += net;
    vat += lineVat;
    await exec(`UPDATE purchase_order_items SET amount = $1 WHERE id = $2`, [net + lineVat, it.id]);
  }
  await exec(
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
    company_id: number | null;
    status: string;
  }>(`SELECT supplier_id, delivery_date, payment_term, company_id, status FROM purchase_orders WHERE id = $1`, [poId]);
  if (!current) throw new Error("PO not found");
  if (!canAccessCompany(user, current.company_id)) throw new Error("FORBIDDEN");
  // Cho phép SỬA để KHỚP hóa đơn điện tử (số lượng/đơn giá PO sai so với HĐ) —
  // kể cả sau khi đã duyệt/gửi/nhận. Chỉ khóa khi PO đã ĐÓNG/HỦY. Mọi thay đổi
  // đều ghi po_change_history + audit. Sau khi sửa nên vào hóa đơn "↻ Đối chiếu lại".
  if (["Closed", "Cancelled"].includes(current.status)) throw new Error("PO đã đóng/hủy — không thể chỉnh sửa nội dung.");

  const supplier_id = formData.get("supplier_id") ? Number(formData.get("supplier_id")) : null;
  const delivery_date = String(formData.get("delivery_date") ?? "") || null;
  const payment_term = String(formData.get("payment_term") ?? "") || null;

  // Toàn bộ ghi (đổi PO + đổi giá dòng + tính lại tổng) trong MỘT transaction —
  // tránh dữ liệu bán phần (đổi giá dòng nhưng tổng chưa được tính lại).
  await withTransaction(async (exec) => {
    await logChange(exec, poId, "supplier", current.supplier_id, supplier_id, user.id, user.name);
    await logChange(exec, poId, "delivery_date", current.delivery_date, delivery_date, user.id, user.name);
    await logChange(exec, poId, "payment_term", current.payment_term, payment_term, user.id, user.name);

    await exec(
      `UPDATE purchase_orders SET supplier_id = $1, delivery_date = $2, payment_term = $3, updated_at = now() WHERE id = $4`,
      [supplier_id, delivery_date, payment_term, poId]
    );

    // Line updates: đơn giá + SỐ LƯỢNG (để sửa cho khớp hóa đơn điện tử).
    const items = await exec<POItem>(`SELECT * FROM purchase_order_items WHERE po_id = $1`, [poId]);
    for (const it of items) {
      const raw = formData.get(`price_${it.id}`);
      if (raw !== null) {
        const newPrice = Number(raw);
        if (Number.isFinite(newPrice) && newPrice !== Number(it.unit_price)) {
          await logChange(exec, poId, `price[line ${it.line_no}]`, it.unit_price, newPrice, user.id, user.name);
          await exec(`UPDATE purchase_order_items SET unit_price = $1 WHERE id = $2`, [newPrice, it.id]);
        }
      }
      const qraw = formData.get(`qty_${it.id}`);
      if (qraw !== null) {
        const newQty = Number(qraw);
        if (Number.isFinite(newQty) && newQty > 0 && newQty !== Number(it.quantity)) {
          await logChange(exec, poId, `qty[line ${it.line_no}]`, it.quantity, newQty, user.id, user.name);
          await exec(`UPDATE purchase_order_items SET quantity = $1 WHERE id = $2`, [newQty, it.id]);
        }
      }
    }

    await recomputeTotals(exec, poId);
  });

  revalidatePath(`/purchase-orders/${poId}`);
}

/**
 * Lõi DUYỆT PO trong MỘT transaction đang chạy (`exec`): chốt ngân sách dự án →
 * chuyển PO 'Draft' → 'Approved' → ghi lịch sử/audit. Dùng chung cho:
 *  - Duyệt PO thủ công (approvePOAction), và
 *  - Auto-duyệt PO ngay khi PR được duyệt (spec 07/2026: PO không cần duyệt riêng).
 * KHÔNG còn sinh Đề nghị thanh toán (PRQ) — từ spec 08/2026 PRQ được TẠO TAY,
 * độc lập, chọn dòng PO cần trả (xem createPRQAction).
 */
export async function autoApprovePO(
  exec: Executor,
  poId: number,
  userId: number,
  userName?: string | null
): Promise<void> {
  // Chốt ngân sách dự án TRƯỚC khi duyệt (nếu vượt → rollback, không duyệt).
  await assertProjectBudget(exec, poId);
  const upd = await firstRow<{ id: number }>(
    exec,
    `UPDATE purchase_orders SET status = 'Approved', updated_at = now()
      WHERE id = $1 AND status = 'Draft' RETURNING id`,
    [poId]
  );
  if (!upd) throw new Error("PO không ở trạng thái Nháp để duyệt (có thể đã được duyệt).");
  await exec(
    `INSERT INTO approval_history (document_type, document_id, approver_id, approval_level, status, comment)
     VALUES ('PO',$1,$2,1,'Approved','PO approved')`,
    [poId, userId]
  );
  await logAudit({ actorId: userId, actorName: userName ?? null, documentType: "PO", documentId: poId, action: "Approve" }, exec);
}

/**
 * MANAGER duyệt PO thủ công (dự phòng cho các PO Nháp còn sót). Quy trình chuẩn
 * hiện auto-duyệt PO ngay khi PR được duyệt, nên nút này thường không cần dùng.
 */
export async function approvePOAction(poId: number) {
  const user = await requireUser();
  if (!can(user.role, "po.approve")) throw new Error("FORBIDDEN");
  await assertPOAccess(user, poId);

  await withTransaction((exec) => autoApprovePO(exec, poId, user.id, user.name));

  revalidatePath(`/purchase-orders/${poId}`);
  redirect(`/purchase-orders/${poId}`);
}

export async function sendPOAction(poId: number) {
  const user = await requireUser();
  if (!can(user.role, "po.manage")) throw new Error("FORBIDDEN");
  await assertPOAccess(user, poId);
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
  await assertPOAccess(user, poId);
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
  await assertPOAccess(user, poId);
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
