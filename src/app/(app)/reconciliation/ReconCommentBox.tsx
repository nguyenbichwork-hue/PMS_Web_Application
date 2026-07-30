"use client";
import { useEffect, useState, useTransition } from "react";
import { listCommentsAction, addCommentAction, deleteCommentAction } from "@/actions/comment";
import { Button, inputCls } from "@/components/ui";

interface CommentRow {
  id: number;
  author_id: number | null;
  author_name: string | null;
  body: string;
  created_at: string;
}

/**
 * Bình luận trao đổi ngay trên dòng ĐỐI CHIẾU (gắn với hóa đơn). Tự tải khi mở
 * dòng, tự làm mới sau khi gửi/xóa — dùng để ghi chú vì sao lệch, ai xử lý.
 */
export function ReconCommentBox({
  invoiceId,
  currentUserId,
  isAdmin,
}: {
  invoiceId: number;
  currentUserId?: number | null;
  isAdmin?: boolean;
}) {
  const [comments, setComments] = useState<CommentRow[] | null>(null);
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();

  const load = () =>
    listCommentsAction("Invoice", invoiceId)
      .then((r) => setComments(r as CommentRow[]))
      .catch(() => setComments([]));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  const fmt = (s: string) => {
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : d.toLocaleString("vi-VN");
  };

  const add = () => {
    if (!value.trim()) return;
    start(async () => {
      const fd = new FormData();
      fd.set("document_type", "Invoice");
      fd.set("document_id", String(invoiceId));
      fd.set("body", value.trim());
      fd.set("mentions", "[]");
      try {
        await addCommentAction(fd);
        setValue("");
        await load();
      } catch (e) {
        alert((e as Error)?.message || "Lỗi khi gửi bình luận.");
      }
    });
  };

  const del = (id: number) =>
    start(async () => {
      const r = await deleteCommentAction(id);
      if (!r.ok) alert(r.error ?? "Không xóa được bình luận.");
      else await load();
    });

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 text-xs font-semibold text-slate-600">Bình luận đối chiếu</div>

      {comments === null ? (
        <p className="text-xs text-slate-400">Đang tải bình luận…</p>
      ) : (
        <ul className="mb-2 space-y-2">
          {comments.map((c) => {
            const canDelete = isAdmin || (currentUserId != null && c.author_id === currentUserId);
            return (
              <li key={c.id} className="rounded-md border border-slate-100 bg-slate-50/60 px-2.5 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-700">{c.author_name ?? "—"}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400" suppressHydrationWarning>{fmt(c.created_at)}</span>
                    {canDelete && (
                      <button
                        onClick={() => del(c.id)}
                        disabled={pending}
                        className="text-[11px] text-rose-400 hover:text-rose-600 disabled:opacity-40"
                        title="Xóa bình luận"
                      >
                        Xóa
                      </button>
                    )}
                  </span>
                </div>
                <div className="mt-0.5 whitespace-pre-wrap break-words text-xs text-slate-600">{c.body}</div>
              </li>
            );
          })}
          {comments.length === 0 && <li className="text-xs text-slate-400">Chưa có bình luận nào.</li>}
        </ul>
      )}

      <div className="flex items-start gap-2">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Viết bình luận về đối chiếu này…"
          className={`${inputCls} h-16 flex-1`}
        />
        <Button onClick={add} disabled={pending || !value.trim()} className="shrink-0 self-stretch">
          {pending ? "Đang gửi…" : "Gửi"}
        </Button>
      </div>
    </div>
  );
}
