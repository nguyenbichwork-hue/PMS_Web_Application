"use server";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";

export async function saveSupplierAction(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "supplier.manage")) throw new Error("FORBIDDEN");
  const id = formData.get("id") ? Number(formData.get("id")) : null;
  const f = (k: string) => String(formData.get(k) ?? "") || null;

  const debt = Number(formData.get("debt") ?? 0) || 0;
  if (id) {
    await query(
      `UPDATE suppliers SET supplier_name=$1, tax_code=$2, address=$3, contact_name=$4,
              phone=$5, email=$6, bank_account=$7, payment_term=$8, currency=$9, debt=$10, status=$11
       WHERE id=$12`,
      [f("supplier_name"), f("tax_code"), f("address"), f("contact_name"), f("phone"), f("email"),
       f("bank_account"), f("payment_term"), f("currency") ?? "VND", debt, f("status") ?? "Active", id]
    );
  } else {
    await query(
      `INSERT INTO suppliers (supplier_code, supplier_name, tax_code, address, contact_name, phone, email, bank_account, payment_term, currency, debt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [f("supplier_code"), f("supplier_name"), f("tax_code"), f("address"), f("contact_name"),
       f("phone"), f("email"), f("bank_account"), f("payment_term") ?? "NET30", f("currency") ?? "VND", debt]
    );
  }
  revalidatePath("/suppliers");
}

export interface DeleteResult { ok: boolean; error?: string; deactivated?: boolean }

/** Xóa NCC. Nếu đã có chứng từ tham chiếu (PO/hóa đơn) → không xóa cứng được,
 *  tự chuyển sang 'Ngưng' để không vỡ dữ liệu. */
export async function deleteSupplierAction(id: number): Promise<DeleteResult> {
  const user = await requireUser();
  if (!can(user.role, "supplier.manage")) return { ok: false, error: "Bạn không có quyền xóa nhà cung cấp." };
  try {
    await query(`DELETE FROM suppliers WHERE id=$1`, [id]);
    revalidatePath("/suppliers"); revalidatePath("/products");
    return { ok: true };
  } catch {
    await query(`UPDATE suppliers SET status='Inactive' WHERE id=$1`, [id]);
    revalidatePath("/suppliers");
    return { ok: true, deactivated: true };
  }
}

/** Xóa hàng hóa (không bảng nào tham chiếu khóa ngoại → xóa cứng được). */
export async function deleteProductAction(id: number): Promise<DeleteResult> {
  const user = await requireUser();
  if (!can(user.role, "product.manage")) return { ok: false, error: "Bạn không có quyền xóa hàng hóa." };
  try {
    await query(`DELETE FROM products WHERE id=$1`, [id]);
    revalidatePath("/products");
    return { ok: true };
  } catch {
    await query(`UPDATE products SET status='Inactive' WHERE id=$1`, [id]);
    revalidatePath("/products");
    return { ok: true, deactivated: true };
  }
}

export async function saveProductAction(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "product.manage")) throw new Error("FORBIDDEN");
  const id = formData.get("id") ? Number(formData.get("id")) : null;
  const f = (k: string) => String(formData.get(k) ?? "") || null;
  const supplier = formData.get("default_supplier") ? Number(formData.get("default_supplier")) : null;
  const vat = Number(formData.get("vat_rate") ?? 10);

  if (id) {
    await query(
      `UPDATE products SET item_name=$1, category=$2, unit=$3, vat_rate=$4, default_supplier=$5, accounting_code=$6, status=$7 WHERE id=$8`,
      [f("item_name"), f("category"), f("unit") ?? "PCS", vat, supplier, f("accounting_code"), f("status") ?? "Active", id]
    );
  } else {
    await query(
      `INSERT INTO products (item_code, item_name, category, unit, vat_rate, default_supplier, accounting_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [f("item_code"), f("item_name"), f("category"), f("unit") ?? "PCS", vat, supplier, f("accounting_code")]
    );
  }
  revalidatePath("/products");
}

// ---------------- Công ty (pháp nhân) ----------------
// Thêm/sửa pháp nhân. Cần cho việc nhập dữ liệu THẬT: form PR bắt buộc chọn
// Công ty nhưng trước đây không có UI tạo/sửa (chỉ sinh từ seed demo).
export async function saveCompanyAction(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "settings.manage")) throw new Error("FORBIDDEN");
  const id = formData.get("id") ? Number(formData.get("id")) : null;
  const f = (k: string) => String(formData.get(k) ?? "") || null;

  if (id) {
    await query(
      `UPDATE companies SET company_name=$1, tax_code=$2, address=$3, status=$4 WHERE id=$5`,
      [f("company_name"), f("tax_code"), f("address"), f("status") ?? "Active", id]
    );
  } else {
    await query(
      `INSERT INTO companies (company_code, company_name, tax_code, address, status)
       VALUES ($1,$2,$3,$4,$5)`,
      [f("company_code"), f("company_name"), f("tax_code"), f("address"), f("status") ?? "Active"]
    );
  }
  revalidatePath("/settings");
  revalidatePath("/purchase-requests/new");
}

/** Xóa pháp nhân. Nếu đã có chứng từ tham chiếu (PR/user…) → chuyển 'Ngưng'. */
export async function deleteCompanyAction(id: number): Promise<DeleteResult> {
  const user = await requireUser();
  if (!can(user.role, "settings.manage")) return { ok: false, error: "Bạn không có quyền xóa pháp nhân." };
  try {
    await query(`DELETE FROM companies WHERE id=$1`, [id]);
    revalidatePath("/settings");
    return { ok: true };
  } catch {
    await query(`UPDATE companies SET status='Inactive' WHERE id=$1`, [id]);
    revalidatePath("/settings");
    return { ok: true, deactivated: true };
  }
}
