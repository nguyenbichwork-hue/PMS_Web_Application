"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createHash } from "node:crypto";
import { query, queryOne, withTransaction, firstRow } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { canAccessCompany, isCrossCompanyApprover } from "@/lib/access";
import { docNumber } from "@/lib/numbering";
import { resolveApprovalChain, isNextApprover } from "@/lib/approval";
import { generatePOFromPR } from "@/lib/po-generate";
import { autoApprovePO } from "@/actions/po";
import { saveBuffer, removeFile } from "@/lib/storage";
import { PR_ATTACHMENT_TYPES } from "@/lib/attachment-types";
import { logAudit } from "@/lib/audit";

const MAX_ATTACH_BYTES = 10 * 1024 * 1024; // 10MB / tệp

interface ItemInput {
  item_code?: string;
  item_name: string;
  description?: string;
  quantity: number;
  unit?: string;
  estimated_price: number;
  vat_rate?: number;
  supplier_suggestion?: number | null;
  supplier_text?: string | null;
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
  // Các trường người YÊU CẦU điền (ô vàng) — spec 07/2026.
  const project_code = String(formData.get("project_code") ?? "").trim() || null;
  const delivery_location = String(formData.get("delivery_location") ?? "").trim() || null;
  const requester_status = String(formData.get("requester_status") ?? "").trim() || null;
  const buyer = String(formData.get("buyer") ?? "").trim() || null;
  const payment_method = String(formData.get("payment_method") ?? "").trim() || null;
  const advRaw = formData.get("advance_percent");
  // % ứng trước chỉ có nghĩa khi hình thức = Ứng trước.
  const advance_percent =
    payment_method === "Ứng trước" && advRaw != null && String(advRaw).trim() !== ""
      ? Math.max(0, Math.min(100, Number(advRaw)))
      : null;
  // Liên kết mua ↔ bán: khách hàng / dự án / số đơn bán.
  const customer_id = formData.get("customer_id") ? Number(formData.get("customer_id")) : null;
  const project_id = formData.get("project_id") ? Number(formData.get("project_id")) : null;
  const sales_order_ref = String(formData.get("sales_order_ref") ?? "").trim() || null;
  // Hình thức thanh toán nhiều lần: số lần (số nguyên 1..9) + mỗi lần {số tiền, số ngày}.
  const rawCount = String(formData.get("payment_count") ?? "").trim();
  let payment_count: number | null = null;
  let payment_installments: { amount: number; days: number }[] | null = null;
  if (rawCount !== "") {
    const n = Math.floor(Number(rawCount));
    if (!Number.isInteger(n) || n < 1 || n > 9) throw new Error("Số lần thanh toán phải là số nguyên từ 1 đến 9.");
    let arr: unknown = [];
    try { arr = JSON.parse(String(formData.get("payment_installments") ?? "[]")); } catch { arr = []; }
    const rows = (Array.isArray(arr) ? arr : []).slice(0, n).map((v) => {
      const o = (v && typeof v === "object" ? v : {}) as { amount?: unknown; days?: unknown };
      return { amount: Math.max(0, Number(o.amount) || 0), days: Math.max(0, Math.floor(Number(o.days) || 0)) };
    });
    while (rows.length < n) rows.push({ amount: 0, days: 0 });
    payment_count = n;
    payment_installments = rows;
  }
  // Tệp đính kèm BẮT BUỘC, TÁCH THEO LOẠI (files_<key>). Không tệp nào → chặn tạo PR.
  // KHÔNG dùng `instanceof File` — trong Server Action, tệp có thể không phải instance
  // của global File → lọc theo "không phải chuỗi".
  const pickedFiles: { file: File; kind: string }[] = [];
  for (const t of PR_ATTACHMENT_TYPES) {
    for (const f of formData.getAll(`files_${t.key}`)) {
      if (typeof f !== "string" && f && (f as File).size > 0) pickedFiles.push({ file: f as File, kind: t.label });
    }
  }
  if (pickedFiles.length === 0) throw new Error("Bắt buộc đính kèm ít nhất một tệp (theo loại chứng từ) trước khi tạo PR.");
  for (const { file } of pickedFiles) if (file.size > MAX_ATTACH_BYTES) throw new Error(`Tệp "${file.name}" vượt quá 10MB.`);

