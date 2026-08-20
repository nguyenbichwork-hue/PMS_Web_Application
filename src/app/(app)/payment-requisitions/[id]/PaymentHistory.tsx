"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadAttachmentAction, deleteAttachmentAction } from "@/actions/attachment";
import { Card, Button } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { money, date } from "@/lib/format";

export interface PaymentEvidence { id: number; file_name: string }
export interface PaymentRow {
  id: number;
  amount: string;
  paid_date: string | null;
  paid_ref: string | null;
  paid_by_name: string | null;
  files: PaymentEvidence[];
}

const fileCls =
  "block w-full text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-brand-50 file:px-2 file:py-1 file:text-xs file:font-medium file:text-brand-700";

/** Lịch sử chi tiền: mỗi lần chi 1 dòng + file bằng chứng riêng (hóa đơn/UNC…).
 *  Người chi (canPay) có thể BỔ SUNG thêm file sau, hoặc xóa file đã đính. */
export function PaymentHistory({ payments, canPay }: { payments: PaymentRow[]; canPay: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<number | null>(null);
  const inputs = useRef<Record<number, HTMLInputElement | null>>({});

  const addFiles = (paymentId: number) => {
    const input = inputs.current[paymentId];
    const files = input?.files;
    if (!files || files.length === 0) { toast("Chưa chọn file nào.", "info"); return; }
    setBusyId(paymentId);
    start(async () => {
      const fd = new FormData();
      fd.set("document_type", "PRQPay");
      fd.set("document_id", String(paymentId));
      fd.set("kind", "Chứng từ chi");
      for (const f of Array.from(files)) fd.append("file", f);
      const res = await uploadAttachmentAction(fd);
      setBusyId(null);
      if (res && !res.ok) { toast(res.error ?? "Tải file lỗi.", "error"); return; }
      if (input) input.value = "";
      router.refresh();
    });
  };

  const removeFile = (attId: number) => {
    setBusyId(attId);
    start(async () => {
      const res = await deleteAttachmentAction(attId);
      setBusyId(null);
      if (res && !res.ok) { toast(res.error ?? "Xóa file lỗi.", "error"); return; }
      router.refresh();
    });
  };

  return (
    <Card className="p-5">
      <h3 className="mb-3 text-base font-semibold text-slate-800">Lịch sử chi tiền</h3>
      <div className="space-y-3">
        {payments.map((p, i) => (
          <div key={p.id} className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-100 text-xs text-teal-700">{i + 1}</span>
                Lần {i + 1}
                <span className="text-slate-400">·</span>
                <span>{p.paid_date ? date(p.paid_date) : "—"}</span>
                {p.paid_ref && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">{p.paid_ref}</span>}
                {p.paid_by_name && <span className="text-xs font-normal text-slate-400">— {p.paid_by_name}</span>}
              </div>
              <div className="text-sm font-semibold text-teal-700">{money(p.amount)}</div>
            </div>

            <div className="mt-2 pl-8">
              {p.files.length > 0 ? (
                <ul className="space-y-1">
                  {p.files.map((f) => (
                    <li key={f.id} className="flex items-center gap-2 text-sm">
                      <a href={`/api/attachments/${f.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-brand-600 hover:underline">
                        {f.file_name}
                      </a>
                      {canPay && (
                        <button type="button" onClick={() => removeFile(f.id)} disabled={pending && busyId === f.id} className="shrink-0 text-xs font-medium text-rose-500 hover:underline">
                          Xóa
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-400">Chưa có file bằng chứng.</p>
              )}

              {canPay && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input ref={(el) => { inputs.current[p.id] = el; }} type="file" multiple className={fileCls + " max-w-xs"} />
                  <Button variant="secondary" loading={pending && busyId === p.id} onClick={() => addFiles(p.id)}>
                    + Bổ sung file
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
