"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query, queryOne, withTransaction, firstRow, type Executor } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { canAccessCompany } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { docNumber } from "@/lib/numbering";
import { recomputePRQTotals } from "@/lib/prq-generate";
import { archiveDocumentAttachments } from "@/lib/archive";
import { resolveApprovalChain, isNextApprover } from "@/lib/approval";

/** Chặn IDOR + lấy trạng thái/công ty PRQ (kèm current_level + created_by cho duyệt 2 cấp). */
async function loadPRQ(user: { role: string; company_id: number | null }, prqId: number) {
  const row = await queryOne<{ id: number; company_id: number; supplier_id: number | null; status: string; current_level: number; created_by: number | null; grand_total: string }>(
    `SELECT id, company_id, supplier_id, status, current_level, created_by, grand_total FROM payment_requisitions WHERE id = $1`,
    [prqId]
  );
  if (!row) throw new Error("Không tìm thấy đề nghị thanh toán.");
  if (!canAccessCompany(user as never, row.company_id)) throw new Error("FORBIDDEN");
  return row;
}

/** Đọc điều khoản thanh toán từ FormData (dùng chung khi tạo/sửa PRQ).
 *  Trả { payment_method, advance_percent, payment_count, payment_installments(JSON|null) }. */
function readPaymentTerms(formData: FormData) {
  const payment_method = String(formData.get("payment_method") ?? "").trim() || null;
  const advRaw = formData.get("advance_percent");
  const advance_percent =
    payment_method === "Ứng trước" && advRaw != null && String(advRaw).trim() !== ""
      ? Math.max(0, Math.min(100, Number(advRaw)))
      : null;
  const rawCount = String(formData.get("payment_count") ?? "").trim();
  let payment_count: number | null = null;
  let payment_installments: string | null = null;
  if (rawCount !== "") {
    const n = Math.floor(Number(rawCount));
    if (!Number.isInteger(n) || n < 1 || n > 9) throw new Error("Số lần thanh toán phải là số nguyên từ 1 đến 9.");
    let arr: unknown = [];
    try { arr = JSON.parse(String(formData.get("payment_installments") ?? "[]")); } catch { arr = []; }
    // Mỗi kỳ: {amount, due_date} — due_date là NGÀY thanh toán cố định (ISO 'YYYY-MM-DD').
    const isISODate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
    const rows = (Array.isArray(arr) ? arr : []).slice(0, n).map((v) => {
      const o = (v && typeof v === "object" ? v : {}) as { amount?: unknown; due_date?: unknown };
      return { amount: Math.max(0, Number(o.amount) || 0), due_date: isISODate(o.due_date) ? o.due_date : null };
    });
    while (rows.length < n) rows.push({ amount: 0, due_date: null });
    payment_count = n;
    payment_installments = JSON.stringify(rows);
  }
  return { payment_method, advance_percent, payment_count, payment_installments };
}

/**
 * TẠO TAY một Đề nghị thanh toán (spec 08/2026) — độc lập với PR/PO, KHÔNG còn
 * sinh tự động. Người lập chọn các DÒNG PO đã duyệt (đến từng dòng, gộp nhiều PO)
 * CÙNG MỘT nhà cung cấp, kèm điều khoản thanh toán. Số tiền dòng lấy từ dòng PO
 * (đã gồm thuế); có thể sửa sau ở bước Nháp.
 */
