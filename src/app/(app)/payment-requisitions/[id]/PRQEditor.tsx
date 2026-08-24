"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updatePRQAction, removePRQLineAction } from "@/actions/prq";
import { Card, Field, inputCls } from "@/components/ui";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { usePrqDirty } from "./DirtyContext";

export interface PRQLine {
  id: number;
  po_id: number | null;
  po_number: string | null;
  inv_no: string | null;
  inv_date: string | null;
  description: string | null;
  tax_code: string | null;
  gl_account: string | null;
  cost_center: string | null;
  currency: string;
  amount: string;
  vat_rate: string | null;
  line_no: number;
}

interface PRQHeadLite {
  id: number;
  payment_type: string;
  due_date: string | null;
  bank_account: string | null;
  bank_name: string | null;
  bank_address: string | null;
  swift_code: string | null;
  reason: string | null;
}

// Chuẩn hóa về 'YYYY-MM-DD' cho <input type=date>. Postgres (Neon) trả cột DATE
// dưới dạng đối tượng Date → phải format theo NGÀY ĐỊA PHƯƠNG (tránh lệch múi giờ),
// không dùng String(date).slice (ra "Thu Aug 2..." → input bỏ trống). PGlite trả chuỗi.
const d10 = (v: string | Date | null | undefined): string => {
  if (!v) return "";
  if (v instanceof Date) {
    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, "0"), d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const m = String(v).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
};

export function PRQEditor({
  prq,
  lines,
}: {
  prq: PRQHeadLite;
  lines: PRQLine[];
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { setDirty } = usePrqDirty();

  // Số tiền GỒM thuế của từng dòng (nhập trực tiếp).
  const [gross, setGross] = useState<Record<number, number>>(() => {
    const m: Record<number, number> = {};
    for (const l of lines) m[l.id] = Number(l.amount) || 0;
    return m;
  });
  const setGrossFor = (id: number, v: number) => setGross((p) => ({ ...p, [id]: v }));

  const doRemove = (itemId: number) => {
    start(async () => { await removePRQLineAction(prq.id, itemId); router.refresh(); });
  };

  return (
    <Card className="p-5">
      <form
        action={updatePRQAction}
        onInput={() => setDirty(true)}
        onSubmit={() => setDirty(false)}
        className="space-y-5"
      >
        <input type="hidden" name="prq_id" value={prq.id} />

        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Thông tin thanh toán & ngân hàng</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Loại thanh toán">
              <select name="payment_type" defaultValue={prq.payment_type} className={inputCls}>
                <option value="Normal">Thanh toán thường</option>
                <option value="Advance">Ứng trước / Đặt cọc</option>
              </select>
            </Field>
            <Field label="Ngày đến hạn">
              <input name="due_date" type="date" defaultValue={d10(prq.due_date)} className={inputCls} />
            </Field>
            <Field label="Số tài khoản ngân hàng (tự điền)">
              <input name="bank_account" defaultValue={prq.bank_account ?? ""} className={inputCls} placeholder="VD: 124233539" />
            </Field>
            <Field label="Tên ngân hàng (tự điền)">
              <input name="bank_name" defaultValue={prq.bank_name ?? ""} className={inputCls} placeholder="VD: Ngân hàng ACB - PGD Nguyễn Khoái" />
            </Field>
            <Field label="Địa chỉ ngân hàng">
              <input name="bank_address" defaultValue={prq.bank_address ?? ""} className={inputCls} />
            </Field>
            <Field label="Swift code (nếu có)">
              <input name="swift_code" defaultValue={prq.swift_code ?? ""} className={inputCls} />
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Lý do / diễn giải thanh toán">
              <textarea name="reason" defaultValue={prq.reason ?? ""} rows={2} className={inputCls} />
            </Field>
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Chi tiết dòng thanh toán (số tiền GỒM thuế)</h3>
          {/* Mỗi dòng = một THẺ có nhãn rõ ràng (tránh bảng nhiều cột bị bó chật). */}
          <div className="space-y-3">
            {lines.map((l, i) => (
              <div key={l.id} className="rounded-xl border border-slate-200 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-100 text-xs text-teal-700">{i + 1}</span>
                    Dòng {i + 1}
                    {l.po_number && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">{l.po_number}</span>}
                  </div>
                  <button type="button" onClick={() => doRemove(l.id)} disabled={pending} className="text-xs font-medium text-rose-500 hover:underline">
                    Xóa dòng
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Số tiền (gồm thuế)">
                    <input name={`amount_${l.id}`} type="number" min={0} value={gross[l.id] ?? 0} onChange={(e) => setGrossFor(l.id, Number(e.target.value) || 0)} className={inputCls + " text-right font-semibold text-teal-700"} />
                  </Field>
                  <Field label="Diễn giải">
                    <input name={`description_${l.id}`} defaultValue={l.description ?? ""} className={inputCls} placeholder="Nội dung thanh toán…" />
                  </Field>
                </div>
              </div>
            ))}
            {lines.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
                Chưa có dòng nào.
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <FormSubmitButton disabled={pending} pendingText="Đang lưu…">Lưu đề nghị</FormSubmitButton>
        </div>
      </form>
    </Card>
  );
}
