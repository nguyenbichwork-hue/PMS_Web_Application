"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { syncMisaAction } from "@/actions/misa";
import { Card, Button, Th, Td } from "@/components/ui";
import { date } from "@/lib/format";

interface StateRow {
  data_type: number;
  label: string | null;
  last_count: number;
  last_run: string | null;
  last_sync_time: string | null;
}

export function MisaPanel({ mode, state }: { mode: "live" | "mock"; state: StateRow[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  const live = mode === "live";

  const run = () =>
    start(async () => {
      setMsg(null);
      setErr(null);
      try {
        const res = await syncMisaAction();
        setMsg(`Đồng bộ ${res.total} bản ghi từ MISA (${res.mode === "live" ? "dữ liệu thật" : "mock"}).`);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Đồng bộ thất bại");
      }
    });

  return (
    <Card className="mb-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <span>🔗</span> MISA AMIS Kế toán — nguồn Master Data
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Danh mục Nhà cung cấp · Hàng hóa · ĐVT · Kho · Phòng ban được đồng bộ từ MISA (upsert theo mã).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              live ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            }`}
          >
            {live ? "● Đã kết nối MISA" : "● Chế độ mock (chưa cấu hình)"}
          </span>
          <Button onClick={run} disabled={pending}>
            {pending ? "Đang đồng bộ…" : "Đồng bộ từ MISA"}
          </Button>
        </div>
      </div>

      {msg && <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</div>}
      {err && <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</div>}

      {!live && (
        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Đang dùng dữ liệu mock. Để nối MISA thật, đặt trong <code>.env.local</code>:{" "}
          <code>MISA_APP_ID</code>, <code>MISA_ACCESS_CODE</code>, <code>MISA_ORG_COMPANY_CODE</code>{" "}
          (tùy chọn <code>MISA_BASE_URL</code>).
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full">
          <thead>
            <tr>
              <Th>Danh mục</Th>
              <Th>Số bản ghi</Th>
              <Th>Đồng bộ lần cuối</Th>
            </tr>
          </thead>
          <tbody>
            {state.map((r) => (
              <tr key={r.data_type} className="hover:bg-slate-50">
                <Td className="font-medium">{r.label ?? `data_type ${r.data_type}`}</Td>
                <Td>{r.last_count}</Td>
                <Td className="whitespace-nowrap text-xs">{r.last_run ? date(r.last_run) : "—"}</Td>
              </tr>
            ))}
            {state.length === 0 && (
              <tr>
                <Td className="text-slate-400">Chưa đồng bộ lần nào.</Td>
                <Td />
                <Td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
