"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveBUAction, deleteBUAction } from "@/actions/master";
import { Field, inputCls, Button, Spinner } from "@/components/ui";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { Modal } from "@/components/Modal";

export interface BURow { id: number; company_id: number | null; bu_code: string; bu_name: string; company_name: string | null }
interface CompanyOpt { id: number; company_name: string }

export function BUManager({ bu, companies }: { bu?: BURow; companies: CompanyOpt[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const editing = !!bu;

  const remove = () => {
    if (!bu) return;
    if (!confirm(`Xóa BU "${bu.bu_name}" (${bu.bu_code})?`)) return;
    start(async () => {
      const res = await deleteBUAction(bu.id);
      if (!res.ok) { alert(res.error ?? "Không xóa được."); return; }
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      {editing ? (
        <button onClick={() => setOpen(true)} className="text-sm text-brand-600 hover:underline">Sửa</button>
      ) : (
        <Button onClick={() => setOpen(true)}>+ Thêm BU</Button>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Sửa BU" : "Thêm BU"}>
        <form action={async (fd) => { await saveBUAction(fd); setOpen(false); router.refresh(); }} className="space-y-3">
          {editing && <input type="hidden" name="id" value={bu.id} />}
          <div className="grid grid-cols-2 gap-3">
            {!editing && (
              <Field label="Mã BU" required>
                <input name="bu_code" required className={inputCls} placeholder="VD: KOL" />
              </Field>
            )}
            <Field label="Tên BU" required>
              <input name="bu_name" required defaultValue={bu?.bu_name} className={inputCls} />
            </Field>
            <Field label="Công ty" required>
              <select name="company_id" required defaultValue={bu?.company_id ?? companies[0]?.id ?? ""} className={inputCls}>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
            </Field>
          </div>
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
