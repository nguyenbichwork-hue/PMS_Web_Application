"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPRQPaymentAction } from "@/actions/prq";
import { Button, Field, inputCls } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { money } from "@/lib/format";

/**
 * Nút "Chi tiền" + modal GHI NHẬN CHI TỪNG PHẦN cho PRQ đã duyệt (feedback 20/08/2026).
 * Mỗi lần nhập số tiền tùy ý (mặc định = số còn lại); chi ĐỦ tổng thì PRQ chuyển 'Paid'.
 * Dùng chung ở trang chi tiết PRQ và hàng đợi Kế toán.
 *   fullWidth : nút chiếm hết chiều ngang (dùng trong khối Thao tác dọc).
 *   summary   : dòng tóm tắt hiện trong modal (số đề nghị · NCC · số tiền).
 *   remaining : số tiền CÒN LẠI phải chi của PRQ (mặc định điền vào ô số tiền).
 */
export function MarkPaidModal({ prqId, fullWidth, summary, remaining }: { prqId: number; fullWidth?: boolean; summary?: string; remaining: number }) {
  const [open, setOpen] = useState(false);
  const [ref, setRef] = useState("");
  const [amount, setAmount] = useState<string>(remaining > 0 ? String(Math.round(remaining)) : "");
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const submit = () => {
    const amt = Number(amount);
    if (!(amt > 0)) { toast("Nhập số tiền chi lớn hơn 0.", "error"); return; }
    if (amt > remaining + 0.5) { toast(`Số tiền chi vượt số còn lại (${money(remaining)}).`, "error"); return; }
    start(async () => {
      try {
        await addPRQPaymentAction(prqId, amt, ref);
        setOpen(false);
        setRef("");
        router.refresh();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Không ghi nhận được khoản chi.", "error");
      }
    });
  };

  const openModal = () => { setAmount(remaining > 0 ? String(Math.round(remaining)) : ""); setOpen(true); };

  return (
    <>
      <Button className={fullWidth ? "w-full justify-center" : undefined} onClick={openModal}>
        Chi tiền
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Ghi nhận chi tiền"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Hủy</Button>
            <Button loading={pending} onClick={submit}>Xác nhận chi</Button>
          </>
        }
      >
        <div className="space-y-4">
          {summary && (
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{summary}</div>
          )}
          <div className="rounded-xl bg-teal-50 px-4 py-2.5 text-sm text-teal-700">
            Còn phải chi: <b>{money(remaining)}</b>
          </div>
          <Field label="Số tiền chi lần này">
            <input
              autoFocus
              type="number"
              min={0}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              placeholder="VD: 30000000"
              className={inputCls}
            />
          </Field>
          <Field label="Số lệnh chi / ủy nhiệm chi (UNC)">
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              placeholder="VD: UNC-2026-0123 — có thể bỏ trống"
              className={inputCls}
            />
          </Field>
          <p className="text-xs text-slate-400">
            Ghi nhận một khoản chi cho đề nghị này. Chi đủ tổng thì đề nghị tự chuyển <b>đã chi xong</b>. Ngày chi ghi theo hôm nay; người chi là bạn.
          </p>
        </div>
      </Modal>
    </>
  );
}
