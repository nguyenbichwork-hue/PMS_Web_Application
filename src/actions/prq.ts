"use server";
import { revalidatePath } from "next/cache";
import { query, queryOne, withTransaction, firstRow, type Executor } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { canAccessCompany } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { recomputePRQTotals } from "@/lib/prq-generate";

/** Chặn IDOR + lấy trạng thái/công ty PRQ. */
async function loadPRQ(user: { role: string; company_id: number | null }, prqId: number) {
  const row = await queryOne<{ id: number; company_id: number; supplier_id: number | null; status: string }>(
    `SELECT id, company_id, supplier_id, status FROM payment_requisitions WHERE id = $1`,
    [prqId]
  );
  if (!row) throw new Error("Không tìm thấy đề nghị thanh toán.");
  if (!canAccessCompany(user as never, row.company_id)) throw new Error("FORBIDDEN");
  return row;
}

/** Cập nhật phần đầu (ngân hàng, ngày đến hạn, loại thanh toán, lý do) + từng dòng. */
export async function updatePRQAction(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "prq.manage")) throw new Error("FORBIDDEN");
  const prqId = Number(formData.get("prq_id"));
  const prq = await loadPRQ(user, prqId);
  if (prq.status !== "Draft") throw new Error("Chỉ sửa được đề nghị thanh toán khi còn Nháp.");

  const payment_type = String(formData.get("payment_type") ?? "Normal") === "Advance" ? "Advance" : "Normal";
  const due_date = String(formData.get("due_date") ?? "").trim() || null;
  const bank_account = String(formData.get("bank_account") ?? "").trim() || null;
  const bank_name = String(formData.get("bank_name") ?? "").trim() || null;
  const bank_address = String(formData.get("bank_address") ?? "").trim() || null;
  const swift_code = String(formData.get("swift_code") ?? "").trim() || null;
  const reason = String(formData.get("reason") ?? "").trim() || null;

  await withTransaction(async (exec: Executor) => {
    await exec(
      `UPDATE payment_requisitions
          SET payment_type=$1, due_date=$2, bank_account=$3, bank_name=$4, bank_address=$5, swift_code=$6, reason=$7, updated_at=now()
        WHERE id=$8`,
      [payment_type, due_date, bank_account, bank_name, bank_address, swift_code, reason, prqId]
    );
    const items = await exec<{ id: number }>(`SELECT id FROM payment_requisition_items WHERE prq_id=$1`, [prqId]);
    for (const it of items) {
      // Field theo dòng: <field>_<id>. Không gửi thì bỏ qua (giữ nguyên).
      const get = (f: string) => formData.get(`${f}_${it.id}`);
      const amountRaw = get("amount");
      if (amountRaw !== null) {
        const amount = Math.max(0, Number(amountRaw) || 0);
        await exec(`UPDATE payment_requisition_items SET amount=$1 WHERE id=$2`, [amount, it.id]);
      }
      const vatRaw = get("vat_rate");
      if (vatRaw !== null) {
        const vr = String(vatRaw).trim();
        const vatVal = vr === "" ? null : Math.max(0, Math.min(100, Number(vr) || 0));
        await exec(`UPDATE payment_requisition_items SET vat_rate=$1 WHERE id=$2`, [vatVal, it.id]);
      }
      const setTxt = async (f: string, col: string) => {
        const v = get(f);
        if (v !== null) await exec(`UPDATE payment_requisition_items SET ${col}=$1 WHERE id=$2`, [String(v).trim() || null, it.id]);
      };
      await setTxt("inv_no", "inv_no");
      const invDate = get("inv_date");
      if (invDate !== null) await exec(`UPDATE payment_requisition_items SET inv_date=$1 WHERE id=$2`, [String(invDate).trim() || null, it.id]);
      await setTxt("description", "description");
      await setTxt("tax_code", "tax_code");
      await setTxt("gl_account", "gl_account");
      await setTxt("cost_center", "cost_center");
    }
    await recomputePRQTotals(exec, prqId);
    await logAudit({ actorId: user.id, actorName: user.name, documentType: "PRQ", documentId: prqId, action: "Update" }, exec);
  });
  revalidatePath(`/payment-requisitions/${prqId}`);
}

