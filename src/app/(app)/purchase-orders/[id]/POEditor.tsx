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
      <h3 className="mb-3 text-sm font-semibold text-slate-700">
        Điều chỉnh PO <span className="text-xs font-normal text-slate-400">(supplier / ngày giao / điều khoản / đơn giá — có lưu lịch sử)</span>
      </h3>
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
          <div className="mb-1 text-sm font-medium text-slate-700">Đơn giá theo dòng</div>
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.id} className="flex items-center gap-3">
                <span className="flex-1 text-sm text-slate-600">
                  {it.description} <span className="text-slate-400">× {Number(it.quantity)}</span>
                </span>
                <input
                  type="number"
                  name={`price_${it.id}`}
                  defaultValue={Number(it.unit_price)}
                  className={`${inputCls} w-40`}
                />
              </div>
            ))}
          </div>
        </div>

        <Button type="submit">Lưu điều chỉnh</Button>
      </form>
    </Card>
  );
}