  // --- Kiểm tra dữ liệu phía server (không tin dữ liệu từ client) ---
  if (!company_id) throw new Error("Vui lòng chọn công ty.");
  const validItems = items.filter((it) => it.item_name?.trim());
  if (validItems.length === 0) throw new Error("Cần ít nhất một dòng hàng hợp lệ.");
  const vatOf = (it: ItemInput) => {
    const r = Number(it.vat_rate);
    return Number.isFinite(r) && r >= 0 ? r : 10; // mặc định 10% nếu để trống
  };
  for (const it of validItems) {
    if (Number(it.quantity) <= 0) throw new Error(`Số lượng của "${it.item_name}" phải lớn hơn 0.`);
    if (Number(it.estimated_price) < 0) throw new Error(`Đơn giá của "${it.item_name}" không được âm.`);
    if (vatOf(it) > 100) throw new Error(`Thuế suất của "${it.item_name}" không hợp lệ.`);
  }

  // total_amount = tiền chưa thuế (net); vat_total = tổng thuế cộng thêm.
  const total = validItems.reduce((s, i) => s + Number(i.quantity) * Number(i.estimated_price), 0);
  const vatTotal = validItems.reduce((s, i) => s + (Number(i.quantity) * Number(i.estimated_price) * vatOf(i)) / 100, 0);
  const status = submit ? "Pending Approval" : "Draft";

  // Lưu tệp ra kho TRƯỚC (ngoài transaction DB) — tránh gọi filesystem trong tx và
  // để mọi lỗi ghi tệp lộ ra rõ ràng. Băm SHA-256 chống trùng nội dung trong cùng lần.
  const savedFiles: { kind: string; storedName: string; originalName: string; hash: string }[] = [];
  const seenHashes = new Set<string>();
  try {
    for (const { file, kind } of pickedFiles) {
      const buf = Buffer.from(await file.arrayBuffer());
      const hash = createHash("sha256").update(buf).digest("hex");
      if (seenHashes.has(hash)) continue; // bỏ tệp trùng trong cùng lần tải
      seenHashes.add(hash);
      const saved = await saveBuffer(buf, file.name || "file");
      savedFiles.push({ kind, storedName: saved.storedName, originalName: saved.originalName, hash });
    }
  } catch (e) {
    for (const sf of savedFiles) await removeFile(sf.storedName); // dọn tệp đã ghi dở
    throw new Error("Lỗi khi lưu tệp đính kèm: " + ((e as Error)?.message || "không rõ nguyên nhân"));
  }

