"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markPRQPaidAction } from "@/actions/prq";
import { Button } from "@/components/ui";

export function PayButton({ prqId }: { prqId: number }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      loading={pending}
      onClick={() => {
        const ref = window.prompt("Số lệnh chi / ủy nhiệm chi (UNC) — có thể bỏ trống:");
        if (ref === null) return; // Hủy
        start(async () => { await markPRQPaidAction(prqId, ref); router.refresh(); });
      }}
    >
      Đã chuyển tiền
    </Button>
  );
}
