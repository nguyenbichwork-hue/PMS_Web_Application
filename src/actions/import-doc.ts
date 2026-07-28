"use server";
import { revalidatePath } from "next/cache";
import { withTransaction, firstRow, type Executor } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { docNumber } from "@/lib/numbering";
import { logAudit } from "@/lib/audit";
import { norm } from "@/lib/import-excel";
import { parseDoc, type DocKind } from "@/lib/import-doc";

export interface DocImportResult {
  ok: boolean;
  error?: string;
  kind?: DocKind;
  sheetName?: string;
  headerRow?: number;
  created?: number;      // số chứng từ tạo được
  lines?: number;        // tổng số dòng hàng đã ghi
  numbers?: string[];    // số PR/PO vừa tạo
  warnings?: string[];
}

const PERM: Record<DocKind, string> = { pr: "pr.create", po: "po.manage" };
const HEADER_ERR: Record<DocKind, string> = {
  pr: "Không tìm thấy dòng tiêu đề có cột Tên hàng & Số lượng. Kiểm tra file có cột 'Tên hàng hóa' và 'Số lượng'.",
  po: "Không tìm thấy dòng tiêu đề có cột Nhà cung cấp, Tên hàng & Số lượng. Kiểm tra file có cột 'Mã nhà cung cấp', 'Tên hàng hóa' và 'Số lượng'.",
};

/**
 * Nhập PR hoặc PO hàng loạt từ Excel. Mỗi chứng từ được tạo ở trạng thái
 * NHÁP (Draft) — người dùng kiểm tra rồi mới gửi duyệt / xử lý tiếp. Gọi từ
 * client: importDocumentAction("pr", fd) hoặc importDocumentAction("po", fd).
 */
