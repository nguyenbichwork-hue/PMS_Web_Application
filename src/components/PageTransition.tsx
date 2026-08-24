"use client";
import { usePathname } from "next/navigation";

// Key theo đường dẫn để mỗi lần chuyển trang nội dung mờ dần vào (fade-up),
// tạo cảm giác chuyển mượt thay vì thay thế đột ngột.
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // h-full: nối chuỗi chiều cao từ <main> xuống trang → cho phép trang master-detail
  // đặt 2 cột cuộn ĐỘC LẬP (h-full bên trong hoạt động). Trang thường không ảnh hưởng
  // vì nội dung cao hơn vẫn tràn ra và <main> (overflow-auto) tự cuộn như cũ.
  return (
    <div key={pathname} className="animate-page h-full">
      {children}
    </div>
  );
}
