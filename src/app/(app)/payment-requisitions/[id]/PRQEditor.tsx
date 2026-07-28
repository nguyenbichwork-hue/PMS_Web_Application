"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updatePRQAction, addPOToPRQAction, removePRQLineAction } from "@/actions/prq";
import { Card, Button, Field, inputCls } from "@/components/ui";
import { money } from "@/lib/format";

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

const d10 = (v: string | null) => (v ? String(v).slice(0, 10) : "");

export function PRQEditor({
  prq,
  lines,
  addablePOs,
}: {
  prq: PRQHeadLite;
  lines: PRQLine[];
  addablePOs: { id: number; po_number: string | null; grand_total: string }[];
}) {
  const [pending, start] = useTransition();
  const [addPo, setAddPo] = useState("");
  const router = useRouter();

  const doAdd = () => {
    if (!addPo) return;
    start(async () => { await addPOToPRQAction(prq.id, Number(addPo)); setAddPo(""); router.refresh(); });
  };
  const doRemove = (itemId: number) => {
    start(async () => { await removePRQLineAction(prq.id, itemId); router.refresh(); });
  };

  return (
    <Card className="p-5">
      <form action={updatePRQAction} className="space-y-5">
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
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="p-2 text-left">STT</th>
                  <th className="p-2 text-left">Số HĐ</th>
                  <th className="p-2 text-left">Ngày HĐ</th>
                  <th className="p-2 text-left">Diễn giải</th>
                  <th className="p-2 text-left">MST</th>
                  <th className="p-2 text-left">GL</th>
                  <th className="p-2 text-left">Cost center</th>
                  <th className="p-2 text-right">Số tiền</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className="p-1.5 align-middle">
                      {i + 1}
                      {l.po_number && <div className="text-[10px] text-slate-400">{l.po_number}</div>}
                    </td>
                    <td className="p-1.5"><input name={`inv_no_${l.id}`} defaultValue={l.inv_no ?? ""} className={inputCls + " !py-1"} /></td>
                    <td className="p-1.5"><input name={`inv_date_${l.id}`} type="date" defaultValue={d10(l.inv_date)} className={inputCls + " !py-1"} /></td>
                    <td className="p-1.5"><input name={`description_${l.id}`} defaultValue={l.description ?? ""} className={inputCls + " !py-1 min-w-[180px]"} /></td>
                    <td className="p-1.5"><input name={`tax_code_${l.id}`} defaultValue={l.tax_code ?? ""} className={inputCls + " !py-1 w-24"} /></td>
                    <td className="p-1.5"><input name={`gl_account_${l.id}`} defaultValue={l.gl_account ?? ""} className={inputCls + " !py-1 w-20"} /></td>
                    <td className="p-1.5"><input name={`cost_center_${l.id}`} defaultValue={l.cost_center ?? ""} className={inputCls + " !py-1 w-24"} /></td>
                    <td className="p-1.5"><input name={`amount_${l.id}`} type="number" min={0} defaultValue={Number(l.amount)} className={inputCls + " !py-1 w-32 text-right"} /></td>
                    <td className="p-1.5 text-center">
                      <button type="button" onClick={() => doRemove(l.id)} disabled={pending} className="text-rose-500 hover:underline">Xóa</button>
                    </td>
                  </tr>
                ))}
                {lines.length === 0 && (
                  <tr><td colSpan={9} className="p-3 text-center text-slate-400">Chưa có dòng nào.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {addablePOs.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Gộp thêm PO cùng NCC:</span>
              <select value={addPo} onChange={(e) => setAddPo(e.target.value)} className={inputCls + " max-w-xs !py-1.5"}>
                <option value="">— Chọn PO —</option>
                {addablePOs.map((p) => (
                  <option key={p.id} value={p.id}>{p.po_number ?? `PO-${p.id}`} · {money(p.grand_total)}</option>
                ))}
              </select>
              <Button type="button" variant="secondary" onClick={doAdd} disabled={pending || !addPo}>+ Thêm PO</Button>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Button type="submit" disabled={pending}>Lưu đề nghị</Button>
        </div>
      </form>
    </Card>
  );
}
