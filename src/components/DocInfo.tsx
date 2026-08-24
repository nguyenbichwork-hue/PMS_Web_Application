/** Ô "nhãn — giá trị" và dòng "nhãn … giá trị" dùng lại ở các pane chi tiết chứng từ. */
export function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[13px] text-slate-500">{label}</div>
      <div className="text-[15px] font-medium text-slate-800">{value ?? "—"}</div>
    </div>
  );
}

export function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className={strong ? "flex justify-between font-semibold text-slate-800" : "flex justify-between text-slate-600"}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
