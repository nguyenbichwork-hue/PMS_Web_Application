"use client";
import { useMemo, useState } from "react";
import { Modal } from "./Modal";
import { inputCls } from "./ui";

/** Chuẩn hóa tìm kiếm: bỏ hoa/thường & dấu tiếng Việt (kể cả "đ"). */
const norm = (s: string) =>
  s.toLowerCase().replace(/đ/g, "d").normalize("NFD").replace(/[̀-ͯ]/g, "");

export interface PickerColumn<T> {
  header: string;
  /** Nội dung hiển thị của ô. */
  cell: (row: T) => React.ReactNode;
  /** class riêng cho ô (căn phải cho số…). */
  className?: string;
}

/**
 * Bảng chọn từ danh mục — hiện ĐẦY ĐỦ chi tiết dạng bảng cho dễ chọn.
 * Có ô tìm kiếm (không dấu), bấm một dòng để chọn. Không giới hạn số dòng
 * (khác combobox chỉ hiện 60 dòng), cuộn trong modal.
 */
export function CatalogPicker<T>({
  open,
  onClose,
  title,
  rows,
  columns,
  searchText,
  rowKey,
  selectedKey,
  onPick,
  searchPlaceholder = "Tìm theo mã / tên…",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  rows: T[];
  columns: PickerColumn<T>[];
  /** Chuỗi để so khớp khi tìm kiếm (gộp mã + tên + …). */
  searchText: (row: T) => string;
  rowKey: (row: T) => string | number;
  selectedKey?: string | number | null;
  onPick: (row: T) => void;
  searchPlaceholder?: string;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const nq = norm(q.trim());
    if (!nq) return rows;
    return rows.filter((r) => norm(searchText(r)).includes(nq));
  }, [rows, q, searchText]);

  return (
    <Modal open={open} onClose={onClose} title={title} widthClass="max-w-3xl">
      <div className="flex flex-col gap-3">
        <input
          autoFocus
          className={inputCls}
          placeholder={searchPlaceholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="max-h-[60vh] overflow-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {columns.map((c) => (
                  <th key={c.header} className={`whitespace-nowrap px-3 py-2 font-semibold ${c.className ?? ""}`}>
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-6 text-center text-slate-400">
                    Không tìm thấy mục phù hợp.
                  </td>
                </tr>
              )}
              {filtered.map((r) => {
                const key = rowKey(r);
                const isSel = selectedKey != null && key === selectedKey;
                return (
                  <tr
                    key={key}
                    onClick={() => { onPick(r); onClose(); }}
                    className={`cursor-pointer border-t border-slate-100 transition hover:bg-brand-50 ${
                      isSel ? "bg-brand-50/70 font-semibold text-brand-700" : "text-slate-700"
                    }`}
                  >
                    {columns.map((c) => (
                      <td key={c.header} className={`px-3 py-2 align-top ${c.className ?? ""}`}>
                        {c.cell(r)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="text-[12px] text-slate-400">
          Hiện {filtered.length}/{rows.length} mục · bấm một dòng để chọn.
        </div>
      </div>
    </Modal>
  );
}
