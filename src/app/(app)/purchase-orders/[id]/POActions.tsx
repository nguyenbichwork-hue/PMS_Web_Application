"use client";
import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { approvePOAction, sendPOAction, confirmPOAction, cancelPOAction } from "@/actions/po";
import { Card, Button } from "@/components/ui";

export function POActions({
  poId,
  status,
  canManage,
}: {
  poId: number;
  status: string;
  canManage: boolean;
}) {
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);
  const router = useRouter();

  const run = (fn: () => Promise<void>) => () =>
    start(async () => {
      await fn();
      router.refresh();
    });

  return (
    <Card className="p-5">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">Thao tác</h3>
      <div className="space-y-2">
        <Button
          variant="secondary"
          className="w-full justify-center"
          onClick={() => window.open(`/print/purchase-order/${poId}`, "_blank")}
        >
          ⬇ Xuất PDF / In
        </Button>

        {canManage && status === "Draft" && (
          <Button className="w-full justify-center" disabled={pending} onClick={run(() => approvePOAction(poId))}>
            ✓ Duyệt PO
          </Button>
        )}
        {canManage && ["Approved", "Draft"].includes(status) && (
          <Button
            variant="secondary"
            className="w-full justify-center"
            disabled={pending}
            onClick={() => {
              start(async () => {
                await sendPOAction(poId);
                setSent(true);
                router.refresh();
              });
            }}
          >
            ✉ Send Email Supplier
          </Button>
        )}
        {sent && (
          <p className="rounded-lg bg-emerald-50 p-2 text-xs text-emerald-700">
            Đã gửi PO tới nhà cung cấp (demo: mô phỏng gửi email).
          </p>
        )}

        {canManage && status === "Sent" && (
          <Button variant="secondary" className="w-full justify-center" disabled={pending} onClick={run(() => confirmPOAction(poId))}>
            ✔ NCC xác nhận
          </Button>
        )}
        {canManage && ["Draft", "Approved", "Sent", "Confirmed"].includes(status) && (
          <Button
            variant="danger"
            className="w-full justify-center"
            disabled={pending}
            onClick={() => {
              const reason = window.prompt("Lý do hủy PO:");
              if (!reason) return;
              start(async () => {
                await cancelPOAction(poId, reason);
                router.refresh();
              });
            }}
          >
            ✕ Hủy PO
          </Button>
        )}
      </div>
    </Card>
  );
}
