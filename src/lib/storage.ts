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

/** Sinh tên lưu duy nhất (chống trùng khi lưu NHIỀU tệp trong cùng mili-giây). */
function uniqueName(originalName: string): string {
  const safe = (originalName || "file").replace(/[^\w.\- ]/g, "_").slice(0, 80);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${Date.now()}-${rand}-${safe}`;
}

export async function saveFile(file: File): Promise<SavedFile> {
  return saveBuffer(Buffer.from(await file.arrayBuffer()), file.name || "file");
}

/** Lưu từ Buffer đã đọc sẵn — tránh đọc `File.arrayBuffer()` hai lần (hash + ghi). */
export async function saveBuffer(buf: Buffer, originalName: string): Promise<SavedFile> {
  await fs.mkdir(DIR, { recursive: true });
  const storedName = uniqueName(originalName);
  await fs.writeFile(path.join(DIR, storedName), buf);
  return { storedName, originalName: originalName || "file", size: buf.length };
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
