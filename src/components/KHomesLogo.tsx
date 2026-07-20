// Logo thương hiệu K-Homès — SVG inline (sắc nét, co giãn, không cần file ảnh).
// Mark = ngôi nhà mảnh trong huy hiệu gradient tím/chàm; wordmark = "K-Homès".

export function KHomesMark({ size = 56 }: { size?: number }) {
  return (
    <span
      className="relative inline-flex items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 via-brand-600 to-brand-700 shadow-lg shadow-brand-500/30 ring-1 ring-white/40"
      style={{ width: size, height: size }}
    >
      {/* ánh sáng nhẹ phía trên cho khối kính */}
      <span className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/25 to-transparent" />
      <svg
        viewBox="0 0 32 32"
        fill="none"
        width={size * 0.58}
        height={size * 0.58}
        className="relative"
        aria-hidden
      >
        <path
          d="M4 15 L16 5 L28 15"
          stroke="white"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M7 13.5 V26 H25 V13.5"
          stroke="white"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M13.2 26 V18.5 H18.8 V26"
          stroke="white"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/** Logo đầy đủ: huy hiệu + chữ. `stacked` để xếp dọc (dùng ở trang login). */
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
    <div className={stacked ? "flex flex-col items-center gap-3 text-center" : "flex items-center gap-3"}>
      <KHomesMark size={size} />
      <div className={stacked ? "" : "leading-tight"}>
        <div className="text-2xl font-extrabold tracking-tight">
          <span className="text-gradient">K</span>
          <span className="text-slate-800">‑Homès</span>
        </div>
        {tagline && (
          <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            {tagline}
          </div>
        )}
      </div>
    </div>
  );
}
