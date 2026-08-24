"use client";
import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { approvePOAction, sendPOAction, confirmPOAction, cancelPOAction } from "@/actions/po";
import { Card, Button } from "@/components/ui";

export function POActions({
  poId,
  status,
  canManage,
  canApprove,
}: {
  poId: number;
  status: string;
  canManage: boolean;
  canApprove: boolean;
}) {
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);
  const router = useRouter();

  const run = (fn: () => Promise<void>) => () =>
    start(async () => {
      await fn();
      router.refresh();
    });

  const canCancel = canManage && ["Draft", "Approved", "Sent", "Confirmed"].includes(status);

  return (
    <Card className="p-5">
      <h3 className="mb-3 text-base font-semibold text-slate-800">Thao tác</h3>
      <div className="space-y-2">
        {/* Hành động chính: duyệt đơn hàng */}
        {canApprove && status === "Draft" && (
          <Button className="w-full justify-center" disabled={pending} onClick={run(() => approvePOAction(poId))}>
            Duyệt đơn hàng
          </Button>
        )}
        {canApprove && status === "Draft" && (
          <p className="px-0.5 text-xs text-slate-400">Duyệt xong hệ thống tự tạo Đề nghị thanh toán.</p>
        )}

        {/* Điều hướng trực tiếp bằng thẻ <a target=_blank> — KHÔNG dùng window.open()
            (popup do script mở dễ bị trình chặn popup chặn im lặng → máy khác bấm không thấy gì). */}
        <a
          href={`/print/purchase-order/${poId}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
        >
          🖨 Xuất PDF / In
        </a>

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
            Gửi cho nhà cung cấp
          </Button>
        )}
        {sent && (
          <p className="rounded-lg bg-emerald-50 p-2 text-xs text-emerald-700">
            Đã gửi PO tới nhà cung cấp (demo: mô phỏng gửi email).
          </p>
        )}

        {canManage && status === "Sent" && (
          <Button variant="secondary" className="w-full justify-center" disabled={pending} onClick={run(() => confirmPOAction(poId))}>
            Nhà cung cấp xác nhận
          </Button>
        )}

        {canCancel && (
          <div className="border-t border-slate-100 pt-2">
            <Button
              variant="danger"
              className="w-full justify-center"
              disabled={pending}
              onClick={() => {
                const reason = window.prompt("Lý do hủy đơn hàng:");
                if (!reason) return;
                start(async () => {
                  await cancelPOAction(poId, reason);
                  router.refresh();
                });
              }}
            >
              Hủy đơn hàng
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
