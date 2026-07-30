import "server-only";
import fs from "node:fs/promises";
import path from "node:path";

// Lưu trữ tệp đính kèm. Ưu tiên SUPABASE STORAGE nếu đã cấu hình env; nếu chưa thì
// rơi về ổ đĩa cục bộ (./storage) cho môi trường dev. Toàn app chỉ gọi 3 hàm
// saveFile/readFile/removeFile nên không nơi nào khác phải sửa.
//
// Cấu hình Supabase (đặt trong .env.local, KHÔNG commit):
//   SUPABASE_URL=https://<project>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY=<service role key>   (chỉ dùng phía server)
//   SUPABASE_STORAGE_BUCKET=attachments            (mặc định "attachments")
// Bucket để PRIVATE — tải xuống luôn đi qua route đã kiểm đăng nhập.

const DIR = path.join(process.cwd(), "storage");
const SB_PREFIX = "sb:"; // đánh dấu tệp lưu trên Supabase trong cột attachments.file_url

export interface SavedFile {
  storedName: string; // giá trị lưu vào file_url (có tiền tố "sb:" nếu ở Supabase)
  originalName: string;
  size: number;
}

function sbConfig() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "attachments";
  return { url, key, bucket, enabled: Boolean(url && key) };
}

/** Backend đang dùng — để hiển thị/kiểm tra khi cần. */
export function storageBackend(): "supabase" | "local" {
  return sbConfig().enabled ? "supabase" : "local";
}

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xls: "application/vnd.ms-excel",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", doc: "application/msword",
  csv: "text/csv", txt: "text/plain", zip: "application/zip",
};
/** Đoán Content-Type theo đuôi tệp (để xem trước PDF/ảnh khi tải). */
export function guessMime(name: string): string {
  const ext = (name.split(".").pop() || "").toLowerCase();
  return MIME[ext] || "application/octet-stream";
}

/** Tên lưu duy nhất (chống ghi đè khi lưu nhiều tệp trong cùng mili-giây). */
function uniqueName(originalName: string): string {
  const safe = (originalName || "file").replace(/[^\w.\- ]/g, "_").slice(0, 80);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${Date.now()}-${rand}-${safe}`;
}

async function sbFetch(objectPath: string, init: RequestInit): Promise<Response> {
  const { url, key, bucket } = sbConfig();
  const endpoint = `${url}/storage/v1/object/${bucket}/${objectPath.split("/").map(encodeURIComponent).join("/")}`;
  return fetch(endpoint, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, ...(init.headers || {}) },
  });
}

export async function saveFile(file: File): Promise<SavedFile> {
  return saveBuffer(Buffer.from(await file.arrayBuffer()), file.name || "file");
}

/** Lưu từ Buffer đã đọc sẵn — tránh đọc File.arrayBuffer() hai lần (hash + ghi). */
export async function saveBuffer(buf: Buffer, originalName: string): Promise<SavedFile> {
  const name = uniqueName(originalName);
  const cfg = sbConfig();
  if (cfg.enabled) {
    // Đường dẫn object theo năm/tháng cho dễ quản lý.
    const now = new Date();
    const objectPath = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${name}`;
    const res = await sbFetch(objectPath, {
      method: "POST",
      headers: { "Content-Type": guessMime(originalName), "x-upsert": "true" },
      body: new Uint8Array(buf),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Tải tệp lên Supabase thất bại (${res.status}). ${detail}`);
    }
    return { storedName: SB_PREFIX + objectPath, originalName: originalName || "file", size: buf.length };
  }
  // Fallback: ổ đĩa cục bộ.
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(path.join(DIR, name), buf);
  return { storedName: name, originalName: originalName || "file", size: buf.length };
}

export async function readFile(storedName: string): Promise<Buffer> {
  if (storedName.startsWith(SB_PREFIX)) {
    const objectPath = storedName.slice(SB_PREFIX.length);
    const res = await sbFetch(objectPath, { method: "GET" });
    if (!res.ok) throw new Error(`Tải tệp từ Supabase thất bại (${res.status}).`);
    return Buffer.from(await res.arrayBuffer());
  }
  // Chống path traversal: chỉ cho phép tên file phẳng.
  return fs.readFile(path.join(DIR, path.basename(storedName)));
}

export async function removeFile(storedName: string): Promise<void> {
  try {
    if (storedName.startsWith(SB_PREFIX)) {
      await sbFetch(storedName.slice(SB_PREFIX.length), { method: "DELETE" });
      return;
    }
    await fs.unlink(path.join(DIR, path.basename(storedName)));
  } catch {
    /* bỏ qua nếu file không tồn tại */
  }
}
