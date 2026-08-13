"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCustomerAction, deleteCustomerAction } from "@/actions/master";
import { Field, inputCls, Button, Spinner } from "@/components/ui";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import type { Customer } from "@/lib/types";

export function CustomerManager({ customer }: { customer?: Customer }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const editing = !!customer;

  const remove = () => {
    if (!customer) return;
    if (!confirm(`Xóa khách hàng "${customer.customer_name}" (${customer.customer_code})?`)) return;
    start(async () => {
      const res = await deleteCustomerAction(customer.id);
      if (!res.ok) { toast(res.error ?? "Không xóa được.", "error"); return; }
      setOpen(false);
      if (res.deactivated) toast("Khách hàng đã phát sinh chứng từ nên được chuyển sang 'Ngưng' thay vì xóa.", "info");
      router.refresh();
    });
  };

  return (
    <>
      {editing ? (
        <button onClick={() => setOpen(true)} className="text-sm text-brand-600 hover:underline">Sửa</button>
      ) : (
        <Button onClick={() => setOpen(true)}>+ Thêm khách hàng</Button>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Sửa khách hàng" : "Thêm khách hàng"}>
        <form action={async (fd) => { await saveCustomerAction(fd); setOpen(false); }} className="space-y-3">
          {editing && <input type="hidden" name="id" value={customer.id} />}
          <div className="grid grid-cols-2 gap-3">
            {!editing && (
              <Field label="Mã khách hàng" required>
                <input name="customer_code" required className={inputCls} placeholder="KH-XXX" />
              </Field>
            )}
            <Field label="Tên khách hàng" required>
              <input name="customer_name" required defaultValue={customer?.customer_name} className={inputCls} />
            </Field>
            <Field label="Mã số thuế">
              <input name="tax_code" defaultValue={customer?.tax_code ?? ""} className={inputCls} />
            </Field>
            <Field label="Người liên hệ">
              <input name="contact_name" defaultValue={customer?.contact_name ?? ""} className={inputCls} />
            </Field>
            <Field label="Điện thoại">
              <input name="phone" defaultValue={customer?.phone ?? ""} className={inputCls} />
            </Field>
            <Field label="Email">
              <input name="email" defaultValue={customer?.email ?? ""} className={inputCls} />
            </Field>
            {editing && (
              <Field label="Trạng thái">
                <select name="status" defaultValue={customer?.status ?? "Active"} className={inputCls}>
                  {["Active", "Inactive"].map((s) => <option key={s}>{s}</option>)}
                </select>
              </Field>
            )}
          </div>
          <Field label="Địa chỉ">
            <input name="address" defaultValue={customer?.address ?? ""} className={inputCls} />
          </Field>
          <Field label="Ghi chú">
            <input name="note" defaultValue={customer?.note ?? ""} className={inputCls} />
          </Field>
          <div className="flex items-center gap-2 pt-2">
            {editing && (
              <button type="button" onClick={remove} disabled={pending} className="mr-auto inline-flex items-center gap-1.5 text-sm font-semibold text-rose-500 hover:underline disabled:opacity-40">
                {pending && <Spinner className="h-3.5 w-3.5" />}
                Xóa
              </button>
            )}
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Hủy</Button>
            <FormSubmitButton>Lưu</FormSubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}
