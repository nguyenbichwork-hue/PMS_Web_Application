"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadAttachmentAction, deleteAttachmentAction } from "@/actions/attachment";
import { Card, Button } from "@/components/ui";
import { attachmentTypesFor } from "@/lib/attachment-types";

export interface AttachmentItem {
  id: number;
  kind: string | null;
  file_name: string;
  uploaded_at: string;
  uploader?: string | null;
}

const fileCls =
  "block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700";

/**
 * Panel tài liệu đính kèm dùng CHUNG cho trang chi tiết PR / PO / Đề nghị thanh toán.
 * Bố cục TÁCH THEO LOẠI chứng từ — giống hệt phần đính kèm khi TẠO MỚI PR: mỗi loại
 * có một ô riêng, hiển thị các tệp đã tải kèm nút xóa, và một ô chọn tệp (nhiều tệp).
 * Bấm "Tải lên" sẽ gửi lần lượt từng loại có tệp (kind = nhãn loại).
 */
export function AttachmentPanel({
  documentType,
  documentId,
  attachments,
  canManage = true,
}: {
  documentType: "PR" | "PO" | "Invoice" | "PRQ";
  documentId: number;
  attachments: AttachmentItem[];
  canManage?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<Record<string, number>>({});
  const router = useRouter();

  // Danh mục loại tệp theo loại chứng từ (PRQ có thêm "PRQ đã ký").
  const TYPES = attachmentTypesFor(documentType);

  // Gom tệp hiện có theo loại. Loại lạ (không nằm trong danh mục) gom vào "Khác".
  const KNOWN = new Set<string>(TYPES.map((t) => t.label));
  const byKind: Record<string, AttachmentItem[]> = {};
  for (const a of attachments) {
    const label = a.kind && KNOWN.has(a.kind) ? a.kind : "Khác";
    (byKind[label] ??= []).push(a);
  }

  const del = (id: number) =>
    start(async () => {
      const res = await deleteAttachmentAction(id);
      if (res && !res.ok) { alert(res.error); return; }
      router.refresh();
    });

  const upload = () => {
    const form = formRef.current;
    if (!form) return;
    start(async () => {
      let uploaded = 0;
      for (const t of TYPES) {
        const input = form.elements.namedItem(`files_${t.key}`) as HTMLInputElement | null;
        const files = input?.files;
        if (!files || files.length === 0) continue;
        const fd = new FormData();
        fd.set("document_type", documentType);
        fd.set("document_id", String(documentId));
        fd.set("kind", t.label);
        for (const f of Array.from(files)) fd.append("file", f);
        const res = await uploadAttachmentAction(fd);
        if (res && !res.ok) { alert(res.error); return; }
        uploaded += files.length;
      }
      if (uploaded === 0) { alert("Chưa chọn tệp nào để tải lên."); return; }
      form.reset();
      setPicked({});
      router.refresh();
    });
  };

  const totalPicked = Object.values(picked).reduce((s, n) => s + n, 0);
  // Chế độ chỉ đọc: chỉ hiện những loại đang có tệp.
  const typesToShow = canManage
    ? TYPES
    : TYPES.filter((t) => byKind[t.label]?.length);

  return (
    <Card className="p-5">
      <h3 className="mb-3 text-base font-semibold text-slate-800">Tài liệu đính kèm</h3>

      {typesToShow.length === 0 && (
        <p className="text-sm text-slate-400">Chưa có tài liệu đính kèm.</p>
      )}

      <form ref={formRef} className="space-y-3">
        {typesToShow.map((t) => {
          const files = byKind[t.label] ?? [];
          return (
            <div key={t.key} className="rounded-xl border border-slate-200 p-3">
              <div className="mb-1.5 text-sm font-semibold text-slate-700">{t.label}</div>

              {files.length > 0 ? (
                <ul className="mb-2 space-y-1.5">
                  {files.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                      <a
                        href={`/api/attachments/${a.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="min-w-0 flex-1 truncate text-brand-600 hover:underline"
                      >
                        {a.file_name}
                      </a>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => del(a.id)}
                          disabled={pending}
                          className="shrink-0 text-xs font-medium text-rose-500 hover:underline"
                        >
                          Xóa
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                canManage && <p className="mb-2 text-xs text-slate-400">Chưa có tệp.</p>
              )}

              {canManage && (
                <input
                  type="file"
                  name={`files_${t.key}`}
                  multiple
                  onChange={(e) => setPicked((p) => ({ ...p, [t.key]: e.target.files?.length ?? 0 }))}
                  className={fileCls}
                />
              )}
            </div>
          );
        })}
      </form>

      {canManage && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className={`text-xs ${totalPicked > 0 ? "text-emerald-600" : "text-slate-400"}`}>
            {totalPicked > 0 ? `Đã chọn ${totalPicked} tệp` : "Chọn tệp theo từng loại"}
          </span>
          <Button disabled={pending || totalPicked === 0} onClick={upload}>
            {pending ? "Đang tải lên…" : "Tải lên"}
          </Button>
        </div>
      )}
    </Card>
  );
}
