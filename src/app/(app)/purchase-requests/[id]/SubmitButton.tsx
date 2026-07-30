"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitPRAction } from "@/actions/pr";
import { Card, Button } from "@/components/ui";

export function SubmitButton({ prId }: { prId: number }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  return (
    <Card className="p-5">
      <h3 className="mb-2 text-base font-semibold text-slate-800">PR đang ở trạng thái nháp</h3>
      {err && <p className="mb-2 text-sm text-rose-600">{err}</p>}
      <Button
        disabled={pending}
        onClick={() => {
          setErr(null);
          start(async () => {
            const res = await submitPRAction(prId);
            if (res && !res.ok) { setErr(res.error); return; }
            router.refresh();
          });
        }}
      >
        {pending ? "Đang gửi…" : "Gửi phê duyệt"}
      </Button>
    </Card>
  );
}
