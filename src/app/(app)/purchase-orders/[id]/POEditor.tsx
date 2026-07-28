"use client";
import { updatePOAction } from "@/actions/po";
import { Card, Field, inputCls, Button } from "@/components/ui";
import type { PurchaseOrder, POItem, Supplier } from "@/lib/types";

export function POEditor({
  po,
  items,
  suppliers,
}: {
  po: PurchaseOrder;
  items: POItem[];
  suppliers: Supplier[];
}) {
  return (
    <Card className="p-5">
      <h3 className="mb-1 text-sm font-semibold text-slate-700">
        Điều chỉnh PO <span className="text-xs font-normal text-slate-400">(supplier / ngày giao / điều khoản / số lượng / đơn giá — có lưu lịch sử)</span>
      </h3>
      <p className="mb-3 text-xs text-slate-500">
        Dùng khi PO <b>sai lệch so với hóa đơn điện tử</b>: sửa số lượng/đơn giá cho khớp rồi vào hóa đơn bấm <b>“Đối chiếu lại”</b>.
      </p>
      <form action={updatePOAction} className="space-y-4">
        <input type="hidden" name="po_id" value={po.id} />
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Nhà cung cấp">
            <select name="supplier_id" defaultValue={po.supplier_id ?? ""} className={inputCls}>
              <option value="">—</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.supplier_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ngày giao">
            <input
              type="date"
              name="delivery_date"
              defaultValue={po.delivery_date ?? ""}
              className={inputCls}
            />
          </Field>
          <Field label="Điều khoản thanh toán">
            <select name="payment_term" defaultValue={po.payment_term ?? "NET30"} className={inputCls}>
              {["COD", "NET15", "NET30", "NET45", "NET60"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
        </div>

        <div>
          <div className="mb-1 text-sm font-medium text-slate-700">Số lượng & đơn giá theo dòng</div>
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.id} className="flex flex-wrap items-center gap-3">
                <span className="min-w-[140px] flex-1 text-sm text-slate-600">{it.description}</span>
                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                  SL
                  <input type="number" min={0} step="any" name={`qty_${it.id}`} defaultValue={Number(it.quantity)} className={`${inputCls} w-28`} />
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                  Đơn giá
                  <input type="number" min={0} name={`price_${it.id}`} defaultValue={Number(it.unit_price)} className={`${inputCls} w-40`} />
                </label>
              </div>
            ))}
          </div>
        </div>

        <Button type="submit">Lưu điều chỉnh</Button>
      </form>
    </Card>
  );
}
