"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitPRQAction, approvePRQAction, cancelPRQAction } from "@/actions/prq";
import { Card, Button } from "@/components/ui";

export function PRQActions({
  prqId,
  status,
  canManage,
  canApprove,
}: {
  prqId: number;
  status: string;
  canManage: boolean;
  canApprove: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<void>) => () => start(async () => { await fn(); router.refresh(); });

  const showAny =
    (canManage && ["Draft", "Submitted", "Approved"].includes(status)) ||
    (canApprove && status === "Submitted");
  if (!showAny) return null;

  return (
    <Card className="p-5">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">Thao tác</h3>
      <div className="space-y-2">
        {canManage && status === "Draft" && (
          <Button className="w-full justify-center" disabled={pending} onClick={run(() => submitPRQAction(prqId))}>
            Gửi duyệt
          </Button>
        )}
        {canApprove && status === "Submitted" && (
          <Button className="w-full justify-center" disabled={pending} onClick={run(() => approvePRQAction(prqId))}>
            Duyệt thanh toán
          </Button>
        )}
        {canManage && ["Draft", "Submitted", "Approved"].includes(status) && (
          <div className="border-t border-slate-100 pt-2">
            <Button
              variant="danger"
              className="w-full justify-center"
              disabled={pending}
              onClick={() => {
                const reason = window.prompt("Lý do hủy đề nghị thanh toán:");
                if (reason === null) return;
                start(async () => { await cancelPRQAction(prqId, reason); router.refresh(); });
              }}
            >
              Hủy đề nghị
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
