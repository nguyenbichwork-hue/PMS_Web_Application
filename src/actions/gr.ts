"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query, queryOne, withTransaction, firstRow } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { canAccessCompany } from "@/lib/access";
import { docNumber } from "@/lib/numbering";
import { parseGRNWorkbook } from "@/lib/import-grn-excel";
import { logAudit } from "@/lib/audit";

export interface GRNExcelResult {
  ok: boolean;
  error?: string;
  po_id?: number;
  po_number?: string;
  lines?: { po_item_id: number; item_code: string; description: string; received_qty: number }[];
  warnings?: string[];
}

/** Đọc file Excel phiếu nhận hàng → khớp về các dòng của MỘT PO đích, trả về
 *  số lượng nhận theo từng dòng PO để form điền sẵn. KHÔNG ghi DB. */
export async function parseGRNExcelAction(formData: FormData): Promise<GRNExcelResult> {
  const user = await requireUser();
  if (!can(user.role, "gr.manage")) throw new Error("FORBIDDEN");

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Chưa chọn file Excel." };
  if (file.size > 10 * 1024 * 1024) return { ok: false, error: "File quá lớn (>10MB)." };

  let parsed: Awaited<ReturnType<typeof parseGRNWorkbook>>;
  try {
    parsed = await parseGRNWorkbook(await file.arrayBuffer());
  } catch {
    return { ok: false, error: "Không đọc được file Excel (.xlsx)." };
  }
  if (parsed.rows.length === 0)
    return { ok: false, error: parsed.warnings[0] ?? "Không có dòng hợp lệ trong file." };

  // PO đích: ưu tiên PO đang chọn trên form; nếu không, file phải chỉ chứa 1 số PO.
  const selected = formData.get("po_id") ? Number(formData.get("po_id")) : null;
  let po: { id: number; po_number: string; company_id: number | null } | null = null;
  const warnings = [...parsed.warnings];

  if (selected) {
    po = await queryOne(`SELECT id, po_number, company_id FROM purchase_orders WHERE id = $1`, [selected]);
    if (!po) return { ok: false, error: "PO đang chọn không tồn tại." };
  } else {
    if (parsed.poNumbers.length !== 1)
      return { ok: false, error: `File chứa ${parsed.poNumbers.length} số PO khác nhau — hãy chọn 1 PO trên form trước khi import (mỗi file/lần 1 PO).` };
    po = await queryOne(`SELECT id, po_number, company_id FROM purchase_orders WHERE po_number = $1`, [parsed.poNumbers[0]]);
    if (!po) return { ok: false, error: `Không tìm thấy PO "${parsed.poNumbers[0]}" trong hệ thống.` };
  }
  if (!canAccessCompany(user, po.company_id)) throw new Error("FORBIDDEN");

  // Khớp mã hàng file → dòng PO (theo MÃ trước, rồi TÊN; không phân biệt hoa/thường).
  const poItems = await query<{ id: number; item_code: string | null; description: string }>(
    `SELECT id, item_code, description FROM purchase_order_items WHERE po_id = $1`,
    [po.id]
  );
  const key = (s: string | null | undefined) => String(s ?? "").trim().toLowerCase();
  const byCode = new Map<string, { id: number; item_code: string | null; description: string }>();
  const byName = new Map<string, { id: number; item_code: string | null; description: string }>();
  for (const it of poItems) {
    if (it.item_code) byCode.set(key(it.item_code), it);
    byName.set(key(it.description), it);
  }

  const agg = new Map<number, { po_item_id: number; item_code: string; description: string; received_qty: number }>();
  for (const row of parsed.rows) {
    if (key(row.po_number) !== key(po.po_number)) continue; // dòng của PO khác (khi đã chọn PO cụ thể)
    const hit = byCode.get(key(row.item_code)) ?? byName.get(key(row.description));
    if (!hit) { warnings.push(`Dòng ${row.row}: mã "${row.item_code}" không có trên PO ${po.po_number} → bỏ qua.`); continue; }
    const cur = agg.get(hit.id);
    if (cur) cur.received_qty += row.received_qty;
    else agg.set(hit.id, { po_item_id: hit.id, item_code: hit.item_code ?? row.item_code, description: hit.description, received_qty: row.received_qty });
  }

  const lines = [...agg.values()];
  if (lines.length === 0)
    return { ok: false, error: `Không khớp được dòng nào với PO ${po.po_number} — kiểm tra lại Mã hàng.`, warnings };

  return { ok: true, po_id: po.id, po_number: po.po_number, lines, warnings };
}

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
