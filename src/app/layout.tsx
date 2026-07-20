import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PMS — Purchase Management System",
  description: "PR → Approval → PO → Goods Receipt → Invoice matching",
};

// Bắt buộc cho mobile: render đúng bề rộng thiết bị (không thì điện thoại
// hiển thị như desktop thu nhỏ). initialScale=1, cho phép người dùng zoom.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        {/* Áp theme trước khi render để tránh nháy màn hình */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('pms-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark');var a=localStorage.getItem('pms-accent');if(a)document.documentElement.setAttribute('data-accent',a);}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
