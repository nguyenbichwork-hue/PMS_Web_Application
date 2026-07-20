"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitPRAction } from "@/actions/pr";
import { Card, Button } from "@/components/ui";

export function SubmitButton({ prId }: { prId: number }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Card className="p-5">
      <h3 className="mb-2 text-sm font-semibold text-slate-700">PR đang ở trạng thái nháp</h3>
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            await submitPRAction(prId);
            router.refresh();
          })
        }
      >
        Gửi phê duyệt
      </Button>
    </Card>
  );
}
