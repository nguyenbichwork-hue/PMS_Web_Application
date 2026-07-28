"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importDocumentAction, type DocImportResult } from "@/actions/import-doc";
import { Button } from "@/components/ui";
import { Modal } from "@/components/Modal";
import type { DocKind } from "@/lib/import-doc";

const META: Record<DocKind, { title: string; entity: string; btn: string; hint: string }> = {
  pr: {
    title: "Nhập Yêu cầu mua hàng từ Excel",
    entity: "yêu cầu",
    btn: "Nhập Excel",
    hint:
      "File .xlsx: mỗi DÒNG là một dòng hàng. Bắt buộc có cột Tên hàng hóa và Số lượng. " +
      "Tùy chọn: Mã hàng, ĐVT, Đơn giá dự kiến, Thuế suất, NCC gợi ý, Ghi chú, và các cột phần đầu " +
      "(Mã công ty, Phòng ban, Mục đích, Độ ưu tiên, Ngày cần hàng). Muốn tạo NHIỀU phiếu trong một file, " +
      "thêm cột 'Mã phiếu' (hoặc 'Nhóm') — các dòng cùng mã sẽ gộp thành một phiếu. Tất cả tạo ở trạng thái Nháp.",
  },
  po: {
    title: "Nhập Đơn đặt hàng từ Excel",
    entity: "đơn",
    btn: "Nhập Excel",
    hint:
      "File .xlsx: mỗi DÒNG là một dòng hàng. Bắt buộc có cột Nhà cung cấp (mã / tên / MST), Tên hàng hóa và Số lượng. " +
      "Tùy chọn: Mã hàng, ĐVT, Đơn giá, Chiết khấu, Thuế suất, Ghi chú, và các cột phần đầu " +
      "(Mã công ty, Ngày đặt hàng, Điều khoản thanh toán, Loại tiền). Muốn tạo NHIỀU đơn trong một file, " +
      "thêm cột 'Mã đơn' (hoặc 'Nhóm'). Tất cả tạo ở trạng thái Nháp.",
  },
};

export function DocImport({ kind, variant = "light" }: { kind: DocKind; variant?: "banner" | "light" }) {
  const meta = META[kind];
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<DocImportResult | null>(null);
  const [fileName, setFileName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const submit = () => {
    const f = inputRef.current?.files?.[0];
    if (!f) { setResult({ ok: false, error: "Chưa chọn file Excel." }); return; }
    const fd = new FormData();
    fd.append("file", f);
    setResult(null);
    start(async () => {
      const res = await importDocumentAction(kind, fd);
      setResult(res);
      if (res.ok) router.refresh();
    });
  };

  const close = () => { setOpen(false); setResult(null); setFileName(""); };

  const btnCls =
    variant === "banner"
      ? "inline-flex items-center gap-2 rounded-xl bg-white/20 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/30 backdrop-blur transition hover:bg-white/30"
      : "inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50";

  return (
    <>
      <button onClick={() => setOpen(true)} className={btnCls}>{meta.btn}</button>

      <Modal
        open={open}
        onClose={close}
        title={meta.title}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={close}>{result?.ok ? "Đóng" : "Hủy"}</Button>
            <Button type="button" onClick={submit} disabled={pending}>{pending ? "Đang nhập…" : "Nhập dữ liệu"}</Button>
          </>
        }
      >
        <p className="mb-4 text-xs text-slate-500">{meta.hint}</p>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            📎 Chọn file .xlsx
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => { setFileName(e.target.files?.[0]?.name ?? ""); setResult(null); }}
            />
          </label>
          {fileName && <span className="max-w-[220px] truncate text-sm text-slate-500">{fileName}</span>}
        </div>

        {result && !result.ok && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">✕ {result.error}</div>
        )}

        {result && result.ok && (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              ✓ Nhập xong từ sheet <b>{result.sheetName}</b>: đã tạo{" "}
              <b className="text-emerald-700">{result.created}</b> {meta.entity} nháp ({result.lines} dòng hàng).
              {result.numbers && result.numbers.length > 0 && (
                <span className="mt-1 block text-xs text-emerald-700">
                  Số chứng từ: {result.numbers.slice(0, 12).join(", ")}
                  {result.numbers.length > 12 ? `… (+${result.numbers.length - 12})` : ""}
                </span>
              )}
            </div>
            {result.warnings && result.warnings.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <div className="mb-1 font-semibold">Ghi chú ({result.warnings.length}):</div>
                <ul className="list-disc space-y-0.5 pl-4">
                  {result.warnings.slice(0, 15).map((w, i) => <li key={i}>{w}</li>)}
                  {result.warnings.length > 15 && <li>… và {result.warnings.length - 15} dòng khác</li>}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