export async function createPRQAction(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "prq.manage")) throw new Error("FORBIDDEN");

  // MÔ HÌNH MỖI LẦN CHI = 1 PRQ (feedback 20/08/2026): chọn 1 PO đã duyệt + nhập
  // SỐ TIỀN thanh toán lần này (một phần ≤ số còn lại của PO). PO có thể có NHIỀU
  // PRQ tới khi chi hết. Mỗi PRQ duyệt riêng rồi mới chi.
  const poId = Number(formData.get("po_id"));
  if (!poId) throw new Error("Vui lòng chọn đơn hàng (PO) để thanh toán.");
  const amount = Math.round(Number(formData.get("amount")) || 0);
  if (!(amount > 0)) throw new Error("Số tiền thanh toán phải lớn hơn 0.");

  const due_date = String(formData.get("due_date") ?? "").trim() || null;
  const bank_account = String(formData.get("bank_account") ?? "").trim() || null;
  const bank_name = String(formData.get("bank_name") ?? "").trim() || null;
  const reason = String(formData.get("reason") ?? "").trim() || null;
  // Bắt buộc ngay khi TẠO: nhập một lần, dùng lại các bước sau.
  const missing: string[] = [];
  if (!bank_account) missing.push("Số TK ngân hàng");
  if (!bank_name) missing.push("Tên ngân hàng");
  if (!due_date) missing.push("Ngày đến hạn");
  if (!reason) missing.push("Lý do / Nội dung");
  if (missing.length) throw new Error(`Vui lòng điền: ${missing.join(", ")}.`);

  const po = await queryOne<{ company_id: number; supplier_id: number | null; currency: string; status: string; grand_total: string; po_number: string | null }>(
    `SELECT company_id, supplier_id, currency, status, grand_total, po_number FROM purchase_orders WHERE id = $1`,
    [poId]
  );
  if (!po) throw new Error("Không tìm thấy đơn hàng.");
  if (["Draft", "Cancelled"].includes(po.status)) throw new Error("Chỉ thanh toán đơn hàng ĐÃ DUYỆT.");
  if (!canAccessCompany(user, po.company_id)) throw new Error("FORBIDDEN");

  // Số CÒN LẠI của PO = tổng PO − tổng các PRQ (chưa hủy/từ chối) đã lập cho PO này.
  const remaining = Number(po.grand_total) - (await poAllocated(poId));
  if (amount > remaining + 0.5)
    throw new Error(`Số tiền (${amount.toLocaleString("vi-VN")} ₫) vượt số còn lại của đơn hàng (${remaining.toLocaleString("vi-VN")} ₫).`);

  const sup = await queryOne<{ bank_account: string | null; tax_code: string | null }>(
    `SELECT bank_account, tax_code FROM suppliers WHERE id = $1`,
    [po.supplier_id]
  );
  const currency = po.currency || "VND";

  const prqId = await withTransaction(async (exec) => {
    const prq = await firstRow<{ id: number }>(
      exec,
      `INSERT INTO payment_requisitions
         (company_id, supplier_id, payment_type, currency, bank_account, bank_name, reason, due_date, status, created_by)
       VALUES ($1,$2,'Normal',$3,$4,$5,$6,$7,'Draft',$8) RETURNING id`,
      [po.company_id, po.supplier_id, currency, bank_account ?? sup?.bank_account ?? null, bank_name, reason, due_date, user.id]
    );
    await exec(`UPDATE payment_requisitions SET prq_number = $1 WHERE id = $2`, [docNumber("PRQ", prq!.id), prq!.id]);
    // 1 dòng = số tiền chi lần này (đã GỒM thuế → vat_rate 0 để recompute giữ nguyên tổng).
    await exec(
      `INSERT INTO payment_requisition_items
         (prq_id, po_id, po_item_id, description, tax_code, currency, amount, vat_rate, line_no)
       VALUES ($1,$2,NULL,$3,$4,$5,$6,0,1)`,
      [prq!.id, poId, `Thanh toán ${po.po_number ?? `PO-${poId}`}`, sup?.tax_code ?? null, currency, amount]
    );
    await recomputePRQTotals(exec, prq!.id);
    await logAudit({ actorId: user.id, actorName: user.name, documentType: "PRQ", documentId: prq!.id, action: "Create", newValue: docNumber("PRQ", prq!.id) }, exec);
    return prq!.id;
  });

  revalidatePath("/payment-requisitions");
  redirect(`/payment-requisitions/${prqId}`);
}

/** Tổng số tiền đã "chiếm" của 1 PO = Σ grand_total các PRQ (trừ Rejected/Cancelled)
 *  có dòng trỏ tới PO đó. Dùng cho "PO còn lại" khi tạo & liệt kê. */
