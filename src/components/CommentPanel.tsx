"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addCommentAction, deleteCommentAction } from "@/actions/comment";
import { Card, Button, inputCls } from "@/components/ui";
import { useToast } from "@/components/Toast";

export interface CommentItem {
  id: number;
  author_id: number | null;
  author_name: string | null;
  body: string;
  created_at: string;
}

export interface MentionUser {
  id: number;
  name: string;
}

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Bình luận trên chứng từ + @NHẮC TÊN. Gõ "@" để chọn thành viên; người được
 * nhắc nhận thông báo (chuông ở header). Xóa chỉ dành cho tác giả hoặc Admin.
 */
export function CommentPanel({
  documentType,
  documentId,
  comments,
  currentUserId,
  isAdmin = false,
  mentionUsers = [],
}: {
  documentType: "PR" | "PO" | "Invoice";
  documentId: number;
  comments: CommentItem[];
  currentUserId?: number | null;
  isAdmin?: boolean;
  mentionUsers?: MentionUser[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const [value, setValue] = useState("");
  const [picked, setPicked] = useState<MentionUser[]>([]);
  const [menu, setMenu] = useState<{ open: boolean; query: string; start: number }>({ open: false, query: "", start: 0 });

  const fmt = (s: string) => {
    const d = new Date(s);
    return isNaN(d.getTime()) ? s : d.toLocaleString("vi-VN");
  };

  // Tô đậm các @Tên đã biết trong nội dung bình luận.
  const nameRe = useMemo(() => {
    const names = mentionUsers.map((u) => u.name).filter(Boolean).sort((a, b) => b.length - a.length);
    if (names.length === 0) return null;
    return new RegExp(`@(${names.map(esc).join("|")})`, "g");
  }, [mentionUsers]);

  const renderBody = (body: string) => {
    if (!nameRe) return body;
    const out: React.ReactNode[] = [];
    let last = 0;
    for (const m of body.matchAll(nameRe)) {
      const i = m.index ?? 0;
      if (i > last) out.push(body.slice(last, i));
      out.push(<span key={i} className="rounded bg-brand-50 px-1 font-medium text-brand-600">{m[0]}</span>);
      last = i + m[0].length;
    }
    if (last < body.length) out.push(body.slice(last));
    return out;
  };

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setValue(v);
    const caret = e.target.selectionStart ?? v.length;
    const m = v.slice(0, caret).match(/@([^@\s]*)$/);
    if (m && mentionUsers.length > 0) setMenu({ open: true, query: m[1], start: caret - m[1].length - 1 });
    else setMenu({ open: false, query: "", start: 0 });
  }

  const suggestions = useMemo(() => {
    if (!menu.open) return [];
    const q = norm(menu.query);
    return mentionUsers.filter((u) => norm(u.name).includes(q)).slice(0, 6);
  }, [menu, mentionUsers]);

  function pick(u: MentionUser) {
    const caret = taRef.current?.selectionStart ?? value.length;
    const before = value.slice(0, menu.start);
    const after = value.slice(caret);
    const next = `${before}@${u.name} ${after}`;
    setValue(next);
    setPicked((p) => (p.some((x) => x.id === u.id) ? p : [...p, u]));
    setMenu({ open: false, query: "", start: 0 });
    requestAnimationFrame(() => taRef.current?.focus());
  }

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
                          if (!res.ok) toast(res.error ?? "Không xóa được bình luận.", "error");
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
              <div className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">{renderBody(c.body)}</div>
            </li>
          );
        })}
        {comments.length === 0 && <li className="text-xs text-slate-400">Chưa có bình luận nào.</li>}
      </ul>

      <form
        ref={formRef}
        action={(fd) =>
          start(async () => {
            const ids = picked.filter((u) => value.includes(`@${u.name}`)).map((u) => u.id);
            fd.set("mentions", JSON.stringify(ids));
            await addCommentAction(fd);
            setValue("");
            setPicked([]);
            setMenu({ open: false, query: "", start: 0 });
            formRef.current?.reset();
            router.refresh();
          })
        }
        className="space-y-2 border-t border-slate-100 pt-3"
      >
        <input type="hidden" name="document_type" value={documentType} />
        <input type="hidden" name="document_id" value={documentId} />
        <div className="relative">
          <textarea
            ref={taRef}
            name="body"
            required
            value={value}
            onChange={onChange}
            placeholder={mentionUsers.length > 0 ? "Viết bình luận… gõ @ để nhắc tên đồng nghiệp" : "Viết bình luận…"}
            className={`${inputCls} h-20`}
          />
          {menu.open && suggestions.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-52 w-64 overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
              {suggestions.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); pick(u); }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-[11px] font-bold text-white">{u.name.charAt(0)}</span>
                    {u.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Button type="submit" disabled={pending} className="w-full justify-center">
          {pending ? "Đang gửi…" : "Gửi bình luận"}
        </Button>
      </form>
    </Card>
  );
}
