"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitPRQAction, approvePRQAction, rejectPRQAction, cancelPRQAction } from "@/actions/prq";
import { Card, Button } from "@/components/ui";
import { MarkPaidModal } from "@/components/MarkPaidModal";
import { useToast } from "@/components/Toast";
import { usePrqDirty } from "./DirtyContext";

export function PRQActions({
  prqId,
  status,
  canManage,
  isMyTurn,
  canPay,
  currentLevel,
  chainLength,
  pendingRoleLabel,
  approvesAll = false,
  remaining,
}: {
  prqId: number;
  status: string;
  canManage: boolean;
  isMyTurn: boolean;
  canPay: boolean;
  currentLevel: number;
  chainLength: number;
  pendingRoleLabel: string;
  approvesAll?: boolean;
  remaining: number;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const { dirty } = usePrqDirty();
  const run = (fn: () => Promise<void>) => () => start(async () => { await fn(); router.refresh(); });

  const showAny =
    (canManage && ["Draft", "Submitted", "Approved"].includes(status)) ||
    (isMyTurn && status === "Submitted") ||
    (canPay && status === "Approved");
  if (!showAny) return null;

  return (
    <Card className="p-5">
      <h3 className="mb-3 text-base font-semibold text-slate-800">Thao tác</h3>
      {status === "Submitted" && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Đang chờ duyệt cấp {Math.min(currentLevel + 1, chainLength)}/{chainLength}
          {pendingRoleLabel ? ` — ${pendingRoleLabel}` : ""}.
        </p>
      )}
      <div className="space-y-2">
        {canManage && status === "Draft" && (
          <Button
            className="w-full justify-center"
            loading={pending}
            onClick={() => {
              if (dirty) { toast("Bạn còn thay đổi chưa lưu. Vui lòng bấm 'Lưu' ở khối Thông tin thanh toán trước khi gửi duyệt.", "error"); return; }
              start(async () => {
                const res = await submitPRQAction(prqId);
                if (!res.ok) { toast(res.error ?? "Không gửi được đề nghị.", "error"); return; }
                router.refresh();
              });
            }}
          >
            Gửi duyệt
          </Button>
        )}
        {isMyTurn && status === "Submitted" && (
          <>
            <Button className="w-full justify-center" loading={pending} onClick={run(() => approvePRQAction(prqId))}>
              Duyệt thanh toán {chainLength > 1 ? (approvesAll ? `(cả ${chainLength} cấp)` : `(cấp ${currentLevel + 1}/${chainLength})`) : ""}
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
        {canPay && status === "Approved" && (
          <MarkPaidModal prqId={prqId} fullWidth remaining={remaining} />
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
