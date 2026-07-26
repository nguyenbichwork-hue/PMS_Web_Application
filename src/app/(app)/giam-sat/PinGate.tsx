"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { unlockMonitorAction } from "@/actions/monitor";
import { Card, Button, inputCls } from "@/components/ui";

/** Ô nhập PIN để mở trang giám sát (Dung lượng / Truy cập / Nhật ký). */
export function MonitorPinGate({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="mx-auto mt-10 max-w-sm">
      <Card className="p-6">
        <div className="mb-1 flex items-center gap-2 text-slate-800">
          <span className="text-xl">🔒</span>
          <h1 className="text-lg font-bold">Khu vực giám sát</h1>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          Nhập mã PIN để xem Dung lượng, Truy cập và Nhật ký hệ thống.
        </p>

        {!configured && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-700">
            Chưa cấu hình PIN. Đặt biến môi trường <code className="rounded bg-amber-100 px-1">ADMIN_AUDIT_PIN</code> rồi thử lại.
          </p>
        )}

        <form
          ref={formRef}
          action={(fd) =>
            start(async () => {
              setErr(null);
              const r = await unlockMonitorAction(fd);
              if (!r.ok) setErr(r.error ?? "Không mở được.");
              else router.refresh();
            })
          }
          className="space-y-3"
        >
          <input
            name="pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            placeholder="Mã PIN"
            className={`${inputCls} text-center text-lg tracking-[0.4em]`}
          />
          {err && <p className="text-[13px] text-rose-600">{err}</p>}
          <Button type="submit" disabled={pending || !configured} className="w-full justify-center">
            {pending ? "Đang kiểm tra…" : "Mở khóa"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
