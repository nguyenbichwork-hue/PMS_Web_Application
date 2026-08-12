"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markPRQPaidAction } from "@/actions/prq";
import { Button, Field, inputCls } from "@/components/ui";
import { Modal } from "@/components/Modal";

/**
 * Nút "Đã chuyển tiền" + modal xác nhận chi tiền cho PRQ (Approved → Paid).
 * Dùng chung ở trang chi tiết PRQ và hàng đợi Kế toán.
 *   fullWidth : nút chiếm hết chiều ngang (dùng trong khối Thao tác dọc).
 *   summary   : dòng tóm tắt hiện trong modal (số đề nghị · NCC · số tiền).
 */
export function MarkPaidModal({ prqId, fullWidth, summary }: { prqId: number; fullWidth?: boolean; summary?: string }) {
  const [open, setOpen] = useState(false);
  const [ref, setRef] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const submit = () => start(async () => {
    await markPRQPaidAction(prqId, ref);
    setOpen(false);
    setRef("");
    router.refresh();
  });

  return (
    <>
      <Button className={fullWidth ? "w-full justify-center" : undefined} onClick={() => setOpen(true)}>
        Đã chuyển tiền
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Xác nhận đã chuyển tiền"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Hủy</Button>
            <Button loading={pending} onClick={submit}>Xác nhận đã chi</Button>
          </>
        }
      >
        <div className="space-y-4">
          {summary && (
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{summary}</div>
          )}
          <Field label="Số lệnh chi / ủy nhiệm chi (UNC)">
            <input
              autoFocus
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              placeholder="VD: UNC-2026-0123 — có thể bỏ trống"
              className={inputCls}
            />
          </Field>
          <p className="text-xs text-slate-400">
            Đánh dấu đề nghị thanh toán này là <b>đã chi</b>. Ngày chi ghi theo hôm nay; người chi là bạn.
          </p>
        </div>
      </Modal>
    </>
  );
}
