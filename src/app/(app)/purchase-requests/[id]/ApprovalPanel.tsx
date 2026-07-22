"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approvePRAction, rejectPRAction, reopenPRAction } from "@/actions/pr";
import { Card, Button, inputCls } from "@/components/ui";

/** Hook nhỏ: chạy 1 action, refresh khi xong, hiện lỗi nếu có. */
function useAction() {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<void>) => () => {
    setErr(null);
    start(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Có lỗi xảy ra");
      }
    });
  };
  return { err, pending, run };
}

export function ApprovalPanel({ prId }: { prId: number }) {
  const [comment, setComment] = useState("");
  const { err, pending, run } = useAction();

  return (
    <Card className="border-amber-200 bg-amber-50 p-5">
      <h3 className="mb-2 text-sm font-semibold text-amber-800">Bạn cần phê duyệt PR này</h3>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Lý do duyệt/từ chối (ghi vào lịch sử duyệt)…"
        className={`${inputCls} mb-3 h-20`}
      />
      {err && <p className="mb-2 text-sm text-rose-600">{err}</p>}
      <div className="flex gap-2">
        <Button disabled={pending} onClick={run(() => approvePRAction(prId, comment))}>
          ✓ Duyệt
        </Button>
        <Button variant="danger" disabled={pending} onClick={run(() => rejectPRAction(prId, comment))}>
          ✕ Từ chối
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-amber-700/70">Trao đổi chung dùng phần 💬 Bình luận bên dưới (không đổi trạng thái).</p>
    </Card>
  );
}

/** Mở lại PR đã bị từ chối → đưa về chờ duyệt (duyệt lại từ đầu). */
export function ReopenButton({ prId }: { prId: number }) {
  const [reason, setReason] = useState("");
  const { err, pending, run } = useAction();

  return (
    <Card className="border-sky-200 bg-sky-50 p-5">
      <h3 className="mb-2 text-sm font-semibold text-sky-800">PR đã bị từ chối</h3>
      <p className="mb-2 text-xs text-sky-700/80">Mở lại để trình duyệt lại từ đầu (trạng thái → Chờ duyệt).</p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Lý do mở lại (tùy chọn)…"
        className={`${inputCls} mb-3 h-16`}
      />
      {err && <p className="mb-2 text-sm text-rose-600">{err}</p>}
      <Button disabled={pending} onClick={run(() => reopenPRAction(prId, reason))}>
        ↻ Mở lại PR
      </Button>
    </Card>
  );
}
