"use client";
import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addCommentAction, deleteCommentAction } from "@/actions/comment";
import { Card, Button, inputCls } from "@/components/ui";

export interface CommentItem {
  id: number;
  author_id: number | null;
  author_name: string | null;
  body: string;
  created_at: string;
}

/**
 * Bình luận ĐỘC LẬP trên chứng từ — tách khỏi lịch sử phê duyệt, KHÔNG đổi
 * trạng thái. Hiển thị xuyên suốt vòng đời (mọi trạng thái). Ai xem được chứng
 * từ đều bình luận được; xóa chỉ dành cho tác giả hoặc Admin.
 */
export function CommentPanel({
  documentType,
  documentId,
  comments,
  currentUserId,
  isAdmin = false,
}: {
  documentType: "PR" | "PO" | "Invoice";
  documentId: number;
  comments: CommentItem[];
  currentUserId?: number | null;
  isAdmin?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const fmt = (s: string) => {
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : d.toLocaleString("vi-VN");
  };

  return (
    <Card className="p-5">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">💬 Bình luận</h3>

      <ul className="mb-3 space-y-3">
        {comments.map((c) => {
          const canDelete = isAdmin || (currentUserId != null && c.author_id === currentUserId);
          return (
            <li key={c.id} className="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-700">{c.author_name ?? "—"}</span>
                <span className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400" suppressHydrationWarning>{fmt(c.created_at)}</span>
                  {canDelete && (
                    <button
                      onClick={() =>
                        start(async () => {
                          const res = await deleteCommentAction(c.id);
                          if (!res.ok) alert(res.error ?? "Không xóa được bình luận.");
                          else router.refresh();
                        })
                      }
                      disabled={pending}
                      title="Xóa bình luận"
                      className="text-xs text-rose-400 transition hover:text-rose-600 disabled:opacity-40"
                    >
                      ✕
                    </button>
                  )}
                </span>
              </div>
              <div className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">{c.body}</div>
            </li>
          );
        })}
        {comments.length === 0 && <li className="text-xs text-slate-400">Chưa có bình luận nào.</li>}
      </ul>

      <form
        ref={formRef}
        action={(fd) =>
          start(async () => {
            await addCommentAction(fd);
            formRef.current?.reset();
            router.refresh();
          })
        }
        className="space-y-2 border-t border-slate-100 pt-3"
      >
        <input type="hidden" name="document_type" value={documentType} />
        <input type="hidden" name="document_id" value={documentId} />
        <textarea
          name="body"
          required
          placeholder="Viết bình luận…"
          className={`${inputCls} h-20`}
        />
        <Button type="submit" disabled={pending} className="w-full justify-center">
          {pending ? "Đang gửi…" : "Gửi bình luận"}
        </Button>
      </form>
    </Card>
  );
}
