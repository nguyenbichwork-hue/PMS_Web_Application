"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPaymentAction, markInvoicePaidAction } from "@/actions/invoice";
import { Card, Button, inputCls } from "@/components/ui";
import { date } from "@/lib/format";

export interface PaymentRow {
  id: number;
  payment_date: string;
  amount: number;
  method: string;
  reference: string | null;
}

const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(Math.round(n)) + " ₫";

export function PaymentPanel({
  invoiceId,
  total,
  payments,
  canPay,
}: {
  invoiceId: number;
  total: number;
  payments: PaymentRow[];
  canPay: boolean;
}) {
  const paidSum = payments.reduce((s, p) => s + Number(p.amount), 0);
  const remaining = Math.max(0, total - paidSum);
  const fullyPaid = remaining <= 0.5;

  const [amount, setAmount] = useState(remaining > 0 ? String(Math.round(remaining)) : "");
  const [method, setMethod] = useState("Chuyển khoản");
  const [reference, setReference] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const submit = () => {
    setErr(null);
    const fd = new FormData();
    fd.append("invoice_id", String(invoiceId));
    fd.append("amount", amount);
    fd.append("method", method);
    fd.append("reference", reference);
    start(async () => {
      try {
        await addPaymentAction(fd);
        setReference("");
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Có lỗi xảy ra");
      }
    });
  };

  const payAll = () =>
    start(async () => {
      await markInvoicePaidAction(invoiceId);
      router.refresh();
    });

  const pct = total > 0 ? Math.min(100, (paidSum / total) * 100) : 0;

  return (
    <Card className="p-5">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">Thanh toán</h3>

      <div className="space-y-1 text-sm">
        <div className="flex justify-between text-slate-600"><span>Tổng tiền</span><span className="font-medium">{fmt(total)}</span></div>
        <div className="flex justify-between text-emerald-700"><span>Đã thanh toán</span><span className="font-medium">{fmt(paidSum)}</span></div>
        <div className="flex justify-between border-t border-slate-200 pt-1 font-bold text-slate-900"><span>Còn lại</span><span>{fmt(remaining)}</span></div>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>

      {payments.length > 0 && (
        <ul className="mt-4 space-y-2">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between border-b border-slate-100 pb-1.5 text-sm">
              <span>
                <span className="font-medium text-slate-700">{fmt(p.amount)}</span>
                <span className="ml-2 text-xs text-slate-400">{p.method}{p.reference ? ` · ${p.reference}` : ""}</span>
              </span>
              <span className="text-xs text-slate-400">{date(p.payment_date)}</span>
            </li>
          ))}
        </ul>
      )}

      {fullyPaid ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-center text-sm font-medium text-emerald-700">
          ✓ Đã thanh toán đủ
        </div>
      ) : canPay ? (
        <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
          <label className="block text-xs font-medium text-slate-500">Ghi nhận một đợt thanh toán</label>
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" placeholder="Số tiền" className={inputCls} />
          <div className="grid grid-cols-2 gap-2">
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
              <option>Chuyển khoản</option>
              <option>Tiền mặt</option>
              <option>Khác</option>
            </select>
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Số UNC / tham chiếu" className={inputCls} />
          </div>
          {err && <p className="text-xs text-rose-600">{err}</p>}
          <div className="flex gap-2">
            <Button className="flex-1 justify-center" disabled={pending || !amount} onClick={submit}>Ghi nhận</Button>
            <Button variant="secondary" disabled={pending} onClick={payAll}>Trả hết</Button>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-slate-400">Hóa đơn cần đối chiếu Khớp/Cảnh báo mới ghi nhận thanh toán.</p>
      )}
    </Card>
  );
}
