"use client";
import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadAttachmentAction, deleteAttachmentAction } from "@/actions/attachment";
import { Card, Button, inputCls } from "@/components/ui";

export interface AttachmentItem {
  id: number;
  kind: string | null;
  file_name: string;
  uploaded_at: string;
  uploader?: string | null;
}

const KINDS = ["Báo giá", "Hợp đồng", "Phiếu giao hàng", "PO PDF", "Hóa đơn PDF", "Khác"];

export function AttachmentPanel({
  documentType,
  documentId,
  attachments,
  canManage = true,
}: {
  documentType: "PR" | "PO" | "Invoice";
  documentId: number;
  attachments: AttachmentItem[];
  canManage?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <Card className="p-5">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">📎 Tài liệu đính kèm</h3>

      <ul className="mb-3 space-y-2">
        {attachments.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm">
            <a href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-brand-600 hover:underline">
              {a.kind && <span className="mr-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{a.kind}</span>}
              {a.file_name}
            </a>
            {canManage && (
              <button
                onClick={() =>
                  start(async () => {
                    await deleteAttachmentAction(a.id);
                    router.refresh();
                  })
                }
                disabled={pending}
                className="shrink-0 text-xs text-rose-500 hover:underline"
              >
                Xóa
              </button>
            )}
          </li>
        ))}
        {attachments.length === 0 && <li className="text-xs text-slate-400">Chưa có tài liệu.</li>}
      </ul>

      {canManage && (
        <form
          ref={formRef}
          action={(fd) =>
            start(async () => {
              await uploadAttachmentAction(fd);
              formRef.current?.reset();
              router.refresh();
            })
          }
          className="space-y-2 border-t border-slate-100 pt-3"
        >
          <input type="hidden" name="document_type" value={documentType} />
          <input type="hidden" name="document_id" value={documentId} />
          <select name="kind" defaultValue="Khác" className={inputCls}>
            {KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <input type="file" name="file" required className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700" />
          <Button type="submit" disabled={pending} className="w-full justify-center">
            {pending ? "Đang tải lên…" : "⬆ Tải lên"}
          </Button>
        </form>
      )}
    </Card>
  );
}
