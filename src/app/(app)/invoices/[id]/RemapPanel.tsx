"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { remapInvoiceAction } from "@/actions/invoice-remap";
import { Card, Button, inputCls } from "@/components/ui";
import { money } from "@/lib/format";

export interface RemapPoOption {
  id: number;
  po_number: string | null;
  supplier_name: string | null;
  grand_total: number;
  same_supplier: boolean;
}

/** Panel SỬA / BỎ map hóa đơn ↔ PO — chỉ Kế toán/Admin thấy. */
export function RemapPanel({ invoiceId, currentPoId, options }: { invoiceId: number; currentPoId: number | null; options: RemapPoOption[] }) {
  const router = useRouter();
  const [pick, setPick] = useState<number>(currentPoId ?? 0);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const run = (poId: number | null) => {
    setErr(null);
    start(async () => {
      const r = await remapInvoiceAction(invoiceId, poId);
      if (!r.ok) setErr(r.error ?? "Không thực hiện được.");
      else router.refresh();
    });
  };

  return (
    <Card className="p-4">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Đối chiếu lại / sửa / bỏ ghép PO</div>
      <p className="mb-3 text-[12px] text-slate-500">
        Bấm <b>↻ Đối chiếu lại</b> để chạy lại đối chiếu với PO hiện tại (cập nhật theo GRN mới nhập thêm). Hoặc chọn PO khác rồi <b>Đổi PO</b>, hoặc <b>Bỏ ghép</b> nếu ghép sai.
      </p>
      {currentPoId != null && (
        <Button onClick={() => run(currentPoId)} disabled={pending} variant="primary" className="mb-3 w-full">
          {pending ? "Đang xử lý…" : "↻ Đối chiếu lại (PO hiện tại)"}
        </Button>
      )}
      <select className={inputCls} value={pick} onChange={(e) => setPick(Number(e.target.value))} disabled={pending}>
        <option value={0}>— Chọn PO —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.po_number} · {money(o.grand_total)}{o.same_supplier ? "" : "  (khác NCC)"}
          </option>
        ))}
      </select>
      <div className="mt-3 flex gap-2">
        <Button onClick={() => run(pick > 0 ? pick : null)} disabled={pending || pick === 0 || pick === currentPoId} variant={currentPoId != null ? "secondary" : "primary"}>
          {pending ? "Đang xử lý…" : "Đổi PO"}
        </Button>
        {currentPoId != null && (
          <Button onClick={() => run(null)} disabled={pending}>Bỏ ghép</Button>
        )}
      </div>
      {err && <p className="mt-2 text-[12px] text-rose-600">{err}</p>}
      {options.length === 0 && <p className="mt-2 text-[12px] text-slate-400">Chưa có PO đang mở phù hợp để ghép.</p>}
    </Card>
  );
}
