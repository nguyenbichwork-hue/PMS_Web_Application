"use server";
import { revalidatePath } from "next/cache";
import { withTransaction, firstRow, type Executor } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { parseWorkbook } from "@/lib/import-excel";

export interface EntityResult { added: number; updated: number; skipped: number }
export interface ImportResult {
  ok: boolean;
  error?: string;
  companies?: EntityResult;
  business_units?: EntityResult;
  users?: EntityResult;
  suppliers?: EntityResult;
  products?: EntityResult;
  rules?: EntityResult;
  sheetsFound?: string[];
  warnings?: string[];
}

const blank = (): EntityResult => ({ added: 0, updated: 0, skipped: 0 });

// Upsert 1 dòng; dùng (xmax = 0) để biết là THÊM mới hay CẬP NHẬT.
async function upsert(exec: Executor, sql: string, params: unknown[], res: EntityResult) {
  const row = await firstRow<{ inserted: boolean }>(exec, sql, params);
  if (row?.inserted) res.added++;
  else res.updated++;
}

export async function importExcelAction(formData: FormData): Promise<ImportResult> {
  const user = await requireUser();
  if (!can(user.role, "user.manage") && !can(user.role, "settings.manage")) {
    return { ok: false, error: "Bạn không có quyền nhập dữ liệu (chỉ Quản trị)." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Chưa chọn file Excel." };
  }
  if (!/\.xlsx$/i.test(file.name)) {
    return { ok: false, error: "Chỉ hỗ trợ file .xlsx (theo mẫu 08_Du_Lieu_Can_Chuan_Bi.xlsx)." };
  }

  let parsed;
  try {
    parsed = await parseWorkbook(await file.arrayBuffer());
  } catch {
    return { ok: false, error: "Không đọc được file. File có thể hỏng hoặc không đúng định dạng .xlsx." };
  }

  const warnings = [...parsed.warnings];
  const r: ImportResult = {
    ok: true,
    companies: blank(), business_units: blank(), users: blank(),
    suppliers: blank(), products: blank(), rules: blank(),
    sheetsFound: parsed.sheetsFound,
    warnings,
  };

  if (parsed.sheetsFound.length === 0) {
    return { ok: false, error: "Không tìm thấy sheet dữ liệu nào (01_Cong_Ty … 06_Han_Muc_Duyet) trong file." };
  }

  try {
    await withTransaction(async (exec) => {
      // 1) Công ty
      for (const c of parsed.companies) {
        await upsert(exec,
          `INSERT INTO companies (company_code, company_name, tax_code, address, status)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (company_code) DO UPDATE SET
             company_name=EXCLUDED.company_name, tax_code=EXCLUDED.tax_code,
             address=EXCLUDED.address, status=EXCLUDED.status
           RETURNING (xmax = 0) AS inserted`,
          [c.company_code, c.company_name, c.tax_code, c.address, c.status], r.companies!);
      }

      // 2) Nhà cung cấp
      for (const s of parsed.suppliers) {
        await upsert(exec,
          `INSERT INTO suppliers (supplier_code, supplier_name, tax_code, address, contact_name, phone, email, bank_account, payment_term, currency, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (supplier_code) DO UPDATE SET
             supplier_name=EXCLUDED.supplier_name, tax_code=EXCLUDED.tax_code, address=EXCLUDED.address,
             contact_name=EXCLUDED.contact_name, phone=EXCLUDED.phone, email=EXCLUDED.email,
             bank_account=EXCLUDED.bank_account, payment_term=EXCLUDED.payment_term,
             currency=EXCLUDED.currency, status=EXCLUDED.status
           RETURNING (xmax = 0) AS inserted`,
          [s.supplier_code, s.supplier_name, s.tax_code, s.address, s.contact_name, s.phone, s.email, s.bank_account, s.payment_term, s.currency, s.status], r.suppliers!);
      }

      // Bản đồ mã → id (sau khi đã upsert công ty & NCC).
      const companyMap = new Map<string, number>();
      for (const row of await exec<{ id: number; company_code: string }>(`SELECT id, company_code FROM companies`))
        companyMap.set(row.company_code, row.id);
      const supplierMap = new Map<string, number>();
      for (const row of await exec<{ id: number; supplier_code: string }>(`SELECT id, supplier_code FROM suppliers`))
        supplierMap.set(row.supplier_code, row.id);

      // 3) Phòng ban (cần company_id)
      for (const b of parsed.business_units) {
        const cid = companyMap.get(b.company_code);
        if (!cid) { r.business_units!.skipped++; warnings.push(`Phòng ban "${b.bu_code}": không tìm thấy công ty "${b.company_code}" → bỏ qua.`); continue; }
        await upsert(exec,
          `INSERT INTO business_units (company_id, bu_code, bu_name)
           VALUES ($1,$2,$3)
           ON CONFLICT (company_id, bu_code) DO UPDATE SET bu_name=EXCLUDED.bu_name
           RETURNING (xmax = 0) AS inserted`,
          [cid, b.bu_code, b.bu_name], r.business_units!);
      }

      // 4) Hàng hóa (cần default_supplier id)
      for (const p of parsed.products) {
        let supId: number | null = null;
        if (p.default_supplier_code) {
          supId = supplierMap.get(p.default_supplier_code) ?? null;
          if (!supId) warnings.push(`Hàng hóa "${p.item_code}": không thấy NCC mặc định "${p.default_supplier_code}" → để trống.`);
        }
        await upsert(exec,
          `INSERT INTO products (item_code, item_name, category, unit, vat_rate, default_supplier, accounting_code, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (item_code) DO UPDATE SET
             item_name=EXCLUDED.item_name, category=EXCLUDED.category, unit=EXCLUDED.unit,
             vat_rate=EXCLUDED.vat_rate, default_supplier=EXCLUDED.default_supplier,
             accounting_code=EXCLUDED.accounting_code, status=EXCLUDED.status
           RETURNING (xmax = 0) AS inserted`,
          [p.item_code, p.item_name, p.category, p.unit, p.vat_rate, supId, p.accounting_code, p.status], r.products!);
      }

      // 5) Người dùng (cần company_id; giữ nguyên mật khẩu khi cập nhật)
      for (const u of parsed.users) {
        let cid: number | null = null;
        if (u.company_code) {
          cid = companyMap.get(u.company_code) ?? null;
          if (!cid) warnings.push(`Người dùng "${u.email}": không thấy công ty "${u.company_code}" → để trống công ty.`);
        }
        await upsert(exec,
          `INSERT INTO users (name, email, department, role, company_id, status)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (email) DO UPDATE SET
             name=EXCLUDED.name, department=EXCLUDED.department, role=EXCLUDED.role,
             company_id=EXCLUDED.company_id, status=EXCLUDED.status
           RETURNING (xmax = 0) AS inserted`,
          [u.name, u.email, u.department, u.role, cid, u.status], r.users!);
      }

      // 6) Hạn mức duyệt (upsert theo amount_min, không xóa dữ liệu cũ)
      for (const rule of parsed.rules) {
        const updated = await firstRow<{ id: number }>(exec,
          `UPDATE approval_rules SET amount_max=$2, levels=$3::jsonb, active=true
            WHERE document_type='PR' AND amount_min=$1 RETURNING id`,
          [rule.amount_min, rule.amount_max, JSON.stringify(rule.levels)]);
        if (updated) { r.rules!.updated++; continue; }
        await exec(
          `INSERT INTO approval_rules (document_type, amount_min, amount_max, levels)
           VALUES ('PR',$1,$2,$3::jsonb)`,
          [rule.amount_min, rule.amount_max, JSON.stringify(rule.levels)]);
        r.rules!.added++;
      }

      const totalAdded = r.companies!.added + r.business_units!.added + r.users!.added + r.suppliers!.added + r.products!.added + r.rules!.added;
      const totalUpd = r.companies!.updated + r.business_units!.updated + r.users!.updated + r.suppliers!.updated + r.products!.updated + r.rules!.updated;
      await logAudit(
        { actorId: user.id, actorName: user.name, documentType: "Import", action: "ImportExcel", field: file.name, newValue: `+${totalAdded} mới / ${totalUpd} cập nhật` },
        exec
      );
    });
  } catch (e) {
    return { ok: false, error: "Lỗi khi ghi dữ liệu: " + (e instanceof Error ? e.message : String(e)) };
  }

  // Làm mới các trang bị ảnh hưởng.
  for (const p of ["/settings", "/suppliers", "/products", "/dashboard"]) revalidatePath(p);
  return r;
}
