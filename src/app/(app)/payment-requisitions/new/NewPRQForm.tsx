"use client";
import { useMemo, useState } from "react";
import { createPRQAction } from "@/actions/prq";
import { Card, Field, inputCls } from "@/components/ui";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { money } from "@/lib/format";

export interface EligibleLine {
  po_item_id: number;
  po_id: number;
  po_number: string | null;
  company_id: number;
  company_name: string;
  supplier_id: number;
  supplier_name: string | null;
  supplier_bank: string | null;
  item_code: string | null;
  description: string | null;
  quantity: string;
  unit_price: string;
  vat_rate: string | null;
  amount: string;
  line_no: number;
}

interface Supplier {
  id: number;
  name: string | null;
  bank: string | null;
}

type POGroup = { poId: number; po_number: string | null; items: EligibleLine[] };

export function NewPRQForm({ lines }: { lines: EligibleLine[] }) {
  // Danh sách NCC (duy nhất) suy từ các dòng đủ điều kiện.
  const suppliers = useMemo<Supplier[]>(() => {
    const m = new Map<number, Supplier>();
    for (const l of lines) if (!m.has(l.supplier_id)) m.set(l.supplier_id, { id: l.supplier_id, name: l.supplier_name, bank: l.supplier_bank });
    return [...m.values()].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [lines]);

  const [supplierId, setSupplierId] = useState<number | null>(suppliers.length === 1 ? suppliers[0].id : null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [bank, setBank] = useState<string>(suppliers.length === 1 ? suppliers[0].bank ?? "" : "");

  // Dòng của NCC đang chọn, gom theo PO.
  const byPO = useMemo<POGroup[]>(() => {
    const groups = new Map<number, POGroup>();
    for (const l of lines) {
      if (l.supplier_id !== supplierId) continue;
      const g = groups.get(l.po_id) ?? { poId: l.po_id, po_number: l.po_number, items: [] };
      g.items.push(l);
      groups.set(l.po_id, g);
    }
    return [...groups.values()];
  }, [lines, supplierId]);

  const selectedTotal = useMemo(
    () => lines.filter((l) => checked.has(l.po_item_id)).reduce((s, l) => s + Number(l.amount), 0),
    [lines, checked]
  );

  const pickSupplier = (id: number) => {
    setSupplierId(id);
    setChecked(new Set()); // đổi NCC → bỏ chọn cũ (1 PRQ = 1 NCC)
    const sup = suppliers.find((s) => s.id === id);
    setBank(sup?.bank ?? "");
  };
  const toggle = (id: number) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const togglePO = (items: EligibleLine[], on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      for (const it of items) { if (on) next.add(it.po_item_id); else next.delete(it.po_item_id); }
      return next;
    });

  const canSubmit = supplierId != null && checked.size > 0;
  const idsJson = JSON.stringify([...checked]);

  return (
    <form action={createPRQAction} className="space-y-4">
      {/* Trường ẩn gom vào FormData */}
      <input type="hidden" name="supplier_id" value={supplierId ?? ""} />
      <input type="hidden" name="po_item_ids" value={idsJson} />

      <Card className="p-6">
        <Field label="Nhà cung cấp" required>
          <select
            value={supplierId ?? ""}
            onChange={(e) => pickSupplier(Number(e.target.value))}
            className={inputCls}
          >
            <option value="" disabled>— Chọn nhà cung cấp —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name ?? `NCC #${s.id}`}</option>
            ))}
          </select>
        </Field>
        <p className="mt-2 text-xs text-slate-400">Mỗi đề nghị thanh toán chỉ cho MỘT nhà cung cấp. Đổi NCC sẽ bỏ các dòng đã chọn.</p>
      </Card>

      {supplierId != null && (
        <Card className="p-6">
          <h3 className="mb-3 text-base font-semibold text-slate-800">Chọn dòng PO cần thanh toán</h3>
          {byPO.length === 0 ? (
            <p className="text-sm text-slate-400">Nhà cung cấp này không có dòng PO đủ điều kiện.</p>
          ) : (
            <div className="space-y-4">
              {byPO.map((g) => {
                const allOn = g.items.every((it) => checked.has(it.po_item_id));
                return (
                  <div key={g.poId} className="rounded-xl border border-slate-200">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
                      <span className="text-sm font-semibold text-slate-700">{g.po_number ?? `PO #${g.poId}`}</span>
                      <label className="flex items-center gap-1.5 text-xs text-slate-500">
                        <input type="checkbox" checked={allOn} onChange={(e) => togglePO(g.items, e.target.checked)} />
                        Chọn cả PO
                      </label>
                    </div>
                    <table className="w-full text-sm">
                      <thead className="text-xs text-slate-400">
                        <tr>
                          <th className="w-8 p-2"></th>
                          <th className="p-2 text-left">Mã</th>
                          <th className="p-2 text-left">Mô tả</th>
                          <th className="p-2 text-right">SL</th>
                          <th className="p-2 text-right">Đơn giá</th>
                          <th className="p-2 text-right">Thành tiền</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.items.map((it) => (
                          <tr key={it.po_item_id} className="border-t border-slate-50">
                            <td className="p-2 text-center">
                              <input type="checkbox" checked={checked.has(it.po_item_id)} onChange={() => toggle(it.po_item_id)} />
                            </td>
                            <td className="p-2">{it.item_code ?? "—"}</td>
                            <td className="p-2">{it.description}</td>
                            <td className="p-2 text-right">{Number(it.quantity)}</td>
                            <td className="p-2 text-right">{money(it.unit_price)}</td>
                            <td className="p-2 text-right font-medium">{money(it.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-4 flex justify-end text-sm">
            <span className="text-slate-500">Tổng đã chọn (gồm thuế): <b className="text-teal-700">{money(selectedTotal)}</b></span>
          </div>
        </Card>
      )}

      <Card className="p-6">
        <div className="grid gap-4 md:grid-cols-2">
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
        <p className="mt-2 text-xs text-slate-400">Các trường ngân hàng / ngày đến hạn / lý do là <b>bắt buộc</b>. Thông tin này được dùng lại ở các bước sau — không phải nhập lại.</p>
      </Card>

      <div className="flex items-center justify-end gap-3">
        <span className="text-xs text-slate-400">{checked.size > 0 ? `Đã chọn ${checked.size} dòng` : "Chưa chọn dòng nào"}</span>
        <FormSubmitButton disabled={!canSubmit} pendingText="Đang tạo…">Tạo đề nghị thanh toán</FormSubmitButton>
      </div>
    </form>
  );
}