export async function poAllocated(poId: number): Promise<number> {
  const r = await queryOne<{ s: string }>(
    `SELECT COALESCE(sum(p.grand_total),0) AS s FROM payment_requisitions p
      WHERE p.status NOT IN ('Rejected','Cancelled')
        AND EXISTS (SELECT 1 FROM payment_requisition_items it WHERE it.prq_id = p.id AND it.po_id = $1)`,
    [poId]
  );
  return Number(r?.s ?? 0);
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
    // Điều khoản thanh toán: CHỈ ghi đè khi form có gửi (tránh xóa trắng khi sửa
    // các phần khác không kèm module điều khoản).
    if (formData.has("payment_method")) {
      const terms = readPaymentTerms(formData);
      await exec(
        `UPDATE payment_requisitions
            SET payment_method=$1, advance_percent=$2, payment_count=$3, payment_installments=$4, updated_at=now()
          WHERE id=$5`,
        [terms.payment_method, terms.advance_percent, terms.payment_count, terms.payment_installments, prqId]
      );
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

export async function submitPRQAction(prqId: number): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!can(user.role, "prq.manage")) return { ok: false, error: "Bạn không có quyền gửi duyệt." };
  const prq = await queryOne<{
    company_id: number; status: string; bank_account: string | null; bank_name: string | null;
    due_date: string | null; reason: string | null; payment_count: number | null; payment_installments: unknown;
  }>(
    `SELECT company_id, status, bank_account, bank_name, due_date, reason, payment_count, payment_installments
       FROM payment_requisitions WHERE id = $1`,
    [prqId]
  );
  if (!prq) return { ok: false, error: "Không tìm thấy đề nghị thanh toán." };
  if (!canAccessCompany(user, prq.company_id)) return { ok: false, error: "FORBIDDEN" };
  if (prq.status !== "Draft") return { ok: false, error: "Chỉ gửi được đề nghị đang Nháp." };

  // (5) Trường bắt buộc khi gửi duyệt.
  const missing: string[] = [];
  if (!prq.bank_account?.trim()) missing.push("Số TK ngân hàng");
  if (!prq.bank_name?.trim()) missing.push("Tên ngân hàng");
  if (!prq.due_date) missing.push("Ngày đến hạn");
  if (!prq.reason?.trim()) missing.push("Lý do / diễn giải");
  if (missing.length) return { ok: false, error: `Vui lòng điền: ${missing.join(", ")} — trước khi gửi duyệt.` };

  // (6) Kế hoạch chia kỳ (payment_installments) nay CHỈ là DỰ KIẾN để nhắc hạn —
  // KHÔNG bắt buộc, KHÔNG ràng khớp tổng (feedback 20/08/2026: chi từng phần tùy ý
  // qua sổ prq_payments). Không validate gì thêm ở đây.

  // (7) Bắt buộc đã tải lên chứng từ "PRQ đã ký".
  const signed = await queryOne<{ n: number }>(
    `SELECT count(*)::int AS n FROM attachments WHERE document_type='PRQ' AND document_id=$1 AND kind='PRQ đã ký'`,
    [prqId]
  );
  if (!signed || signed.n === 0)
    return { ok: false, error: "Vui lòng tải lên chứng từ 'PRQ đã ký' trước khi gửi duyệt đề nghị thanh toán." };

  // Gửi duyệt → về cấp 0 (bắt đầu lại chuỗi duyệt 2 cấp Finance→Manager).
  await query(`UPDATE payment_requisitions SET status='Submitted', current_level=0, updated_at=now() WHERE id=$1`, [prqId]);
  await logAudit({ actorId: user.id, actorName: user.name, documentType: "PRQ", documentId: prqId, action: "Submit" });
  revalidatePath(`/payment-requisitions/${prqId}`);
  revalidatePath("/payment-requisitions");
  return { ok: true };
}

