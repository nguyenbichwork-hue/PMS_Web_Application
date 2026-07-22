"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveProductAction, deleteProductAction } from "@/actions/master";
import { Field, inputCls, Button } from "@/components/ui";
import type { Product, Supplier } from "@/lib/types";

export function ProductManager({ product, suppliers }: { product?: Product; suppliers: Supplier[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const editing = !!product;

  const remove = () => {
    if (!product) return;
    if (!confirm(`Xóa hàng hóa "${product.item_name}" (${product.item_code})?`)) return;
    start(async () => {
      const res = await deleteProductAction(product.id);
      if (!res.ok) { alert(res.error ?? "Không xóa được."); return; }
      setOpen(false);
      if (res.deactivated) alert("Hàng hóa đã phát sinh chứng từ nên được chuyển sang 'Ngưng' thay vì xóa.");
      router.refresh();
    });
  };

  return (
    <>
      {editing ? (
        <button onClick={() => setOpen(true)} className="text-sm text-brand-600 hover:underline">Sửa</button>
      ) : (
        <Button onClick={() => setOpen(true)}>+ Thêm sản phẩm</Button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-semibold">{editing ? "Sửa sản phẩm" : "Thêm sản phẩm"}</h3>
            <form action={async (fd) => { await saveProductAction(fd); setOpen(false); }} className="space-y-3">
              {editing && <input type="hidden" name="id" value={product.id} />}
              <div className="grid grid-cols-2 gap-3">
                {!editing && (
                  <Field label="Mã hàng" required>
                    <input name="item_code" required className={inputCls} placeholder="ITEM-XXX" />
                  </Field>
                )}
                <Field label="Tên hàng" required>
                  <input name="item_name" required defaultValue={product?.item_name} className={inputCls} />
                </Field>
                <Field label="Nhóm">
                  <input name="category" defaultValue={product?.category ?? ""} className={inputCls} />
                </Field>
                <Field label="ĐVT">
                  <input name="unit" defaultValue={product?.unit ?? "PCS"} className={inputCls} />
                </Field>
                <Field label="VAT %">
                  <input name="vat_rate" type="number" defaultValue={Number(product?.vat_rate ?? 10)} className={inputCls} />
                </Field>
                <Field label="NCC mặc định">
                  <select name="default_supplier" defaultValue={product?.default_supplier ?? ""} className={inputCls}>
                    <option value="">—</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}
                  </select>
                </Field>
                <Field label="Mã kế toán">
                  <input name="accounting_code" defaultValue={product?.accounting_code ?? ""} className={inputCls} />
                </Field>
                {editing && (
                  <Field label="Trạng thái">
                    <select name="status" defaultValue={product?.status ?? "Active"} className={inputCls}>
                      {["Active", "Inactive"].map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </Field>
                )}
              </div>
              <div className="flex items-center gap-2 pt-2">
                {editing && (
                  <button type="button" onClick={remove} disabled={pending} className="mr-auto text-sm font-semibold text-rose-500 hover:underline disabled:opacity-40">
                    Xóa
                  </button>
                )}
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Hủy</Button>
                <Button type="submit">Lưu</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
