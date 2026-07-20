"use server";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";

export async function saveSupplierAction(formData: FormData) {
  const user = await requireUser();
  if (!can(user.role, "supplier.manage")) throw new Error("FORBIDDEN");
  const id = formData.get("id") ? Number(formData.get("id")) : null;
  const f = (k: string) => String(formData.get(k) ?? "") || null;

  if (id) {
    await query(
      `UPDATE suppliers SET supplier_name=$1, tax_code=$2, address=$3, contact_name=$4,
              phone=$5, email=$6, bank_account=$7, payment_term=$8, currency=$9, status=$10
       WHERE id=$11`,
      [f("supplier_name"), f("tax_code"), f("address"), f("contact_name"), f("phone"), f("email"),
       f("bank_account"), f("payment_term"), f("currency") ?? "VND", f("status") ?? "Active", id]
    );
  } else {
    await query(
      `INSERT INTO suppliers (supplier_code, supplier_name, tax_code, address, contact_name, phone, email, bank_account, payment_term, currency)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [f("supplier_code"), f("supplier_name"), f("tax_code"), f("address"), f("contact_name"),
       f("phone"), f("email"), f("bank_account"), f("payment_term") ?? "NET30", f("currency") ?? "VND"]
    );
  }
  revalidatePath("/suppliers");
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
