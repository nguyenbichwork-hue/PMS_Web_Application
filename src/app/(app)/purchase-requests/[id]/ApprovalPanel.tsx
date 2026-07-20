"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approvePRAction, rejectPRAction } from "@/actions/pr";
import { Card, Button, inputCls } from "@/components/ui";

export function ApprovalPanel({ prId }: { prId: number }) {
  const [comment, setComment] = useState("");
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

  return (
    <Card className="border-amber-200 bg-amber-50 p-5">
      <h3 className="mb-2 text-sm font-semibold text-amber-800">Bạn cần phê duyệt PR này</h3>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Nhận xét (tùy chọn)…"
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
    </Card>
  );
}
