"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query, queryOne, withTransaction, firstRow } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { evaluateMatch, type MatchLine } from "@/lib/matching";
import { logAudit } from "@/lib/audit";

interface InvLine {
  item_code?: string;
  description?: string;
  quantity: number;
  unit_price: number;
}

export async function createInvoiceAction(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "invoice.manage")) throw new Error("FORBIDDEN");

  const invoice_number = String(formData.get("invoice_number") ?? "");
  const invoice_date = String(formData.get("invoice_date") ?? "") || null;
  const po_id = formData.get("po_id") ? Number(formData.get("po_id")) : null;
  const file_attachment = String(formData.get("file_attachment") ?? "") || null;
  const vatInput = Number(formData.get("vat_amount") ?? 0);
  // Supplier THẬT của hóa đơn (do người nhập chọn) — KHÔNG suy ra từ PO nữa,
  // để CHECK Supplier trong đối chiếu có hiệu lực thực sự.
  const supplierInput = formData.get("supplier_id") ? Number(formData.get("supplier_id")) : null;
  const lines: InvLine[] = JSON.parse(String(formData.get("lines") ?? "[]"));

  if (!invoice_number.trim()) throw new Error("Vui lòng nhập số hóa đơn.");
  if (lines.length === 0) throw new Error("Hóa đơn cần ít nhất một dòng.");
  for (const l of lines) {
    if (Number(l.quantity) <= 0) throw new Error("Số lượng trên dòng hóa đơn phải lớn hơn 0.");
    if (Number(l.unit_price) < 0) throw new Error("Đơn giá không được âm.");
  }

  const invSub = lines.reduce((s, l) => s + Number(l.quantity) * Number(l.unit_price), 0);
  const invVat = vatInput || Math.round(invSub * 0.1);
  const invTotal = invSub + invVat;

  let matchStatus = "Pending";
  let overall: string | null = null;
  let poSupplierId: number | null = null;
  let checks: { check_name: string; result: string; reason: string }[] = [];

  if (po_id) {
    const po = await queryOne<{ supplier_id: number | null; grand_total: string; vat_total: string; po_qty: string; po_sub: string }>(
      `SELECT po.supplier_id, po.grand_total, po.vat_total,
              COALESCE((SELECT sum(quantity) FROM purchase_order_items WHERE po_id = po.id),0) AS po_qty,
              COALESCE((SELECT sum(quantity*unit_price - discount) FROM purchase_order_items WHERE po_id = po.id),0) AS po_sub
         FROM purchase_orders po WHERE po.id = $1`,
      [po_id]
    );
    poSupplierId = po?.supplier_id ?? null;

    // Đơn giá PO theo từng mã hàng (để so khớp theo dòng).
    const poItems = await query<{ item_code: string | null; description: string; unit_price: string }>(
      `SELECT item_code, description, unit_price FROM purchase_order_items WHERE po_id = $1`,
      [po_id]
    );
    const priceByCode = new Map<string, number>();
    const priceByDesc = new Map<string, number>();
    for (const it of poItems) {
      if (it.item_code) priceByCode.set(it.item_code, Number(it.unit_price));
      priceByDesc.set(it.description, Number(it.unit_price));
    }
    const matchLines: MatchLine[] = lines.map((l) => {
      const poPrice =
        (l.item_code && priceByCode.has(l.item_code) ? priceByCode.get(l.item_code!) : undefined) ??
        (l.description && priceByDesc.has(l.description) ? priceByDesc.get(l.description) : undefined) ??
        null;
      return { itemCode: l.item_code ?? null, description: l.description, invoicePrice: Number(l.unit_price), poPrice: poPrice ?? null };
    });

    const received = await queryOne<{ q: string }>(
      `SELECT COALESCE(sum(gri.received_qty),0) AS q
         FROM goods_receipt_items gri JOIN goods_receipts gr ON gr.id = gri.gr_id
        WHERE gr.po_id = $1`,
      [po_id]
    );
    // Nhiều hóa đơn/PO: trừ số lượng đã được xuất hóa đơn ở các hóa đơn TRƯỚC,
    // để hóa đơn hiện tại chỉ đối chiếu với phần CÒN LẠI (chống xuất hóa đơn vượt).
    const invoicedBefore = await queryOne<{ q: string }>(
      `SELECT COALESCE(sum(ii.quantity),0) AS q
         FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
        WHERE i.po_id = $1`,
      [po_id]
    );

    const invQty = lines.reduce((s, l) => s + Number(l.quantity), 0);
    const poQty = Number(po?.po_qty ?? 0);
    const alreadyInvoiced = Number(invoicedBefore?.q ?? 0);
    const remainingReceived = Math.max(0, Number(received?.q ?? 0) - alreadyInvoiced);
    const remainingPoQty = Math.max(0, poQty - alreadyInvoiced);
    // Kỳ vọng theo TỶ LỆ số lượng của hóa đơn này (đúng cho hóa đơn từng phần).
    const proratedTotal = poQty > 0 ? (invQty / poQty) * Number(po?.grand_total ?? 0) : Number(po?.grand_total ?? 0);
    const proratedVat = poQty > 0 ? (invQty / poQty) * Number(po?.vat_total ?? 0) : Number(po?.vat_total ?? 0);

    const result = evaluateMatch({
      invoiceSupplierId: supplierInput ?? poSupplierId, // supplier thật của hóa đơn
      poSupplierId,
      invoiceQty: invQty,
      poQty: remainingPoQty,
      receivedQty: remainingReceived,
      invoiceUnitPrice: invQty ? invSub / invQty : 0,
      poUnitPrice: poQty ? Number(po?.po_sub ?? 0) / poQty : 0,
      invoiceTotal: invTotal,
      expectedTotal: proratedTotal,
      lines: matchLines,
      invoiceVat: invVat,
      expectedVat: proratedVat,
    });
    overall = result.overall;
    checks = result.checks;
    matchStatus = { MATCHED: "Matched", WARNING: "Warning", FAILED: "Failed" }[result.overall]!;
  }

  const storedSupplier = supplierInput ?? poSupplierId;

  // Ghi hóa đơn + dòng + kết quả đối chiếu trong MỘT transaction (nguyên tử).
  const invId = await withTransaction(async (exec) => {
    const inv = await firstRow<{ id: number }>(
      exec,
      `INSERT INTO invoices
         (invoice_number, invoice_date, supplier_id, po_id, total_amount, vat_amount, file_attachment, status, match_result, created_by)
       VALUES ($1, COALESCE($2::date, current_date), $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [invoice_number, invoice_date, storedSupplier, po_id, invTotal, invVat, file_attachment, matchStatus, overall, user.id]
    );
    for (const line of lines) {
      await exec(
        `INSERT INTO invoice_items (invoice_id, item_code, description, quantity, unit_price, amount)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [inv!.id, line.item_code || null, line.description || null, line.quantity, line.unit_price, Number(line.quantity) * Number(line.unit_price)]
      );
    }
    for (const c of checks) {
      await exec(
        `INSERT INTO invoice_matching (invoice_id, check_name, result, reason) VALUES ($1,$2,$3,$4)`,
        [inv!.id, c.check_name, c.result, c.reason]
      );
    }
    await logAudit(
      { actorId: user.id, actorName: user.name, documentType: "Invoice", documentId: inv!.id, action: "Create", newValue: `${invoice_number} · ${overall ?? "Pending"}` },
      exec
    );
    return inv!.id;
  });

  revalidatePath("/invoices");
  redirect(`/invoices/${invId}`);
}

