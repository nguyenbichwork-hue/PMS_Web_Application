"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query, queryOne, withTransaction, firstRow } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { canAccessCompany } from "@/lib/access";
import { evaluateMatch, buildPoPriceIndex, findPoPrice, type MatchLine } from "@/lib/matching";
import { parseInvoiceXml } from "@/lib/import-invoice-xml";
import { logAudit } from "@/lib/audit";

/** Chặn IDOR trên hóa đơn theo công ty của PO gốc. Hóa đơn KHÔNG gắn PO thì
 *  không có công ty để scope → chỉ dựa trên quyền theo vai trò (đã kiểm trước). */
async function assertInvoiceAccess(
  user: { role: string; company_id: number | null },
  invoiceId: number
): Promise<void> {
  const row = await queryOne<{ company_id: number | null }>(
    `SELECT po.company_id FROM invoices i LEFT JOIN purchase_orders po ON po.id = i.po_id WHERE i.id = $1`,
    [invoiceId]
  );
  if (row && row.company_id != null && !canAccessCompany(user as never, row.company_id))
    throw new Error("FORBIDDEN");
}

interface InvLine {
  item_code?: string;
  description?: string;
  quantity: number;
  unit_price: number;
}

export interface XmlPrefill {
  ok: boolean;
  error?: string;
  invoice_number?: string;
  invoice_series?: string | null;
  invoice_date?: string | null;
  seller_name?: string | null;
  seller_tax_id?: string | null;
  supplier_id?: number | null;
  supplier_name?: string | null;
  vat_amount?: number;
  total_amount?: number;
  lines?: { item_code: string | null; description: string; quantity: number; unit_price: number }[];
  warnings?: string[];
}

/** Đọc XML hóa đơn điện tử (TT78 — MISA/Viettel/VNPT) → dữ liệu điền sẵn form.
 *  Tự khớp nhà cung cấp theo MST (tax_code). KHÔNG ghi DB — chỉ trả về để form
 *  hiển thị; người dùng chọn PO rồi bấm Lưu & Đối chiếu như bình thường. */
export async function parseInvoiceXmlAction(formData: FormData): Promise<XmlPrefill> {
  const user = await requireUser();
  if (!can(user.role, "invoice.manage")) throw new Error("FORBIDDEN");

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Chưa chọn file XML." };
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: "File quá lớn (>5MB) — không giống XML hóa đơn." };

  let parsed: ReturnType<typeof parseInvoiceXml>;
  try {
    parsed = parseInvoiceXml(await file.text());
  } catch {
    return { ok: false, error: "Không đọc được file — đây có phải XML hóa đơn điện tử không?" };
  }
  if (!parsed.invoice_number && parsed.items.length === 0)
    return { ok: false, error: "Không nhận diện được nội dung hóa đơn trong XML." };

  // Khớp NCC theo MST (bỏ khoảng trắng để chịu định dạng "0301 234 567").
  let supplier_id: number | null = null;
  let supplier_name: string | null = null;
  if (parsed.seller_tax_id) {
    const s = await queryOne<{ id: number; supplier_name: string }>(
      `SELECT id, supplier_name FROM suppliers
        WHERE replace(coalesce(tax_code,''),' ','') = replace($1,' ','') AND status = 'Active'
        ORDER BY id LIMIT 1`,
      [parsed.seller_tax_id]
    );
    if (s) { supplier_id = s.id; supplier_name = s.supplier_name; }
  }

  const warnings = [...parsed.warnings];
  if (parsed.seller_tax_id && !supplier_id)
    warnings.push(`Chưa có nhà cung cấp MST ${parsed.seller_tax_id} trong danh mục — hãy chọn tay hoặc thêm NCC.`);

  return {
    ok: true,
    invoice_number: parsed.invoice_number,
    invoice_series: parsed.invoice_series,
    invoice_date: parsed.invoice_date,
    seller_name: parsed.seller_name,
    seller_tax_id: parsed.seller_tax_id,
    supplier_id,
    supplier_name,
    vat_amount: parsed.vat_amount,
    total_amount: parsed.total_amount,
    lines: parsed.items.map((it) => ({
      item_code: it.item_code,
      description: it.description,
      quantity: it.quantity,
      unit_price: it.unit_price,
    })),
    warnings,
  };
}