export async function approvePRQAction(prqId: number, comment?: string) {
  const user = await requireUser();
  if (!can(user.role, "prq.approve")) throw new Error("FORBIDDEN");
  const prq = await loadPRQ(user, prqId);
  if (prq.status !== "Submitted") throw new Error("Chỉ duyệt được đề nghị đã gửi.");

  // SoD: không được tự duyệt đề nghị do CHÍNH MÌNH lập (kể cả khi có quyền duyệt).
  // Ngoại lệ: tài khoản SIÊU QUẢN TRỊ test + MỌI Admin (siêu quyền, toàn quyền duyệt
  // kể cả đơn mình lập — feedback 20/08/2026).
  const SUPER_TEST_EMAIL = (process.env.SUPER_TEST_EMAIL || "super@k-homes.vn").toLowerCase();
  const isSuperTest = user.email.toLowerCase() === SUPER_TEST_EMAIL;
  if (prq.created_by === user.id && !isSuperTest && user.role !== "Admin")
    throw new Error("Bạn không được tự duyệt đề nghị do chính mình lập (phân tách nhiệm vụ).");

  // Chuỗi duyệt 2 cấp [Finance, Manager]. Ép ĐÚNG lượt: cấp 1 = Finance (Sa),
  // cấp 2 = Manager (Huyền). Admin duyệt được mọi cấp (isNextApprover).
  const chain = await resolveApprovalChain(0, "PRQ");
  if (!isNextApprover(chain, prq.current_level, user.role))
    throw new Error(`Chưa tới lượt bạn duyệt. Cấp cần duyệt tiếp theo: ${chain[prq.current_level] ?? "—"}`);

  // Superadmin (Admin) duyệt CẢ chuỗi trong MỘT lượt → nhảy thẳng tới cấp cuối
  // (feedback 20/08/2026: Superadmin duyệt được cả 2 bước). Vai trò khác tiến 1 cấp.
  const newLevel = user.role === "Admin" ? chain.length : prq.current_level + 1;
  await withTransaction(async (exec) => {
    // Optimistic locking theo current_level: chỉ tiến cấp nếu chưa ai đổi.
    const locked = await firstRow<{ id: number }>(
      exec,
      `UPDATE payment_requisitions
          SET current_level = $2::int,
              status = CASE WHEN $2::int >= $3::int THEN 'Approved' ELSE status END,
              updated_at = now()
        WHERE id = $1 AND current_level = $4::int AND status = 'Submitted'
        RETURNING id`,
      [prqId, newLevel, chain.length, prq.current_level]
    );
    if (!locked) throw new Error("Đề nghị vừa được người khác cập nhật. Vui lòng tải lại trang.");
    await exec(
      `INSERT INTO approval_history (document_type, document_id, approver_id, approval_level, status, comment)
       VALUES ('PRQ',$1,$2,$3,'Approved',$4)`,
      [prqId, user.id, newLevel, comment || null]
    );
    await logAudit(
      { actorId: user.id, actorName: user.name, documentType: "PRQ", documentId: prqId, action: "Approve", field: `Cấp ${newLevel}/${chain.length}`, newValue: comment || "Approved" },
      exec
    );
  });
  revalidatePath(`/payment-requisitions/${prqId}`);
  revalidatePath("/payment-requisitions");
  revalidatePath("/ke-toan");
}

/** Tổng đã chi của 1 PRQ (SUM sổ prq_payments). */
async function prqPaidTotal(prqId: number): Promise<number> {
  const r = await queryOne<{ s: string }>(`SELECT COALESCE(sum(amount),0) AS s FROM prq_payments WHERE prq_id=$1`, [prqId]);
  return Number(r?.s ?? 0);
}

/** Kế toán GHI NHẬN CHI TIỀN TỪNG PHẦN (feedback 20/08/2026): mỗi lần chi số tiền
 *  tùy ý vào sổ prq_payments. Khi tổng đã chi ĐỦ tổng PRQ → chuyển 'Paid' và lưu
 *  trữ đính kèm. Chi lố số còn lại bị chặn. Duyệt 1 lần, chi nhiều lần. */
