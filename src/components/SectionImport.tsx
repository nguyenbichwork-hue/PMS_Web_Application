"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importSectionAction, type SectionImportResult } from "@/actions/import-section";
import { Button } from "@/components/ui";
import { Modal } from "@/components/Modal";
import type { Section } from "@/lib/import-section";

const META: Record<Section, { title: string; entity: string; hint: string; btn: string }> = {
  suppliers: {
    title: "Nhập nhà cung cấp từ Excel",
    entity: "nhà cung cấp",
    btn: "⬆ Nhập Excel",
    hint: "File .xlsx có các cột: Mã nhà cung cấp, Tên nhà cung cấp, Địa chỉ, Mã số thuế, Điện thoại, Số tiền nợ… (hệ thống tự dò dòng tiêu đề). Trùng mã sẽ được cập nhật.",
  },
  products: {
    title: "Nhập hàng hóa / dịch vụ từ Excel",
    entity: "hàng hóa",
    btn: "⬆ Nhập Excel",
    hint: "File .xlsx có cột Mã và Tên (tùy chọn thêm ĐVT, Nhóm, Thuế suất). Hệ thống tự dò dòng tiêu đề. Trùng mã sẽ được cập nhật.",
  },
  users: {
    title: "Nhập người dùng từ Excel",
    entity: "người dùng",
    btn: "⬆ Nhập từ Excel",
    hint: "File .xlsx có cột Email và Họ tên (tùy chọn: Phòng ban, Vai trò, Mã công ty, Trạng thái). Vai trò nhận cả tiếng Việt (Nhân viên, Mua hàng, Quản lý, Kế toán, Quản trị). Tài khoản mới dùng mật khẩu mặc định 'password'. Trùng email sẽ được cập nhật (giữ nguyên mật khẩu).",
  },
};

export function SectionImport({ section, variant = "banner" }: { section: Section; variant?: "banner" | "light" }) {
  const meta = META[section];
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SectionImportResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [sync, setSync] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const canSync = section !== "users";

  const submit = () => {
    const f = inputRef.current?.files?.[0];
    if (!f) { setResult({ ok: false, error: "Chưa chọn file Excel." }); return; }
    if (sync && !confirm("Chế độ đồng bộ: các mục KHÔNG có trong file sẽ bị XÓA (hoặc chuyển Ngưng nếu đã có chứng từ). Tiếp tục?")) return;
    const fd = new FormData();
    fd.append("file", f);
    fd.append("sync", sync ? "1" : "0");
    setResult(null);
    start(async () => {
      const res = await importSectionAction(section, fd);
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

        {canSync && (
          <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <input type="checkbox" checked={sync} onChange={(e) => setSync(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-500" />
            <span className="text-xs text-slate-600">
              <b className="text-slate-700">Đồng bộ đầy đủ theo file</b> — mục KHÔNG có trong file sẽ bị <b className="text-rose-600">xóa</b> (hoặc chuyển <b>Ngưng</b> nếu đã phát sinh chứng từ). Bỏ chọn = chỉ thêm/cập nhật, không xóa gì.
            </span>
          </label>
        )}

        {result && !result.ok && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">✕ {result.error}</div>
        )}

        {result && result.ok && (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              ✓ Nhập xong từ sheet <b>{result.sheetName}</b>: <b className="text-emerald-700">{result.added}</b> thêm mới,{" "}
              <b className="text-indigo-700">{result.updated}</b> cập nhật (tổng {result.total} dòng {meta.entity}).
              {(result.removed || result.deactivated) ? (
                <span className="mt-1 block">
                  Đồng bộ: <b className="text-rose-600">{result.removed ?? 0}</b> đã xóa,{" "}
                  <b className="text-amber-600">{result.deactivated ?? 0}</b> chuyển Ngưng (không có trong file).
                </span>
              ) : null}
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
