"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addCreditNoteAction } from "@/actions/invoice";
import { Card, Button, inputCls } from "@/components/ui";
import { money, date } from "@/lib/format";

export interface CreditNoteRow { id: number; amount: number; reason: string | null; created_at: string; author: string | null }

/** Credit Note — điều chỉnh GIẢM nghĩa vụ hóa đơn (trả hàng/giảm giá sau HĐ). */
export function CreditNotePanel({
  invoiceId, notes, open, canManage,
}: { invoiceId: number; notes: CreditNoteRow[]; open: number; canManage: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const totalCredited = notes.reduce((s, n) => s + Number(n.amount), 0);

  return (
    <Card className="p-5">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">Điều chỉnh giảm (Credit Note)</h3>

      {notes.length > 0 && (
        <ul className="mb-3 space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-rose-600">− {money(n.amount)}</span>
                <span className="text-[11px] text-slate-400" suppressHydrationWarning>{date(n.created_at)}{n.author ? ` · ${n.author}` : ""}</span>
              </div>
              {n.reason && <div className="mt-0.5 text-xs text-slate-500">{n.reason}</div>}
            </li>
          ))}
          <li className="text-xs text-slate-500">Tổng đã giảm: <b>{money(totalCredited)}</b></li>
        </ul>
      )}

      {canManage ? (
        <form
          ref={formRef}
          action={(fd) => {
            setErr(null);
            start(async () => {
              try { await addCreditNoteAction(fd); formRef.current?.reset(); router.refresh(); }
              catch (e) { setErr(e instanceof Error ? e.message : "Có lỗi xảy ra"); }
            });
          }}
          className="space-y-2 border-t border-slate-100 pt-3"
        >
          <input type="hidden" name="invoice_id" value={invoiceId} />
          <div className="text-xs text-slate-400">Còn lại của hóa đơn: <b className="text-slate-600">{money(open)}</b></div>
          <input name="amount" type="number" step="any" min={0} placeholder="Số tiền giảm (₫)" required className={inputCls} />
          <input name="reason" placeholder="Lý do (trả hàng, giảm giá…)" className={inputCls} />
          {err && <p className="text-sm text-rose-600">{err}</p>}
          <Button type="submit" disabled={pending || open <= 0} className="w-full justify-center">
            {pending ? "Đang ghi…" : "Ghi điều chỉnh giảm"}
          </Button>
        </form>
      ) : notes.length === 0 ? (
        <p className="text-xs text-slate-400">Chưa có điều chỉnh giảm.</p>
      ) : null}
    </Card>
  );
}
