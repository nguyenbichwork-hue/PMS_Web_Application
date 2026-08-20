"use client";
import { useMemo, useState } from "react";
import { createPRQAction } from "@/actions/prq";
import { Card, Field, inputCls } from "@/components/ui";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { money } from "@/lib/format";

export interface EligiblePO {
  po_id: number;
  po_number: string | null;
  company_id: number;
  company_name: string;
  supplier_id: number;
  supplier_name: string | null;
  supplier_bank: string | null;
  grand_total: string;
  remaining: number;
}

interface Supplier { id: number; name: string | null }

export function NewPRQForm({ pos }: { pos: EligiblePO[] }) {
  // Danh sách NCC (duy nhất) suy từ các PO còn tiền.
  const suppliers = useMemo<Supplier[]>(() => {
    const m = new Map<number, Supplier>();
    for (const p of pos) if (!m.has(p.supplier_id)) m.set(p.supplier_id, { id: p.supplier_id, name: p.supplier_name });
    return [...m.values()].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [pos]);

  const [supplierId, setSupplierId] = useState<number | null>(suppliers.length === 1 ? suppliers[0].id : null);
  const [poId, setPoId] = useState<number | null>(null);
  const [bank, setBank] = useState<string>("");
  const [amount, setAmount] = useState<string>("");

  const supplierPOs = useMemo(() => pos.filter((p) => p.supplier_id === supplierId), [pos, supplierId]);
  const selectedPO = useMemo(() => pos.find((p) => p.po_id === poId) ?? null, [pos, poId]);

  const pickSupplier = (id: number) => {
    setSupplierId(id);
    setPoId(null);
    setBank("");
    setAmount("");
  };
  const pickPO = (p: EligiblePO) => {
    setPoId(p.po_id);
    setBank(p.supplier_bank ?? "");
    setAmount(String(Math.round(p.remaining))); // mặc định = số còn lại
  };

  const amt = Number(amount) || 0;
  const overpay = selectedPO ? amt > selectedPO.remaining + 0.5 : false;
  const canSubmit = poId != null && amt > 0 && !overpay;

  return (
    <form action={createPRQAction} className="space-y-4">
      <input type="hidden" name="po_id" value={poId ?? ""} />
      <input type="hidden" name="amount" value={amt || ""} />

      <Card className="p-6">
        <Field label="Nhà cung cấp" required>
          <select value={supplierId ?? ""} onChange={(e) => pickSupplier(Number(e.target.value))} className={inputCls}>
            <option value="" disabled>— Chọn nhà cung cấp —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name ?? `NCC #${s.id}`}</option>
            ))}
          </select>
        </Field>
        <p className="mt-2 text-xs text-slate-400">Mỗi đề nghị thanh toán cho MỘT đơn hàng (PO) của một nhà cung cấp.</p>
      </Card>

      {supplierId != null && (
        <Card className="p-6">
          <h3 className="mb-3 text-base font-semibold text-slate-800">Chọn đơn hàng (PO) cần thanh toán</h3>
          {supplierPOs.length === 0 ? (
            <p className="text-sm text-slate-400">Nhà cung cấp này không có đơn hàng còn tiền.</p>
          ) : (
            <div className="space-y-2">
              {supplierPOs.map((p) => {
                const paid = Number(p.grand_total) - p.remaining;
                const on = poId === p.po_id;
                return (
                  <label
                    key={p.po_id}
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 ${on ? "border-teal-400 bg-teal-50/60" : "border-slate-200 hover:bg-slate-50"}`}
                  >
                    <div className="flex items-center gap-3">
                      <input type="radio" name="po_pick" checked={on} onChange={() => pickPO(p)} />
                      <div>
                        <div className="text-sm font-semibold text-slate-700">{p.po_number ?? `PO-${p.po_id}`}</div>
                        <div className="text-xs text-slate-500">{p.company_name}</div>
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <div>Tổng PO: <b className="text-slate-700">{money(p.grand_total)}</b></div>
                      {paid > 0.5 && <div>Đã lập PRQ: {money(paid)}</div>}
                      <div className="text-teal-700">Còn lại: <b>{money(p.remaining)}</b></div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {selectedPO && (
        <Card className="p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Số tiền thanh toán lần này" required>
              <input
                type="number"
                min={0}
                step={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={inputCls + (overpay ? " border-rose-400" : "")}
                placeholder="VD: 1500000"
                required
              />
            </Field>
            <div className="flex items-end">
              <p className={`text-sm ${overpay ? "text-rose-600" : "text-slate-500"}`}>
                {overpay ? `Vượt số còn lại ${money(selectedPO.remaining)}` : `Còn lại của đơn hàng: ${money(selectedPO.remaining)}`}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Số TK ngân hàng" required>
              <input name="bank_account" value={bank} onChange={(e) => setBank(e.target.value)} className={inputCls} placeholder="Số tài khoản NCC" required />
            </Field>
            <Field label="Tên ngân hàng" required>
              <input name="bank_name" className={inputCls} placeholder="VD: Ngân hàng ACB - PGD Nguyễn Khoái" required />
            </Field>
            <Field label="Ngày đến hạn" required>
              <input type="date" name="due_date" className={inputCls} required />
            </Field>
            <Field label="Lý do / Nội dung" required>
              <input name="reason" className={inputCls} placeholder="VD: Thanh toán đợt 1" required />
            </Field>
          </div>
          <p className="mt-2 text-xs text-slate-400">Các trường ngân hàng / ngày đến hạn / lý do là <b>bắt buộc</b>. Đề nghị này phải được duyệt trước khi chi.</p>
        </Card>
      )}

      <div className="flex items-center justify-end gap-3">
        <span className="text-xs text-slate-400">{selectedPO ? `Chi ${money(amt)} cho ${selectedPO.po_number ?? `PO-${selectedPO.po_id}`}` : "Chưa chọn đơn hàng"}</span>
        <FormSubmitButton disabled={!canSubmit} pendingText="Đang tạo…">Tạo đề nghị thanh toán</FormSubmitButton>
      </div>
    </form>
  );
}
