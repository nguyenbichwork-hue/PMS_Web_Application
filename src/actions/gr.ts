"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { queryOne, withTransaction, firstRow } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { canAccessCompany } from "@/lib/access";
import { docNumber } from "@/lib/numbering";
import { logAudit } from "@/lib/audit";

export async function createGRAction(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "gr.manage")) throw new Error("FORBIDDEN");

  const po_id = Number(formData.get("po_id"));
  const warehouse = String(formData.get("warehouse") ?? "");
  const receive_date = String(formData.get("receive_date") ?? "") || null;
  const lines: { po_item_id: number; item_code: string; description: string; received_qty: number }[] =
    JSON.parse(String(formData.get("lines") ?? "[]"));

  if (!po_id || lines.length === 0) throw new Error("Missing PO or lines");

  // Chặn IDOR: PO phải thuộc công ty user (Admin thấy tất cả).
  const po = await queryOne<{ company_id: number | null }>(
    `SELECT company_id FROM purchase_orders WHERE id = $1`,
    [po_id]
  );
  if (!po) throw new Error("PO not found");
  if (!canAccessCompany(user, po.company_id)) throw new Error("FORBIDDEN");

  // Toàn bộ ghi (GR header + số GR + dòng + cập nhật trạng thái PO + audit) trong
  // MỘT transaction — tránh GR có header mà thiếu dòng khi lỗi giữa chừng.
  const grId = await withTransaction(async (exec) => {
    const gr = await firstRow<{ id: number }>(
      exec,
      `INSERT INTO goods_receipts (po_id, receive_date, warehouse, receiver_id, status, created_by)
       VALUES ($1, COALESCE($2::date, current_date), $3, $4, 'Completed', $4) RETURNING id`,
      [po_id, receive_date, warehouse, user.id]
    );
    await exec(`UPDATE goods_receipts SET gr_number = $1 WHERE id = $2`, [docNumber("GR", gr!.id), gr!.id]);

    for (const l of lines) {
      if (Number(l.received_qty) <= 0) continue;
      await exec(
        `INSERT INTO goods_receipt_items (gr_id, po_item_id, item_code, description, received_qty)
         VALUES ($1,$2,$3,$4,$5)`,
        [gr!.id, l.po_item_id, l.item_code, l.description, l.received_qty]
      );
    }

    // Cập nhật trạng thái PO theo TỔNG số đã nhận (cộng dồn mọi GR):
    // đủ số lượng PO → 'Received'; còn thiếu → 'Partially Received' (nhận một phần).
    const agg = await firstRow<{ po_qty: string; recv: string }>(
      exec,
      `SELECT COALESCE((SELECT sum(quantity) FROM purchase_order_items WHERE po_id=$1),0) AS po_qty,
              COALESCE((SELECT sum(gri.received_qty) FROM goods_receipt_items gri
                         JOIN goods_receipts gr ON gr.id=gri.gr_id WHERE gr.po_id=$1),0) AS recv`,
      [po_id]
    );
    const poQty = Number(agg?.po_qty ?? 0);
    const recv = Number(agg?.recv ?? 0);
    const fullyReceived = poQty > 0 && recv >= poQty - 1e-9;
    await exec(
      `UPDATE purchase_orders SET status = $2, updated_at = now()
        WHERE id = $1 AND status IN ('Sent','Confirmed','Approved','Partially Received')`,
      [po_id, fullyReceived ? "Received" : "Partially Received"]
    );

    await logAudit(
      { actorId: user.id, actorName: user.name, documentType: "GR", documentId: gr!.id, action: "Create", newValue: docNumber("GR", gr!.id) },
      exec
    );
    return gr!.id;
  });

  revalidatePath("/goods-receipts");
  redirect(`/goods-receipts/${grId}`);
}
