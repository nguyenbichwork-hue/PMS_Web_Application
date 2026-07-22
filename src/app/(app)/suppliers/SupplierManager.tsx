"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSupplierAction, deleteSupplierAction } from "@/actions/master";
import { Field, inputCls, Button } from "@/components/ui";
import type { Supplier } from "@/lib/types";

export function SupplierManager({ supplier }: { supplier?: Supplier }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const editing = !!supplier;

  const remove = () => {
    if (!supplier) return;
    if (!confirm(`Xóa nhà cung cấp "${supplier.supplier_name}" (${supplier.supplier_code})?`)) return;
    start(async () => {
      const res = await deleteSupplierAction(supplier.id);
      if (!res.ok) { alert(res.error ?? "Không xóa được."); return; }
      setOpen(false);
      if (res.deactivated) alert("NCC đã phát sinh chứng từ (PO/hóa đơn) nên được chuyển sang 'Ngưng' thay vì xóa.");
      router.refresh();
    });
  };

  return (
    <>
      {editing ? (
        <button onClick={() => setOpen(true)} className="text-sm text-brand-600 hover:underline">
          Sửa
        </button>
      ) : (
        <Button onClick={() => setOpen(true)}>+ Thêm NCC</Button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-lg font-semibold">{editing ? "Sửa nhà cung cấp" : "Thêm nhà cung cấp"}</h3>
            <form action={async (fd) => { await saveSupplierAction(fd); setOpen(false); }} className="space-y-3">
              {editing && <input type="hidden" name="id" value={supplier.id} />}
              <div className="grid grid-cols-2 gap-3">
                {!editing && (
                  <Field label="Mã NCC" required>
                    <input name="supplier_code" required className={inputCls} placeholder="SUP-XXX" />
                  </Field>
                )}
                <Field label="Tên NCC" required>
                  <input name="supplier_name" required defaultValue={supplier?.supplier_name} className={inputCls} />
                </Field>
                <Field label="Mã số thuế">
                  <input name="tax_code" defaultValue={supplier?.tax_code ?? ""} className={inputCls} />
                </Field>
                <Field label="Người liên hệ">
                  <input name="contact_name" defaultValue={supplier?.contact_name ?? ""} className={inputCls} />
                </Field>
                <Field label="Điện thoại">
                  <input name="phone" defaultValue={supplier?.phone ?? ""} className={inputCls} />
                </Field>
                <Field label="Email">
                  <input name="email" defaultValue={supplier?.email ?? ""} className={inputCls} />
                </Field>
                <Field label="Số tài khoản">
                  <input name="bank_account" defaultValue={supplier?.bank_account ?? ""} className={inputCls} />
                </Field>
                <Field label="Số tiền nợ (₫)">
                  <input name="debt" type="number" step="any" defaultValue={supplier?.debt ?? 0} className={inputCls} />
                </Field>
                <Field label="Điều khoản TT">
                  <select name="payment_term" defaultValue={supplier?.payment_term ?? "NET30"} className={inputCls}>
                    {["COD", "NET15", "NET30", "NET45", "NET60"].map((t) => <option key={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Tiền tệ">
                  <select name="currency" defaultValue={supplier?.currency ?? "VND"} className={inputCls}>
                    {["VND", "USD", "EUR"].map((c) => <option key={c}>{c}</option>)}
                  </select>
                </Field>
                {editing && (
                  <Field label="Trạng thái">
                    <select name="status" defaultValue={supplier?.status ?? "Active"} className={inputCls}>
                      {["Active", "Inactive"].map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </Field>
                )}
              </div>
              <div className="md:col-span-2">
                <Field label="Địa chỉ">
                  <input name="address" defaultValue={supplier?.address ?? ""} className={inputCls} />
                </Field>
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
