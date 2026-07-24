"use server";
import { revalidatePath } from "next/cache";
import { withTransaction, firstRow, query, type Executor } from "@/lib/db";
import { pushLocalRealUsers } from "@/lib/accounts";
import { requireUser, can } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { parseSection, type Section } from "@/lib/import-section";

export interface SectionImportResult {
  ok: boolean;
  error?: string;
  section?: Section;
  sheetName?: string;
  headerRow?: number;
  added?: number;
  updated?: number;
  skipped?: number;
  removed?: number;       // chế độ đồng bộ: số mục KHÔNG có trong file bị XÓA
  deactivated?: number;   // chế độ đồng bộ: số mục không xóa được (đã có chứng từ) → chuyển Ngưng
  total?: number;
  warnings?: string[];
}

const PERM: Record<Section, string> = {
  suppliers: "supplier.manage",
  products: "product.manage",
  users: "user.manage",
};

const HEADER_ERR: Record<Section, string> = {
  suppliers: "Không tìm thấy dòng tiêu đề có cột Mã & Tên nhà cung cấp. Kiểm tra file có cột 'Mã nhà cung cấp' và 'Tên nhà cung cấp'.",
  products: "Không tìm thấy dòng tiêu đề có cột Mã & Tên. Kiểm tra file có cột 'Mã' và 'Tên'.",
  users: "Không tìm thấy dòng tiêu đề có cột Email & Tên. Kiểm tra file có cột 'Email' và 'Họ tên'.",
};

/**
 * Nhập 1 danh mục (Nhà cung cấp / Hàng hóa / Người dùng) từ file Excel rời.
 * Trùng mã/email → CẬP NHẬT (không xóa dữ liệu cũ). Gọi từ client: importSectionAction("suppliers", fd).
 */