export async function createInvoiceAction(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "invoice.manage")) throw new Error("FORBIDDEN");

  const invoice_number = String(formData.get("invoice_number") ?? "");
  const invoice_date = String(formData.get("invoice_date") ?? "") || null;
  const po_id = formData.get("po_id") ? Number(formData.get("po_id")) : null;
  const file_attachment = String(formData.get("file_attachment") ?? "") || null;
  // VAT lấy ĐÚNG giá trị người nhập gửi lên (kể cả 0 — hàng không chịu thuế);
  // chỉ tự tính 10% khi thực sự KHÔNG có dữ liệu VAT.
  const vatRaw = formData.get("vat_amount");
  const hasVatInput = vatRaw !== null && String(vatRaw).trim() !== "";
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
  const invVat = hasVatInput ? Number(vatRaw) : Math.round(invSub * 0.1);
  const invTotal = invSub + invVat;

  let matchStatus = "Pending";
  let overall: string | null = null;
  let poSupplierId: number | null = null;
  let checks: { check_name: string; result: string; reason: string }[] = [];

  if (po_id) {
    const po = await queryOne<{ supplier_id: number | null; company_id: number | null; grand_total: string; vat_total: string; po_qty: string; po_sub: string }>(
      `SELECT po.supplier_id, po.company_id, po.grand_total, po.vat_total,
              COALESCE((SELECT sum(quantity) FROM purchase_order_items WHERE po_id = po.id),0) AS po_qty,
              COALESCE((SELECT sum(quantity*unit_price - discount) FROM purchase_order_items WHERE po_id = po.id),0) AS po_sub
         FROM purchase_orders po WHERE po.id = $1`,
      [po_id]
    );
    if (!po) throw new Error("PO not found");
    if (!canAccessCompany(user, po.company_id)) throw new Error("FORBIDDEN"); // chặn IDOR: PO khác công ty
    poSupplierId = po?.supplier_id ?? null;

    // MAP dòng hóa đơn → dòng PO để lấy đơn giá PO đem so (khớp theo MÃ trước,
    // rồi TÊN; khóa được chuẩn hóa nên không giòn — xem matching.ts).
    const poItems = await query<{ item_code: string | null; description: string; unit_price: string }>(
      `SELECT item_code, description, unit_price FROM purchase_order_items WHERE po_id = $1`,
      [po_id]
    );
    const poIndex = buildPoPriceIndex(
      poItems.map((it) => ({ itemCode: it.item_code, description: it.description, unitPrice: Number(it.unit_price) }))
    );
    const matchLines: MatchLine[] = lines.map((l) => ({
      itemCode: l.item_code ?? null,
      description: l.description,
      invoicePrice: Number(l.unit_price),
      poPrice: findPoPrice(poIndex, { itemCode: l.item_code, description: l.description }),
    }));

    const received = await queryOne<{ q: string }>(
      `SELECT COALESCE(sum(gri.received_qty),0) AS q
         FROM goods_receipt_items gri JOIN goods_receipts gr ON gr.id = gri.gr_id
        WHERE gr.po_id = $1`,
      [po_id]
    );
    // Nhiều hóa đơn/PO: trừ số lượng đã được xuất hóa đơn ở các hóa đơn TRƯỚC,
    // để hóa đơn hiện tại chỉ đối chiếu với phần CÒN LẠI (chống xuất hóa đơn vượt).
    // LOẠI hóa đơn 'Failed' (Sai lệch) — hóa đơn hỏng KHÔNG được giữ chỗ số lượng,
    // nếu không một hóa đơn sai lúc chưa nhận hàng sẽ khóa cứng PO (phần còn lại=0).
    const invoicedBefore = await queryOne<{ q: string }>(
      `SELECT COALESCE(sum(ii.quantity),0) AS q
         FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
        WHERE i.po_id = $1 AND i.status <> 'Failed'`,
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

    // Ngưỡng đối chiếu cấu hình được (Cấu hình → Đối chiếu). Mặc định giá/tiền 1%, SL 0%.
    // Bọc try/catch phòng bảng chưa migrate (server chưa restart) → dùng mặc định.
    let ms: { price_tolerance_pct: string; amount_tolerance_pct: string; qty_tolerance_pct: string } | null = null;
    try {
      ms = await queryOne(`SELECT price_tolerance_pct, amount_tolerance_pct, qty_tolerance_pct FROM match_settings WHERE id = 1`);
    } catch { /* bảng match_settings chưa tồn tại → dùng ngưỡng mặc định */ }

    const result = evaluateMatch({
      // Supplier THẬT của hóa đơn — KHÔNG fallback về poSupplierId (nếu để fallback
      // thì thiếu supplier sẽ tự PASS check Supplier). Null → matching trả WARNING.
      invoiceSupplierId: supplierInput,
      poSupplierId,
      priceTolerancePct: ms ? Number(ms.price_tolerance_pct) : 1,
      amountTolerancePct: ms ? Number(ms.amount_tolerance_pct) : 1,
      qtyTolerancePct: ms ? Number(ms.qty_tolerance_pct) : 0,
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

  // Chống TRÙNG hóa đơn (UAT-16): cùng nhà cung cấp + cùng số hóa đơn (không phân
  // biệt hoa/thường) → chặn. Mỗi NCC không được có 2 hóa đơn trùng số.
  if (storedSupplier && invoice_number.trim()) {
    const dup = await queryOne<{ id: number; status: string }>(
      `SELECT id, status FROM invoices WHERE supplier_id = $1 AND lower(invoice_number) = lower($2) LIMIT 1`,
      [storedSupplier, invoice_number.trim()]
    );
    if (dup) throw new Error(`Hóa đơn số "${invoice_number}" của nhà cung cấp này đã tồn tại (không nhập trùng).`);
  }

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

/** Tổng tiền đã được điều chỉnh giảm (credit note) của 1 hóa đơn. Bọc try/catch
 *  phòng bảng credit_notes chưa migrate. */
async function creditedOf(invoiceId: number): Promise<number> {
  try {
    const r = await queryOne<{ s: string }>(`SELECT COALESCE(sum(amount),0) s FROM credit_notes WHERE invoice_id=$1`, [invoiceId]);
    return Number(r?.s ?? 0);
  } catch { return 0; }
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
  await assertInvoiceAccess(user, invoiceId);

  const inv = await queryOne<{ total_amount: string; status: string }>(
    `SELECT total_amount, status FROM invoices WHERE id = $1`,
    [invoiceId]
  );
  if (!inv) throw new Error("Không tìm thấy hóa đơn.");
  if (inv.status === "Paid") throw new Error("Hóa đơn đã thanh toán đủ.");

  const paid = await queryOne<{ s: string }>(`SELECT COALESCE(sum(amount),0) s FROM payments WHERE invoice_id = $1`, [invoiceId]);
  const total = Number(inv.total_amount);
  const already = Number(paid?.s ?? 0);
  const credited = await creditedOf(invoiceId); // trừ credit note khỏi nghĩa vụ
  const remaining = total - already - credited;
  if (amount > remaining + 0.5) throw new Error(`Vượt số còn phải trả (${Math.round(remaining).toLocaleString("vi-VN")} ₫).`);

  await withTransaction(async (exec) => {
    await exec(
      `INSERT INTO payments (invoice_id, payment_date, amount, method, reference, created_by)
       VALUES ($1, COALESCE($2::date, current_date), $3, $4, $5, $6)`,
      [invoiceId, payment_date, amount, method, reference, user.id]
    );
    // Trả đủ (đã trả + credit note ≥ tổng) → đánh dấu Paid.
    if (already + credited + amount >= total - 0.5) {
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
  await assertInvoiceAccess(user, invoiceId);
  const inv = await queryOne<{ total_amount: string; status: string }>(`SELECT total_amount, status FROM invoices WHERE id=$1`, [invoiceId]);
  if (!inv || inv.status === "Paid") return;
  const paid = await queryOne<{ s: string }>(`SELECT COALESCE(sum(amount),0) s FROM payments WHERE invoice_id=$1`, [invoiceId]);
  const credited = await creditedOf(invoiceId);
  const remaining = Number(inv.total_amount) - Number(paid?.s ?? 0) - credited;
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

/** Thêm CREDIT NOTE (§14) — điều chỉnh GIẢM nghĩa vụ của hóa đơn (vd trả hàng/giảm
 *  giá sau hóa đơn). Không vượt số còn phải trả. Trả đủ bằng credit → 'Credited'. */
export async function addCreditNoteAction(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "invoice.manage")) throw new Error("FORBIDDEN");
  const invoiceId = Number(formData.get("invoice_id"));
  const amount = Number(formData.get("amount") ?? 0);
  const reason = String(formData.get("reason") ?? "").trim() || null;
  if (!invoiceId) throw new Error("Thiếu hóa đơn.");
  if (!(amount > 0)) throw new Error("Số tiền điều chỉnh phải lớn hơn 0.");
  await assertInvoiceAccess(user, invoiceId);

  const inv = await queryOne<{ total_amount: string; status: string }>(`SELECT total_amount, status FROM invoices WHERE id=$1`, [invoiceId]);
  if (!inv) throw new Error("Không tìm thấy hóa đơn.");
  const total = Number(inv.total_amount);
  const paid = Number((await queryOne<{ s: string }>(`SELECT COALESCE(sum(amount),0) s FROM payments WHERE invoice_id=$1`, [invoiceId]))?.s ?? 0);
  const credited = await creditedOf(invoiceId);
  const open = total - paid - credited;
  if (amount > open + 0.5) throw new Error(`Vượt số còn lại của hóa đơn (${Math.round(open).toLocaleString("vi-VN")} ₫).`);

  await withTransaction(async (exec) => {
    await exec(`INSERT INTO credit_notes (invoice_id, amount, reason, created_by) VALUES ($1,$2,$3,$4)`, [invoiceId, amount, reason, user.id]);
    // Nếu nghĩa vụ đã hết (trả + credit ≥ tổng) → Paid nếu có trả, ngược lại Credited.
    if (paid + credited + amount >= total - 0.5) {
      await exec(`UPDATE invoices SET status=$2 WHERE id=$1`, [invoiceId, paid > 0 ? "Paid" : "Credited"]);
    }
    await logAudit(
      { actorId: user.id, actorName: user.name, documentType: "Invoice", documentId: invoiceId, action: "CreditNote", newValue: Math.round(amount).toLocaleString("vi-VN") + (reason ? ` · ${reason}` : "") },
      exec
    );
  });
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
}
