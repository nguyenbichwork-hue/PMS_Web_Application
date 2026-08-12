"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitPRQAction, approvePRQAction, rejectPRQAction, cancelPRQAction } from "@/actions/prq";
import { Card, Button } from "@/components/ui";
import { MarkPaidModal } from "@/components/MarkPaidModal";

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
    (canApprove && ["Submitted", "Approved"].includes(status));
  if (!showAny) return null;

  return (
    <Card className="p-5">
      <h3 className="mb-3 text-base font-semibold text-slate-800">Thao tác</h3>
      <div className="space-y-2">
        {canManage && status === "Draft" && (
          <Button className="w-full justify-center" loading={pending} onClick={run(() => submitPRQAction(prqId))}>
            Gửi duyệt
          </Button>
        )}
        {canApprove && status === "Submitted" && (
          <>
            <Button className="w-full justify-center" loading={pending} onClick={run(() => approvePRQAction(prqId))}>
              Duyệt thanh toán
            </Button>
            <Button
              variant="danger"
              className="w-full justify-center"
              loading={pending}
              onClick={() => {
                const reason = window.prompt("Lý do từ chối đề nghị thanh toán:");
                if (reason === null) return;
                start(async () => { await rejectPRQAction(prqId, reason); router.refresh(); });
              }}
            >
              Từ chối
            </Button>
          </>
        )}
        {canApprove && status === "Approved" && (
          <MarkPaidModal prqId={prqId} fullWidth />
        )}
        {canManage && ["Draft", "Submitted", "Approved"].includes(status) && (
          <div className="border-t border-slate-100 pt-2">
            <Button
              variant="danger"
              className="w-full justify-center"
              loading={pending}
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
