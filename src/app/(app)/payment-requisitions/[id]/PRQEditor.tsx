"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updatePRQAction, addPOToPRQAction, removePRQLineAction } from "@/actions/prq";
import { Card, Button, Field, inputCls } from "@/components/ui";
import { FormSubmitButton } from "@/components/FormSubmitButton";
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

  // Tính nhanh: nhập TIỀN TRƯỚC THUẾ + % VAT → tự ra SỐ TIỀN GỒM THUẾ (vẫn sửa tay được).
  const round = (n: number) => Math.round(n) || 0;
  const [amt, setAmt] = useState<Record<number, { net: number; vat: number; gross: number }>>(() => {
    const m: Record<number, { net: number; vat: number; gross: number }> = {};
    for (const l of lines) {
      const vat = l.vat_rate != null && String(l.vat_rate) !== "" ? Number(l.vat_rate) : 0;
      const gross = Number(l.amount) || 0;
      const net = vat > 0 ? round(gross / (1 + vat / 100)) : gross;
      m[l.id] = { net, vat, gross };
    }
    return m;
  });
  const setNet = (id: number, net: number) =>
    setAmt((p) => { const v = p[id]; return { ...p, [id]: { ...v, net, gross: v.vat > 0 ? round(net * (1 + v.vat / 100)) : net } }; });
  const setVat = (id: number, vat: number) =>
    setAmt((p) => { const v = p[id]; return { ...p, [id]: { ...v, vat, gross: vat > 0 ? round(v.net * (1 + vat / 100)) : v.net } }; });
  const setGross = (id: number, gross: number) =>
    setAmt((p) => { const v = p[id]; return { ...p, [id]: { ...v, gross } }; });

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
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Số hóa đơn">
                    <input name={`inv_no_${l.id}`} defaultValue={l.inv_no ?? ""} className={inputCls} placeholder="VD: 099/VM/2026" />
                  </Field>
                  <Field label="Ngày hóa đơn">
                    <input name={`inv_date_${l.id}`} type="date" defaultValue={d10(l.inv_date)} className={inputCls} />
                  </Field>
                  <Field label="Mã số thuế">
                    <input name={`tax_code_${l.id}`} defaultValue={l.tax_code ?? ""} className={inputCls} />
                  </Field>
                  <Field label="Tiền trước thuế">
                    <input type="number" min={0} value={amt[l.id]?.net ?? 0} onChange={(e) => setNet(l.id, Number(e.target.value) || 0)} className={inputCls + " text-right"} />
                  </Field>
                  <Field label="% VAT">
                    <input name={`vat_rate_${l.id}`} type="number" min={0} max={100} step={0.5} value={amt[l.id]?.vat ?? 0} onChange={(e) => setVat(l.id, Number(e.target.value) || 0)} className={inputCls + " text-right"} />
                  </Field>
                  <Field label="Số tiền (gồm thuế)">
                    <input name={`amount_${l.id}`} type="number" min={0} value={amt[l.id]?.gross ?? 0} onChange={(e) => setGross(l.id, Number(e.target.value) || 0)} className={inputCls + " text-right font-semibold text-teal-700"} />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Diễn giải">
                      <input name={`description_${l.id}`} defaultValue={l.description ?? ""} className={inputCls} placeholder="Nội dung thanh toán…" />
                    </Field>
                  </div>
                  <Field label="GL Account">
                    <input name={`gl_account_${l.id}`} defaultValue={l.gl_account ?? ""} className={inputCls} />
                  </Field>
                  <Field label="Cost center">
                    <input name={`cost_center_${l.id}`} defaultValue={l.cost_center ?? ""} className={inputCls} />
                  </Field>
                </div>
              </div>
            ))}
            {lines.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
                Chưa có dòng nào. Gộp thêm PO ở bên dưới.
              </div>
            )}
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
          <FormSubmitButton disabled={pending} pendingText="Đang lưu…">Lưu đề nghị</FormSubmitButton>
        </div>
      </form>
    </Card>
  );
}