export async function importSectionAction(section: Section, formData: FormData): Promise<SectionImportResult> {
  const user = await requireUser();
  if (!can(user.role, PERM[section])) {
    return { ok: false, error: "Bạn không có quyền nhập dữ liệu mục này (cần vai trò phù hợp / Quản trị)." };
  }

  // sync=1: ĐỒNG BỘ ĐẦY ĐỦ — mục KHÔNG có trong file sẽ bị xóa (hoặc chuyển Ngưng
  // nếu đã có chứng từ). Chỉ áp cho suppliers/products.
  const sync = formData.get("sync") === "1" && section !== "users";

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Chưa chọn file Excel." };
  if (!/\.xlsx$/i.test(file.name)) return { ok: false, error: "Chỉ hỗ trợ file .xlsx." };

  let parsed;
  try {
    parsed = await parseSection(section, await file.arrayBuffer());
  } catch {
    return { ok: false, error: "Không đọc được file. File có thể hỏng hoặc không đúng định dạng .xlsx." };
  }

  if (parsed.headerRow < 0) return { ok: false, error: HEADER_ERR[section] };

  const rows =
    section === "suppliers" ? parsed.suppliers! : section === "products" ? parsed.products! : parsed.users!;
  if (rows.length === 0) {
    return { ok: false, error: "Không có dòng dữ liệu hợp lệ nào (đọc được tiêu đề nhưng không có dữ liệu).", sheetName: parsed.sheetName, warnings: parsed.warnings };
  }

  const warnings = [...parsed.warnings];
  let added = 0, updated = 0;
  try {
    await withTransaction(async (exec: Executor) => {
      if (section === "suppliers") {
        for (const s of parsed.suppliers!) {
          const row = await firstRow<{ inserted: boolean }>(exec,
            `INSERT INTO suppliers (supplier_code, supplier_name, tax_code, address, contact_name, phone, email, bank_account, payment_term, currency, debt, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             ON CONFLICT (supplier_code) DO UPDATE SET
               supplier_name=EXCLUDED.supplier_name, tax_code=EXCLUDED.tax_code, address=EXCLUDED.address,
               contact_name=EXCLUDED.contact_name, phone=EXCLUDED.phone, email=EXCLUDED.email,
               bank_account=EXCLUDED.bank_account, debt=EXCLUDED.debt, status=EXCLUDED.status
             RETURNING (xmax = 0) AS inserted`,
            [s.supplier_code, s.supplier_name, s.tax_code, s.address, s.contact_name, s.phone, s.email, s.bank_account, s.payment_term, s.currency, s.debt, s.status]);
          if (row?.inserted) added++; else updated++;
        }
      } else if (section === "products") {
        // Bản đồ khớp NCC: theo MÃ trước, rồi TÊN (không phân biệt hoa/thường).
        const byCode = new Map<string, number>();
        const byName = new Map<string, number>();
        for (const sup of await exec<{ id: number; supplier_code: string; supplier_name: string }>(`SELECT id, supplier_code, supplier_name FROM suppliers`)) {
          byCode.set(sup.supplier_code.trim().toLowerCase(), sup.id);
          byName.set(sup.supplier_name.trim().toLowerCase(), sup.id);
        }
        for (const p of parsed.products!) {
          // Khớp NCC mặc định; nếu cột trống → null (không ghi đè binding cũ nhờ COALESCE).
          let supId: number | null = null;
          if (p.default_supplier_code) {
            const k = p.default_supplier_code.trim().toLowerCase();
            supId = byCode.get(k) ?? byName.get(k) ?? null;
            if (!supId) warnings.push(`Hàng "${p.item_code}": không thấy NCC "${p.default_supplier_code}" → bỏ qua gán NCC mặc định.`);
          }
          const row = await firstRow<{ inserted: boolean }>(exec,
            `INSERT INTO products (item_code, item_name, category, unit, vat_rate, accounting_code, status, default_supplier)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (item_code) DO UPDATE SET
               item_name=EXCLUDED.item_name, category=EXCLUDED.category, unit=EXCLUDED.unit,
               vat_rate=EXCLUDED.vat_rate, accounting_code=EXCLUDED.accounting_code, status=EXCLUDED.status,
               default_supplier=COALESCE(EXCLUDED.default_supplier, products.default_supplier)
             RETURNING (xmax = 0) AS inserted`,
            [p.item_code, p.item_name, p.category, p.unit, p.vat_rate, p.accounting_code, p.status, supId]);
          if (row?.inserted) added++; else updated++;
        }
      } else {
        // users — map company_code → id; giữ nguyên mật khẩu khi cập nhật.
        const companyMap = new Map<string, number>();
        for (const c of await exec<{ id: number; company_code: string }>(`SELECT id, company_code FROM companies`))
          companyMap.set(c.company_code, c.id);
        for (const u of parsed.users!) {
          let cid: number | null = null;
          if (u.company_code) {
            cid = companyMap.get(u.company_code) ?? null;
            if (!cid) warnings.push(`Người dùng "${u.email}": không thấy công ty "${u.company_code}" → để trống công ty.`);
          }
          const row = await firstRow<{ inserted: boolean }>(exec,
            `INSERT INTO users (name, email, password, department, role, company_id, status)
             VALUES ($1,$2,'password',$3,$4,$5,$6)
             ON CONFLICT (email) DO UPDATE SET
               name=EXCLUDED.name, department=EXCLUDED.department, role=EXCLUDED.role,
               company_id=EXCLUDED.company_id, status=EXCLUDED.status
             RETURNING (xmax = 0) AS inserted`,
            [u.name, u.email, u.department, u.role, cid, u.status]);
          if (row?.inserted) added++; else updated++;
        }
      }

      await logAudit(
        { actorId: user.id, actorName: user.name, documentType: "Import", action: `ImportExcel:${section}`, field: file.name, newValue: `+${added} mới / ${updated} cập nhật` },
        exec
      );
    });
  } catch (e) {
    return { ok: false, error: "Lỗi khi ghi dữ liệu: " + (e instanceof Error ? e.message : String(e)) };
  }

  // ĐỒNG BỘ ĐẦY ĐỦ: xóa mục KHÔNG có trong file (vướng chứng từ → chuyển Ngưng).
  let removed = 0, deactivated = 0;
  if (sync) {
    try {
      if (section === "suppliers") {
        const fileCodes = new Set(parsed.suppliers!.map((s) => s.supplier_code.toLowerCase()));
        const existing = await query<{ id: number; supplier_code: string }>(`SELECT id, supplier_code FROM suppliers`);
        for (const e of existing) {
          if (fileCodes.has(e.supplier_code.toLowerCase())) continue;
          try { await query(`DELETE FROM suppliers WHERE id=$1`, [e.id]); removed++; }
          catch { await query(`UPDATE suppliers SET status='Inactive' WHERE id=$1`, [e.id]); deactivated++; }
        }
      } else if (section === "products") {
        const fileCodes = new Set(parsed.products!.map((p) => p.item_code.toLowerCase()));
        const existing = await query<{ id: number; item_code: string }>(`SELECT id, item_code FROM products`);
        for (const e of existing) {
          if (fileCodes.has(e.item_code.toLowerCase())) continue;
          try { await query(`DELETE FROM products WHERE id=$1`, [e.id]); removed++; }
          catch { await query(`UPDATE products SET status='Inactive' WHERE id=$1`, [e.id]); deactivated++; }
        }
      }
      if (removed || deactivated) {
        await logAudit({ actorId: user.id, actorName: user.name, documentType: "Import", action: `SyncExcel:${section}`, field: file.name, newValue: `-${removed} xóa / ${deactivated} ngưng` });
      }
    } catch (e) {
      warnings.push("Đồng bộ xóa mục thừa gặp lỗi (đã bỏ qua): " + (e instanceof Error ? e.message : String(e)));
    }
  }

  // Nhập người dùng: đẩy tài khoản THẬT vừa nhập lên Supabase (accounts-only).
  if (section === "users") {
    try { await pushLocalRealUsers((sql, params) => query(sql, params)); }
    catch (e) { console.error("[accounts] đẩy user lên Supabase sau import thất bại (bỏ qua):", e); }
  }

  revalidatePath(section === "suppliers" ? "/suppliers" : section === "products" ? "/products" : "/settings");
  revalidatePath("/dashboard");

  return {
    ok: true, section, sheetName: parsed.sheetName, headerRow: parsed.headerRow,
    added, updated, skipped: 0, removed, deactivated, total: rows.length, warnings,
  };
}
