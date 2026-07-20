import "server-only";
import fs from "node:fs/promises";
import path from "node:path";

// Lưu trữ file cục bộ (thư mục ./storage). Khi lên production sẽ thay bằng
// Supabase Storage — chỉ cần đổi 2 hàm dưới, phần còn lại giữ nguyên.
const DIR = path.join(process.cwd(), "storage");

export interface SavedFile {
  storedName: string; // tên file lưu trên đĩa (dùng làm file_url)
  originalName: string;
  size: number;
}

export async function saveFile(file: File): Promise<SavedFile> {
  await fs.mkdir(DIR, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  const safe = (file.name || "file").replace(/[^\w.\- ]/g, "_").slice(0, 80);
  const storedName = `${Date.now()}-${safe}`;
  await fs.writeFile(path.join(DIR, storedName), buf);
  return { storedName, originalName: file.name || safe, size: buf.length };
}

export async function readFile(storedName: string): Promise<Buffer> {
  // Chống path traversal: chỉ cho phép tên file phẳng.
  const base = path.basename(storedName);
  return fs.readFile(path.join(DIR, base));
}

export async function removeFile(storedName: string): Promise<void> {
  try {
    await fs.unlink(path.join(DIR, path.basename(storedName)));
  } catch {
    /* bỏ qua nếu file không tồn tại */
  }
}
