import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Inter self-host (next/font) — nét, hiện đại, hỗ trợ tiếng Việt.
const inter = Inter({
  subsets: ["latin", "vietnamese"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "K‑Homès · Quản lý mua hàng",
  description: "Quy trình mua hàng: Yêu cầu → Duyệt → Đơn hàng → Nhận hàng → Đối chiếu hóa đơn",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d0e11",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Áp theme trước khi render để tránh nháy. MẶC ĐỊNH = TỐI (sang trọng);
            chỉ sáng khi người dùng chọn 'light'. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('pms-theme');if(t!=='light')document.documentElement.classList.add('dark');var a=localStorage.getItem('pms-accent');if(a)document.documentElement.setAttribute('data-accent',a);}catch(e){document.documentElement.classList.add('dark');}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