  let prId: number;
  try {
    // Toàn bộ ghi DB trong MỘT transaction — lỗi giữa chừng sẽ rollback sạch.
    prId = await withTransaction(async (exec) => {
      const pr = await firstRow<{ id: number }>(
        exec,
        `INSERT INTO purchase_requests
           (request_date, requester_id, department, company_id, purpose, priority, required_date, status, total_amount, vat_total, current_level, created_by,
            project_code, delivery_location, requester_status, payment_method, advance_percent, buyer,
            customer_id, project_id, sales_order_ref, payment_count, payment_installments)
         VALUES (current_date, $1,$2,$3,$4,$5,$6,$7,$8,$9,0,$1, $10,$11,$12,$13,$14,$15, $16,$17,$18, $19,$20) RETURNING id`,
        [user.id, department, company_id, purpose, priority, required_date, status, total, vatTotal,
         project_code, delivery_location, requester_status, payment_method, advance_percent, buyer,
         customer_id, project_id, sales_order_ref,
         payment_count, payment_installments ? JSON.stringify(payment_installments) : null]
      );
      await exec(`UPDATE purchase_requests SET pr_number = $1 WHERE id = $2`, [docNumber("PR", pr!.id), pr!.id]);

      let line = 1;
      for (const it of validItems) {
        await exec(
          `INSERT INTO purchase_request_items
             (pr_id, item_code, item_name, description, quantity, unit, estimated_price, vat_rate, supplier_suggestion, supplier_text, note, line_no)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [pr!.id, it.item_code || null, it.item_name, it.description || null, it.quantity, it.unit || "PCS", it.estimated_price, vatOf(it), it.supplier_suggestion || null, (it.supplier_text || "").trim() || null, it.note || null, line++]
        );
      }
      // Gắn tệp đã lưu vào PR (theo LOẠI chứng từ).
      for (const sf of savedFiles) {
        await exec(
          `INSERT INTO attachments (document_type, document_id, kind, file_name, file_url, uploaded_by, file_hash)
           VALUES ('PR',$1,$2,$3,$4,$5,$6)`,
          [pr!.id, sf.kind, sf.originalName, sf.storedName, user.id, sf.hash]
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
  } catch (e) {
    for (const sf of savedFiles) await removeFile(sf.storedName); // DB rollback → xóa tệp mồ côi
    throw e;
  }

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

  const pr = await queryOne<{ total_amount: string; current_level: number; status: string; company_id: number | null; requester_id: number }>(
    `SELECT total_amount, current_level, status, company_id, requester_id FROM purchase_requests WHERE id = $1`,
    [prId]
  );
  if (!pr || pr.status !== "Pending Approval") throw new Error("PR không ở trạng thái chờ duyệt.");
  // Manager/Finance/Admin duyệt xuyên công ty; vai trò khác phải cùng công ty.
  if (!isCrossCompanyApprover(user) && !canAccessCompany(user, pr.company_id)) throw new Error("FORBIDDEN");
  // SoD (§4.1, UAT-40): không được tự duyệt PR do chính mình tạo (kể cả Admin).
  // NGOẠI LỆ: tài khoản SIÊU QUẢN TRỊ để TEST nghiệp vụ (SUPER_TEST_EMAIL, mặc
  // định super@k-homes.vn) được tự duyệt để chạy một mình toàn luồng. SoD vẫn
  // áp cho MỌI tài khoản khác — đây là chốt bảo mật thật, chỉ nới cho 1 email test.
  const SUPER_TEST_EMAIL = (process.env.SUPER_TEST_EMAIL || "super@k-homes.vn").toLowerCase();
  const isSuperTest = user.email.toLowerCase() === SUPER_TEST_EMAIL;
  if (pr.requester_id === user.id && !isSuperTest) throw new Error("Bạn không được tự duyệt PR do chính mình tạo (phân tách nhiệm vụ).");

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
      // Duyệt xong PR → sinh PO rồi DUYỆT LUÔN PO (không cần bước duyệt PO riêng,
      // spec 07/2026). Auto-approve kèm chốt ngân sách dự án + sinh Đề nghị thanh
      // toán (PRQ). Tất cả trong CÙNG transaction — vượt ngân sách sẽ rollback cả
      // bước duyệt PR.
      const poId = await generatePOFromPR(prId, exec);
      await autoApprovePO(exec, poId, user.id, user.name);
    }
  });

  revalidatePath(`/purchase-requests/${prId}`);
  revalidatePath("/purchase-orders");
  revalidatePath("/payment-requisitions");
}

export async function rejectPRAction(prId: number, comment: string) {
  const user = await requireUser();
  if (!can(user.role, "pr.approve")) throw new Error("FORBIDDEN");
  const pr = await queryOne<{ current_level: number; status: string; company_id: number | null }>(
    `SELECT current_level, status, company_id FROM purchase_requests WHERE id = $1`,
    [prId]
  );
  if (!pr || pr.status !== "Pending Approval") throw new Error("PR không ở trạng thái chờ duyệt.");
  if (!isCrossCompanyApprover(user) && !canAccessCompany(user, pr.company_id)) throw new Error("FORBIDDEN");
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
  if (!isCrossCompanyApprover(user) && !canAccessCompany(user, pr.company_id)) throw new Error("FORBIDDEN");

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
