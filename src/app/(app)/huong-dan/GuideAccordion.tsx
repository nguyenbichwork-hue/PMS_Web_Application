"use client";
import { useState } from "react";
import { Card } from "@/components/ui";
import { Icon } from "@/components/icons";

// Danh mục hướng dẫn dạng "bấm để mở" (accordion). Mỗi mục là 1 phần của hệ thống;
// bấm vào tiêu đề thì bung nội dung chi tiết bên dưới. Nội dung (content) được
// dựng sẵn ở server component (huong-dan/page.tsx) rồi truyền xuống — ở đây chỉ lo
// đóng/mở. Cho phép mở nhiều mục cùng lúc.
const TILE: Record<string, string> = {
  slate: "bg-slate-500/12 text-slate-500 dark:text-slate-300",
  violet: "bg-violet-500/12 text-violet-500 dark:text-violet-300",
  amber: "bg-amber-500/12 text-amber-600 dark:text-amber-300",
  emerald: "bg-emerald-500/12 text-emerald-500 dark:text-emerald-300",
  indigo: "bg-indigo-500/12 text-indigo-500 dark:text-indigo-300",
  teal: "bg-teal-500/12 text-teal-500 dark:text-teal-300",
  cyan: "bg-cyan-500/12 text-cyan-500 dark:text-cyan-300",
  rose: "bg-rose-500/12 text-rose-500 dark:text-rose-300",
};

export interface GuideItem {
  id: string;
  icon: string;
  tone: string;
  title: string;
  summary?: string;
  content: React.ReactNode;
}

export function GuideAccordion({ items }: { items: GuideItem[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  return (
    <div className="grid gap-3">
      {items.map((it) => {
        const isOpen = !!open[it.id];
        return (
          <Card key={it.id} className="overflow-hidden p-0">
            <button
              type="button"
              onClick={() => toggle(it.id)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.03]"
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TILE[it.tone] ?? TILE.slate}`}>
                <Icon name={it.icon} size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-bold text-slate-900 dark:text-slate-100">{it.title}</span>
                {it.summary && <span className="mt-0.5 block truncate text-[13px] text-slate-500">{it.summary}</span>}
              </span>
              <svg
                className={`h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
              >
                <path d="M5 7.5 10 12.5 15 7.5" />
              </svg>
            </button>
            {isOpen && (
              <div className="space-y-2.5 border-t border-slate-100 px-5 pb-5 pt-4 text-[15px] leading-relaxed text-slate-600 dark:border-white/[0.06] dark:text-slate-300">
                {it.content}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