/** Thêm MỘT đợt thanh toán cho hóa đơn (1 hóa đơn trả được nhiều đợt). */
export async function addPaymentAction(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "invoice.manage")) throw new Error("FORBIDDEN");

  const invoiceId = Number(formData.get("invoice_id"));
  const amount = Number(formData.get("amount") ?? 0);
  const payment_date = String(formData.get("payment_date") ?? "") || null;
  const method = String(formData.get("method") ?? "Chuyển khoản");
  const reference = String(formData.get("reference") ?? "") || null;
  if (!invoiceId) throw new Error("Thiếu hóa đơn.");
  if (!(amount > 0)) throw new Error("Số tiền thanh toán phải lớn hơn 0.");

  const inv = await queryOne<{ total_amount: string; status: string }>(
    `SELECT total_amount, status FROM invoices WHERE id = $1`,
    [invoiceId]
  );
  if (!inv) throw new Error("Không tìm thấy hóa đơn.");
  if (inv.status === "Paid") throw new Error("Hóa đơn đã thanh toán đủ.");

  const paid = await queryOne<{ s: string }>(`SELECT COALESCE(sum(amount),0) s FROM payments WHERE invoice_id = $1`, [invoiceId]);
  const total = Number(inv.total_amount);
  const already = Number(paid?.s ?? 0);
  const remaining = total - already;
  if (amount > remaining + 0.5) throw new Error(`Vượt số còn phải trả (${Math.round(remaining).toLocaleString("vi-VN")} ₫).`);

  await withTransaction(async (exec) => {
    await exec(
      `INSERT INTO payments (invoice_id, payment_date, amount, method, reference, created_by)
       VALUES ($1, COALESCE($2::date, current_date), $3, $4, $5, $6)`,
      [invoiceId, payment_date, amount, method, reference, user.id]
    );
    // Trả đủ → đánh dấu Paid.
    if (already + amount >= total - 0.5) {
      await exec(`UPDATE invoices SET status='Paid' WHERE id=$1`, [invoiceId]);
    }
    await logAudit(
      { actorId: user.id, actorName: user.name, documentType: "Invoice", documentId: invoiceId, action: "Payment", field: method, newValue: Math.round(amount).toLocaleString("vi-VN") },
      exec
    );
  });

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
}

/** Trả HẾT phần còn lại trong 1 lần (ghi 1 đợt payment cho số dư rồi đánh dấu Paid). */
export async function markInvoicePaidAction(invoiceId: number) {
  const user = await requireUser();
  if (!can(user.role, "invoice.manage")) throw new Error("FORBIDDEN");
  const inv = await queryOne<{ total_amount: string; status: string }>(`SELECT total_amount, status FROM invoices WHERE id=$1`, [invoiceId]);
  if (!inv || inv.status === "Paid") return;
  const paid = await queryOne<{ s: string }>(`SELECT COALESCE(sum(amount),0) s FROM payments WHERE invoice_id=$1`, [invoiceId]);
  const remaining = Number(inv.total_amount) - Number(paid?.s ?? 0);
  await withTransaction(async (exec) => {
    if (remaining > 0.5) {
      await exec(
        `INSERT INTO payments (invoice_id, amount, method, reference, created_by) VALUES ($1,$2,'Khác','Thanh toán toàn bộ',$3)`,
        [invoiceId, remaining, user.id]
      );
    }
    await exec(`UPDATE invoices SET status='Paid' WHERE id=$1`, [invoiceId]);
    await logAudit({ actorId: user.id, actorName: user.name, documentType: "Invoice", documentId: invoiceId, action: "Pay", newValue: Math.round(remaining).toLocaleString("vi-VN") }, exec);
  });
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
}
