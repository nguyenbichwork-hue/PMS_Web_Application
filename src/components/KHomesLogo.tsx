// Logo thương hiệu K‑HOMÈS — dùng ảnh thật /public/logo.png (nền trong suốt,
// hợp cả nền sáng lẫn tối). Không gradient trong UI, giữ logo gốc của hãng.

export function KHomesLogo({
  size = 44,
  stacked = false,
  tagline,
}: {
  size?: number;
  stacked?: boolean;
  tagline?: string;
}) {
  return (
    <div className={stacked ? "flex flex-col items-center gap-3.5 text-center" : "flex items-center gap-3"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="K‑HOMÈS" style={{ height: size, width: "auto" }} className="block select-none" />
      {tagline && (
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">{tagline}</div>
      )}
    </div>
  );
}

/** Mark vuông gọn — nền cam đặc + biểu tượng nhà/K trắng (không gradient). */
export function KHomesMark({ size = 36 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-xl bg-brand-500"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 32 32" width={size * 0.6} height={size * 0.6} fill="none" aria-hidden>
        <path d="M4 15 L16 5 L28 15" stroke="white" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7 13.5 V26 H25 V13.5" stroke="white" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13.2 26 V18.5 H18.8 V26" stroke="white" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
