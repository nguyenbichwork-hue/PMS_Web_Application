"use client";
import { usePathname } from "next/navigation";

// Key theo đường dẫn để mỗi lần chuyển trang nội dung mờ dần vào (fade-up),
// tạo cảm giác chuyển mượt thay vì thay thế đột ngột.
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-page">
      {children}
    </div>
  );
}
