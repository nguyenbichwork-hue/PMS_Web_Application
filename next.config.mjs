/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== "production";

// Content-Security-Policy — phòng thủ nhiều lớp chống XSS/tiêm mã, chèn <base>, khung nhúng.
// Dev cần 'unsafe-eval' + ws: cho HMR; production bỏ đi cho chặt hơn.
// (Nâng cấp production: dùng nonce cho script thay 'unsafe-inline'.)
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" }, // chống clickjacking
  { key: "X-Content-Type-Options", value: "nosniff" }, // chống MIME-sniffing
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // HSTS chỉ áp khi chạy HTTPS thật (production).
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

const nextConfig = {
  // PGlite must run as a native/server package, not bundled by Turbopack/webpack.
  // exceljs (đọc file import) cũng chạy phía server, không bundle.
  // pg (node-postgres) cũng phải external — có native binding, bundle sẽ vỡ.
  serverExternalPackages: ["@electric-sql/pglite", "exceljs", "pg"],
  // Đóng gói file .sql (schema + migrations) vào serverless function của Vercel.
  // db.ts đọc chúng lúc chạy bằng fs.readFileSync(process.cwd()/src/lib/*.sql);
  // Vercel KHÔNG tự trace file đọc động → phải khai báo để tránh lỗi ENOENT (500).
  outputFileTracingIncludes: {
    "/**": ["./src/lib/schema.sql", "./src/lib/migrations.sql"],
  },
  experimental: {
    // Cho phép upload file Excel qua Server Action (mặc định chỉ 1MB).
    serverActions: { bodySizeLimit: "15mb" },
  },
  // Đặt security headers cho MỌI route.
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

// Chỉ nạp shim Cloudflare khi CHỦ ĐỘNG chạy trên Cloudflare (ENABLE_CF_DEV=1).
// Mặc định TẮT để `next dev`/`next start` chạy Node bình thường — tránh shim can
// thiệp filesystem/RSC gây lỗi khi lưu tệp đính kèm.
if (process.env.ENABLE_CF_DEV === "1") {
  import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
}