/** Gộp thêm các dòng của một PO khác (CÙNG nhà cung cấp) vào PRQ. */
export async function addPOToPRQAction(prqId: number, poId: number) {
  const user = await requireUser();
  if (!can(user.role, "prq.manage")) throw new Error("FORBIDDEN");
  const prq = await loadPRQ(user, prqId);
  if (prq.status !== "Draft") throw new Error("Chỉ thêm PO khi PRQ còn Nháp.");

  const po = await queryOne<{ id: number; supplier_id: number | null; company_id: number; currency: string; status: string }>(
    `SELECT id, supplier_id, company_id, currency, status FROM purchase_orders WHERE id=$1`,
    [poId]
  );
  if (!po) throw new Error("Không tìm thấy PO.");
  if (!canAccessCompany(user, po.company_id)) throw new Error("FORBIDDEN");
  if (po.supplier_id !== prq.supplier_id) throw new Error("PO khác nhà cung cấp — không gộp chung một đề nghị thanh toán.");
  const dup = await queryOne<{ id: number }>(`SELECT id FROM payment_requisition_items WHERE prq_id=$1 AND po_id=$2 LIMIT 1`, [prqId, poId]);
  if (dup) throw new Error("PO này đã có trong đề nghị thanh toán.");

  const sup = po.supplier_id ? await queryOne<{ tax_code: string | null }>(`SELECT tax_code FROM suppliers WHERE id=$1`, [po.supplier_id]) : null;
  await withTransaction(async (exec) => {
    const maxLine = await firstRow<{ n: number }>(exec, `SELECT COALESCE(max(line_no),0)::int n FROM payment_requisition_items WHERE prq_id=$1`, [prqId]);
    let line = (maxLine?.n ?? 0) + 1;
    const items = await exec<{ id: number; description: string; amount: string; vat_rate: string | null }>(
      `SELECT id, description, amount, vat_rate FROM purchase_order_items WHERE po_id=$1 ORDER BY line_no`,
      [poId]
    );
    for (const it of items) {
      await exec(
        `INSERT INTO payment_requisition_items (prq_id, po_id, po_item_id, description, tax_code, currency, amount, vat_rate, line_no)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [prqId, poId, it.id, it.description, sup?.tax_code ?? null, po.currency || "VND", Number(it.amount), it.vat_rate != null ? Number(it.vat_rate) : null, line++]
      );
    }
    await recomputePRQTotals(exec, prqId);
    await logAudit({ actorId: user.id, actorName: user.name, documentType: "PRQ", documentId: prqId, action: "AddPO", newValue: `PO ${poId}` }, exec);
  });
  revalidatePath(`/payment-requisitions/${prqId}`);
}

/** Xóa một dòng khỏi PRQ (thanh toán từng phần). */
export async function removePRQLineAction(prqId: number, itemId: number) {
  const user = await requireUser();
  if (!can(user.role, "prq.manage")) throw new Error("FORBIDDEN");
  const prq = await loadPRQ(user, prqId);
  if (prq.status !== "Draft") throw new Error("Chỉ sửa được khi còn Nháp.");
  await withTransaction(async (exec) => {
    await exec(`DELETE FROM payment_requisition_items WHERE id=$1 AND prq_id=$2`, [itemId, prqId]);
    await recomputePRQTotals(exec, prqId);
  });
  revalidatePath(`/payment-requisitions/${prqId}`);
}

export async function submitPRQAction(prqId: number) {
  const user = await requireUser();
  if (!can(user.role, "prq.manage")) throw new Error("FORBIDDEN");
  const prq = await loadPRQ(user, prqId);
  if (prq.status !== "Draft") throw new Error("Chỉ gửi được đề nghị đang Nháp.");
  await query(`UPDATE payment_requisitions SET status='Submitted', updated_at=now() WHERE id=$1`, [prqId]);
  await logAudit({ actorId: user.id, actorName: user.name, documentType: "PRQ", documentId: prqId, action: "Submit" });
  revalidatePath(`/payment-requisitions/${prqId}`);
  revalidatePath("/payment-requisitions");
}

export async function approvePRQAction(prqId: number) {
  const user = await requireUser();
  if (!can(user.role, "prq.approve")) throw new Error("FORBIDDEN");
  const prq = await loadPRQ(user, prqId);
  if (prq.status !== "Submitted") throw new Error("Chỉ duyệt được đề nghị đã gửi.");
  await query(`UPDATE payment_requisitions SET status='Approved', updated_at=now() WHERE id=$1`, [prqId]);
  await logAudit({ actorId: user.id, actorName: user.name, documentType: "PRQ", documentId: prqId, action: "Approve" });
  revalidatePath(`/payment-requisitions/${prqId}`);
  revalidatePath("/payment-requisitions");
}

/** Người duyệt TỪ CHỐI đề nghị đã gửi. Excel đã xuất/gửi NCC nên quyết định chỉ
 *  có 2 nhánh: Duyệt hoặc Từ chối. Ghi lý do để người lập biết mà xử lý. */
export async function rejectPRQAction(prqId: number, reason: string) {
  const user = await requireUser();
  if (!can(user.role, "prq.approve")) throw new Error("FORBIDDEN");
  const prq = await loadPRQ(user, prqId);
  if (prq.status !== "Submitted") throw new Error("Chỉ từ chối được đề nghị đã gửi.");
  await query(`UPDATE payment_requisitions SET status='Rejected', updated_at=now() WHERE id=$1`, [prqId]);
  await logAudit({ actorId: user.id, actorName: user.name, documentType: "PRQ", documentId: prqId, action: "Reject", newValue: reason || null });
  revalidatePath(`/payment-requisitions/${prqId}`);
  revalidatePath("/payment-requisitions");
}

export async function cancelPRQAction(prqId: number, reason: string) {
  const user = await requireUser();
  if (!can(user.role, "prq.manage")) throw new Error("FORBIDDEN");
  const prq = await loadPRQ(user, prqId);
  if (["Paid", "Cancelled"].includes(prq.status)) throw new Error("Đề nghị đã kết thúc — không hủy được.");
  await query(`UPDATE payment_requisitions SET status='Cancelled', updated_at=now() WHERE id=$1`, [prqId]);
  await logAudit({ actorId: user.id, actorName: user.name, documentType: "PRQ", documentId: prqId, action: "Cancel", newValue: reason || null });
  revalidatePath(`/payment-requisitions/${prqId}`);
  revalidatePath("/payment-requisitions");
}