export async function addPRQPaymentAction(prqId: number, amount: number, paidRef?: string, paidDate?: string): Promise<{ paymentId: number }> {
  const user = await requireUser();
  if (!can(user.role, "prq.pay")) throw new Error("FORBIDDEN");
  const prq = await loadPRQ(user, prqId);
  if (prq.status !== "Approved") throw new Error("Chỉ chi tiền cho đề nghị đã DUYỆT (và chưa chi đủ).");

  const amt = Number(amount);
  if (!(amt > 0)) throw new Error("Số tiền chi phải lớn hơn 0.");
  const grand = Number(prq.grand_total ?? 0);
  const paid = await prqPaidTotal(prqId);
  const remaining = grand - paid;
  if (amt > remaining + 0.5)
    throw new Error(`Số tiền chi (${amt.toLocaleString("vi-VN")} ₫) vượt số còn lại (${remaining.toLocaleString("vi-VN")} ₫).`);

  const ref = (paidRef ?? "").trim() || null;
  const isISODate = typeof paidDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(paidDate);
  const nowPaid = paid + amt;
  const settled = nowPaid >= grand - 0.5; // đã chi đủ → kết PRQ

  const paymentId = await withTransaction(async (exec) => {
    const inserted = await firstRow<{ id: number }>(
      exec,
      `INSERT INTO prq_payments (prq_id, amount, paid_date, paid_ref, paid_by)
       VALUES ($1,$2,${isISODate ? "$5::date" : "current_date"},$3,$4) RETURNING id`,
      isISODate ? [prqId, amt, ref, user.id, paidDate] : [prqId, amt, ref, user.id]
    );
    if (settled) {
      // Kết PRQ: cột paid_* header ghi LẦN CHI CUỐI (ngày/UNC gần nhất) để tương thích.
      // LƯU Ý đánh số tham số theo nhánh: có ngày → paid_ref=$4; không ngày → paid_ref=$3.
      await exec(
        `UPDATE payment_requisitions
            SET status='Paid', paid_date=${isISODate ? "$3::date" : "current_date"}, paid_by=$2, paid_ref=${isISODate ? "$4" : "$3"}, updated_at=now()
          WHERE id=$1`,
        isISODate ? [prqId, user.id, paidDate, ref] : [prqId, user.id, ref]
      );
    } else {
      await exec(`UPDATE payment_requisitions SET updated_at=now() WHERE id=$1`, [prqId]);
    }
    return inserted!.id;
  });

  await logAudit({
    actorId: user.id, actorName: user.name, documentType: "PRQ", documentId: prqId,
    action: settled ? "Pay" : "PayPartial",
    field: `${nowPaid.toLocaleString("vi-VN")}/${grand.toLocaleString("vi-VN")} ₫`,
    newValue: `+${amt.toLocaleString("vi-VN")} ₫${ref ? ` · ${ref}` : ""}`,
  });
  revalidatePath(`/payment-requisitions/${prqId}`);
  revalidatePath("/payment-requisitions");
  revalidatePath("/ke-toan");
  // Chi ĐỦ = PRQ hoàn tất → lưu trữ đính kèm lên OneDrive (best-effort).
  if (settled) await archiveDocumentAttachments("PRQ", prqId);
  return { paymentId };
}

/** Người duyệt TỪ CHỐI đề nghị đã gửi. Excel đã xuất/gửi NCC nên quyết định chỉ
 *  có 2 nhánh: Duyệt hoặc Từ chối. Ghi lý do để người lập biết mà xử lý. */
export async function rejectPRQAction(prqId: number, reason: string) {
  const user = await requireUser();
  if (!can(user.role, "prq.approve")) throw new Error("FORBIDDEN");
  const prq = await loadPRQ(user, prqId);
  if (prq.status !== "Submitted") throw new Error("Chỉ từ chối được đề nghị đã gửi.");
  // Chỉ người ĐÚNG LƯỢT duyệt mới được từ chối (Huyền không phủ quyết trước Sa).
  const chain = await resolveApprovalChain(0, "PRQ");
  if (!isNextApprover(chain, prq.current_level, user.role))
    throw new Error(`Chưa tới lượt bạn xử lý. Cấp cần duyệt tiếp theo: ${chain[prq.current_level] ?? "—"}`);
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
