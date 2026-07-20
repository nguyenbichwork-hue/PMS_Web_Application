// Khung chờ dùng chung cho mọi trang trong nhóm (app) — hiện NGAY khi
// chuyển trang, trong lúc server render, để không bị "khựng/trắng".
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-28 rounded-2xl bg-slate-100" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-slate-100" />
        ))}
      </div>
      <div className="h-10 w-full max-w-md rounded-lg bg-slate-100" />
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-8 rounded bg-slate-100" />
        ))}
      </div>
    </div>
  );
}
