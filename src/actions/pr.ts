"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query, queryOne, withTransaction, firstRow } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { canAccessCompany } from "@/lib/access";
import { docNumber } from "@/lib/numbering";
import { resolveApprovalChain, isNextApprover } from "@/lib/approval";
import { generatePOFromPR } from "@/lib/po-generate";
import { logAudit } from "@/lib/audit";

interface ItemInput {
  item_code?: string;
  item_name: string;
  description?: string;
  quantity: number;
  unit?: string;
  estimated_price: number;
  supplier_suggestion?: number | null;
  note?: string;
}

export async function createPRAction(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "pr.create")) throw new Error("FORBIDDEN");

  const company_id = Number(formData.get("company_id"));
  const purpose = String(formData.get("purpose") ?? "");
  const priority = String(formData.get("priority") ?? "Normal");
  const required_date = String(formData.get("required_date") ?? "") || null;
  const department = String(formData.get("department") ?? user.department ?? "");
  const submit = formData.get("submit") === "1";
  const items: ItemInput[] = JSON.parse(String(formData.get("items") ?? "[]"));

  // --- Kiểm tra dữ liệu phía server (không tin dữ liệu từ client) ---
  if (!company_id) throw new Error("Vui lòng chọn công ty.");
  const validItems = items.filter((it) => it.item_name?.trim());
  if (validItems.length === 0) throw new Error("Cần ít nhất một dòng hàng hợp lệ.");
  for (const it of validItems) {
    if (Number(it.quantity) <= 0) throw new Error(`Số lượng của "${it.item_name}" phải lớn hơn 0.`);
    if (Number(it.estimated_price) < 0) throw new Error(`Đơn giá của "${it.item_name}" không được âm.`);
  }

  const total = validItems.reduce((s, i) => s + Number(i.quantity) * Number(i.estimated_price), 0);
  const status = submit ? "Pending Approval" : "Draft";

  // Toàn bộ ghi trong MỘT transaction — nếu lỗi giữa chừng sẽ rollback sạch.
  const prId = await withTransaction(async (exec) => {
    const pr = await firstRow<{ id: number }>(
      exec,
      `INSERT INTO purchase_requests
         (request_date, requester_id, department, company_id, purpose, priority, required_date, status, total_amount, current_level, created_by)
       VALUES (current_date, $1,$2,$3,$4,$5,$6,$7,$8,0,$1) RETURNING id`,
      [user.id, department, company_id, purpose, priority, required_date, status, total]
    );
    await exec(`UPDATE purchase_requests SET pr_number = $1 WHERE id = $2`, [docNumber("PR", pr!.id), pr!.id]);

    let line = 1;
    for (const it of validItems) {
      await exec(
        `INSERT INTO purchase_request_items
           (pr_id, item_code, item_name, description, quantity, unit, estimated_price, supplier_suggestion, note, line_no)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [pr!.id, it.item_code || null, it.item_name, it.description || null, it.quantity, it.unit || "PCS", it.estimated_price, it.supplier_suggestion || null, it.note || null, line++]
      );
    }
    if (submit) {
      await exec(
        `INSERT INTO approval_history (document_type, document_id, approver_id, approval_level, status, comment)
         VALUES ('PR',$1,$2,0,'Submitted','Submitted for approval')`,
        [pr!.id, user.id]
      );
    }
    await logAudit(
      { actorId: user.id, actorName: user.name, documentType: "PR", documentId: pr!.id, action: submit ? "Submit" : "Create", newValue: docNumber("PR", pr!.id) },
      exec
    );
    return pr!.id;
  });

  revalidatePath("/purchase-requests");
  redirect(`/purchase-requests/${prId}`);
}

export async function submitPRAction(prId: number) {
  const user = await requireUser();
  const pr = await queryOne<{ requester_id: number; status: string; company_id: number | null }>(
    `SELECT requester_id, status, company_id FROM purchase_requests WHERE id = $1`,
    [prId]
  );
  if (!pr || pr.status !== "Draft") throw new Error("Chỉ PR nháp mới được gửi duyệt.");
  if (!canAccessCompany(user, pr.company_id)) throw new Error("FORBIDDEN");
  await query(`UPDATE purchase_requests SET status = 'Pending Approval', updated_at = now() WHERE id = $1`, [prId]);
  await query(
    `INSERT INTO approval_history (document_type, document_id, approver_id, approval_level, status, comment)
     VALUES ('PR',$1,$2,0,'Submitted','Submitted for approval')`,
    [prId, user.id]
  );
  await logAudit({ actorId: user.id, actorName: user.name, documentType: "PR", documentId: prId, action: "Submit" });
  revalidatePath(`/purchase-requests/${prId}`);
}

export async function approvePRAction(prId: number, comment: string) {
  const user = await requireUser();
  if (!can(user.role, "pr.approve")) throw new Error("FORBIDDEN");

  const pr = await queryOne<{ total_amount: string; current_level: number; status: string; company_id: number | null }>(
    `SELECT total_amount, current_level, status, company_id FROM purchase_requests WHERE id = $1`,
    [prId]
  );
  if (!pr || pr.status !== "Pending Approval") throw new Error("PR không ở trạng thái chờ duyệt.");
  if (!canAccessCompany(user, pr.company_id)) throw new Error("FORBIDDEN");

  const chain = await resolveApprovalChain(Number(pr.total_amount));
  if (!isNextApprover(chain, pr.current_level, user.role)) {
    throw new Error(`Chưa tới lượt bạn duyệt. Cấp cần duyệt tiếp theo: ${chain[pr.current_level] ?? "—"}`);
  }

  const newLevel = pr.current_level + 1;

  await withTransaction(async (exec) => {
    // Optimistic locking: chỉ tăng cấp nếu current_level chưa bị người khác thay đổi.
    const locked = await firstRow<{ id: number }>(
      exec,
      `UPDATE purchase_requests
          SET current_level = $2::int, status = CASE WHEN $2::int >= $3::int THEN 'Approved' ELSE status END, updated_at = now()
        WHERE id = $1 AND current_level = $4::int AND status = 'Pending Approval'
        RETURNING id`,
      [prId, newLevel, chain.length, pr.current_level]
    );
    if (!locked) throw new Error("PR vừa được người khác cập nhật. Vui lòng tải lại trang.");

    await exec(
      `INSERT INTO approval_history (document_type, document_id, approver_id, approval_level, status, comment)
       VALUES ('PR',$1,$2,$3,'Approved',$4)`,
      [prId, user.id, newLevel, comment || null]
    );
    await logAudit(
      { actorId: user.id, actorName: user.name, documentType: "PR", documentId: prId, action: "Approve", field: `Level ${newLevel}`, newValue: comment || "Approved" },
      exec
    );

    if (newLevel >= chain.length) {
      // Fully approved → auto-generate the PO draft (cùng transaction).
      await generatePOFromPR(prId, exec);
    }
  });

  revalidatePath(`/purchase-requests/${prId}`);
  revalidatePath("/purchase-orders");
}

export async function rejectPRAction(prId: number, comment: string) {
  const user = await requireUser();
  if (!can(user.role, "pr.approve")) throw new Error("FORBIDDEN");
  const pr = await queryOne<{ current_level: number; status: string; company_id: number | null }>(
    `SELECT current_level, status, company_id FROM purchase_requests WHERE id = $1`,
    [prId]
  );
  if (!pr || pr.status !== "Pending Approval") throw new Error("PR không ở trạng thái chờ duyệt.");
  if (!canAccessCompany(user, pr.company_id)) throw new Error("FORBIDDEN");
  await query(`UPDATE purchase_requests SET status = 'Rejected', updated_at = now() WHERE id = $1`, [prId]);
  await query(
    `INSERT INTO approval_history (document_type, document_id, approver_id, approval_level, status, comment)
     VALUES ('PR',$1,$2,$3,'Rejected',$4)`,
    [prId, user.id, pr.current_level + 1, comment || null]
  );
  await logAudit({ actorId: user.id, actorName: user.name, documentType: "PR", documentId: prId, action: "Reject", newValue: comment || "Rejected" });
  revalidatePath(`/purchase-requests/${prId}`);
}

/** Mở lại PR đã BỊ TỪ CHỐI → đưa về 'Pending Approval', duyệt lại từ đầu
 *  (current_level = 0). Chỉ vai trò có quyền duyệt (Manager/Finance/Admin) và
 *  cùng công ty. Ghi 1 dòng lịch sử 'Reopened' + audit; KHÔNG đụng bình luận. */
export async function reopenPRAction(prId: number, comment: string) {
  const user = await requireUser();
  if (!can(user.role, "pr.approve")) throw new Error("FORBIDDEN");
  const pr = await queryOne<{ status: string; company_id: number | null }>(
    `SELECT status, company_id FROM purchase_requests WHERE id = $1`,
    [prId]
  );
  if (!pr || pr.status !== "Rejected") throw new Error("Chỉ mở lại được PR đang ở trạng thái Từ chối.");
  if (!canAccessCompany(user, pr.company_id)) throw new Error("FORBIDDEN");

  await withTransaction(async (exec) => {
    await exec(
      `UPDATE purchase_requests SET status = 'Pending Approval', current_level = 0, updated_at = now()
        WHERE id = $1 AND status = 'Rejected'`,
      [prId]
    );
    await exec(
      `INSERT INTO approval_history (document_type, document_id, approver_id, approval_level, status, comment)
       VALUES ('PR',$1,$2,0,'Reopened',$3)`,
      [prId, user.id, comment || null]
    );
    await logAudit(
      { actorId: user.id, actorName: user.name, documentType: "PR", documentId: prId, action: "Reopen", newValue: comment || "Mở lại để duyệt lại" },
      exec
    );
  });
  revalidatePath(`/purchase-requests/${prId}`);
}