export async function importDocumentAction(kind: DocKind, formData: FormData): Promise<DocImportResult> {
  const user = await requireUser();
  if (!can(user.role, PERM[kind])) {
    return { ok: false, error: kind === "pr" ? "Bạn không có quyền tạo Yêu cầu mua hàng." : "Bạn không có quyền tạo Đơn đặt hàng (cần Mua hàng / Quản trị)." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Chưa chọn file Excel." };
  if (!/\.xlsx$/i.test(file.name)) return { ok: false, error: "Chỉ hỗ trợ file .xlsx." };

  let parsed;
  try {
    parsed = await parseDoc(kind, await file.arrayBuffer());
  } catch {
    return { ok: false, error: "Không đọc được file. File có thể hỏng hoặc không đúng định dạng .xlsx." };
  }
  if (parsed.headerRow < 0) return { ok: false, error: HEADER_ERR[kind] };
  if (parsed.docs.length === 0) {
    return { ok: false, error: parsed.warnings[0] ?? "Không có chứng từ hợp lệ nào trong file.", sheetName: parsed.sheetName, warnings: parsed.warnings };
  }

  const warnings = [...parsed.warnings];
  const numbers: string[] = [];
  let created = 0, lines = 0;

  try {
    await withTransaction(async (exec: Executor) => {
      // Bản đồ tra cứu công ty / NCC / hàng hóa (khớp theo mã, tên, MST).
      const companyByCode = new Map<string, number>();
      const companyByName = new Map<string, number>();
      for (const c of await exec<{ id: number; company_code: string; company_name: string }>(`SELECT id, company_code, company_name FROM companies`)) {
        companyByCode.set(norm(c.company_code), c.id);
        companyByName.set(norm(c.company_name), c.id);
      }
      const supByCode = new Map<string, number>();
      const supByName = new Map<string, number>();
      const supByTax = new Map<string, number>();
      for (const s of await exec<{ id: number; supplier_code: string; supplier_name: string; tax_code: string | null }>(`SELECT id, supplier_code, supplier_name, tax_code FROM suppliers`)) {
        supByCode.set(norm(s.supplier_code), s.id);
        supByName.set(norm(s.supplier_name), s.id);
        if (s.tax_code) supByTax.set(norm(s.tax_code), s.id);
      }
      const resolveCompany = (code: string | null): number | null => {
        if (!code) return null;
        const k = norm(code);
        return companyByCode.get(k) ?? companyByName.get(k) ?? null;
      };
      const resolveSupplier = (code: string | null): number | null => {
        if (!code) return null;
        const k = norm(code);
        return supByCode.get(k) ?? supByTax.get(k) ?? supByName.get(k) ?? null;
      };

      let docIdx = 0;
      for (const d of parsed.docs) {
        docIdx++;
        const label = d.key ? `"${d.key}"` : `#${docIdx}`;
        // Công ty: theo file, nếu không khớp thì dùng công ty của người nhập.
        let companyId = resolveCompany(d.company_code);
        if (!companyId) {
          if (d.company_code) warnings.push(`Chứng từ ${label}: không thấy công ty "${d.company_code}" → dùng công ty của bạn.`);
          companyId = user.company_id ?? null;
        }
        if (!companyId) { warnings.push(`Chứng từ ${label}: thiếu công ty và bạn chưa gắn công ty → bỏ qua.`); continue; }

        if (kind === "pr") {
          const total = d.lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
          const vatTotal = d.lines.reduce((s, l) => s + (l.quantity * l.unit_price * l.vat_rate) / 100, 0);
          const pr = await firstRow<{ id: number }>(exec,
            `INSERT INTO purchase_requests
               (request_date, requester_id, department, company_id, purpose, priority, required_date, status, total_amount, vat_total, current_level, created_by)
             VALUES (current_date, $1,$2,$3,$4,$5,$6,'Draft',$7,$8,0,$1) RETURNING id`,
            [user.id, d.department ?? user.department ?? null, companyId, d.purpose ?? null, d.priority ?? "Normal", d.required_date, total, vatTotal]);
          await exec(`UPDATE purchase_requests SET pr_number = $1 WHERE id = $2`, [docNumber("PR", pr!.id), pr!.id]);

          let ln = 1;
          for (const l of d.lines) {
            const supId = resolveSupplier(l.supplier_code);
            if (l.supplier_code && !supId) warnings.push(`Dòng ${l.rowNo}: không thấy NCC gợi ý "${l.supplier_code}" → để trống.`);
            await exec(
              `INSERT INTO purchase_request_items
                 (pr_id, item_code, item_name, description, quantity, unit, estimated_price, vat_rate, supplier_suggestion, note, line_no)
               VALUES ($1,$2,$3,NULL,$4,$5,$6,$7,$8,$9,$10)`,
              [pr!.id, l.item_code, l.name, l.quantity, l.unit, l.unit_price, l.vat_rate, supId, l.note, ln++]);
            lines++;
          }
          numbers.push(docNumber("PR", pr!.id));
          created++;
        } else {
          // PO cần NCC phần đầu.
          const supId = resolveSupplier(d.supplier_code);
          if (!supId) { warnings.push(`Chứng từ ${label}: không thấy nhà cung cấp "${d.supplier_code ?? "(trống)"}" → bỏ qua đơn.`); continue; }

          let subtotal = 0, vatTotal = 0;
          const computed = d.lines.map((l) => {
            const lineNet = l.quantity * l.unit_price - l.discount;
            const lineVat = (lineNet * l.vat_rate) / 100;
            subtotal += lineNet;
            vatTotal += lineVat;
            return { l, amount: lineNet + lineVat };
          });
          const grand = subtotal + vatTotal;
          const po = await firstRow<{ id: number }>(exec,
            `INSERT INTO purchase_orders
               (pr_id, supplier_id, company_id, order_date, payment_term, currency, status, subtotal, vat_total, grand_total)
             VALUES (NULL,$1,$2, COALESCE($3::date, current_date), $4, $5, 'Draft', $6,$7,$8) RETURNING id`,
            [supId, companyId, d.order_date, d.payment_term ?? "NET30", d.currency ?? "VND", subtotal, vatTotal, grand]);
          await exec(`UPDATE purchase_orders SET po_number = $1 WHERE id = $2`, [docNumber("PO", po!.id), po!.id]);

          let ln = 1;
          for (const c of computed) {
            await exec(
              `INSERT INTO purchase_order_items
                 (po_id, item_code, description, quantity, unit, unit_price, discount, vat_rate, amount, line_no)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
              [po!.id, c.l.item_code, c.l.name, c.l.quantity, c.l.unit, c.l.unit_price, c.l.discount, c.l.vat_rate, c.amount, ln++]);
            lines++;
          }
          numbers.push(docNumber("PO", po!.id));
          created++;
        }
      }

      if (created === 0) throw new Error("NO_DOC");
      await logAudit(
        { actorId: user.id, actorName: user.name, documentType: "Import", action: `ImportExcel:${kind}`, field: file.name, newValue: `+${created} chứng từ / ${lines} dòng` },
        exec
      );
    });
  } catch (e) {
    if (e instanceof Error && e.message === "NO_DOC") {
      return { ok: false, error: "Không tạo được chứng từ nào (kiểm tra công ty / nhà cung cấp trong file).", sheetName: parsed.sheetName, warnings };
    }
    return { ok: false, error: "Lỗi khi ghi dữ liệu: " + (e instanceof Error ? e.message : String(e)) };
  }

  revalidatePath(kind === "pr" ? "/purchase-requests" : "/purchase-orders");
  revalidatePath("/dashboard");
  return { ok: true, kind, sheetName: parsed.sheetName, headerRow: parsed.headerRow, created, lines, numbers, warnings };
}
