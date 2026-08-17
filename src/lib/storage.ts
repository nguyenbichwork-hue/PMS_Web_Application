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
export const OD_PREFIX = "od:"; // đánh dấu tệp đã LƯU TRỮ trên OneDrive (giá trị sau tiền tố là driveItem id)

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

// ---------------------------------------------------------------------
// OneDrive / SharePoint (Microsoft Graph) — TẦNG LƯU TRỮ NGUỘI.
// Chứng từ ĐÃ HOÀN TẤT (PRQ Paid / Invoice Paid…) được archive từ tầng nóng
// (Supabase) sang đây qua uploadToOneDrive(); con trỏ đổi "sb:" → "od:<itemId>".
// Xác thực app-to-app (client credentials) — không cần người đăng nhập.
// ENV: ONEDRIVE_TENANT_ID / ONEDRIVE_CLIENT_ID / ONEDRIVE_CLIENT_SECRET,
//      + ONEDRIVE_DRIVE_USER (email chủ OneDrive) HOẶC ONEDRIVE_DRIVE_ID.
// ---------------------------------------------------------------------
function odConfig() {
  const tenant = process.env.ONEDRIVE_TENANT_ID || "";
  const clientId = process.env.ONEDRIVE_CLIENT_ID || "";
  const clientSecret = process.env.ONEDRIVE_CLIENT_SECRET || "";
  const driveUser = process.env.ONEDRIVE_DRIVE_USER || "";
  const driveId = process.env.ONEDRIVE_DRIVE_ID || "";
  const enabled = Boolean(tenant && clientId && clientSecret && (driveUser || driveId));
  return { tenant, clientId, clientSecret, driveUser, driveId, enabled };
}

/** OneDrive đã cấu hình đủ env chưa? Chưa đủ → luồng archive bỏ qua (chạy như cũ). */
export function oneDriveEnabled(): boolean {
  return odConfig().enabled;
}

// Token & drive id cache theo tiến trình (mỗi lambda) — token tự làm mới trước hạn.
let odToken: { value: string; exp: number } | null = null;
let odDriveId: string | null = null;

async function graphToken(): Promise<string> {
  const now = Date.now();
  if (odToken && odToken.exp > now + 60_000) return odToken.value;
  const { tenant, clientId, clientSecret } = odConfig();
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`OneDrive: lấy token thất bại (${res.status}). ${await res.text().catch(() => "")}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  odToken = { value: json.access_token, exp: now + json.expires_in * 1000 };
  return json.access_token;
}

async function graphDriveId(): Promise<string> {
  if (odDriveId) return odDriveId;
  const cfg = odConfig();
  if (cfg.driveId) return (odDriveId = cfg.driveId);
  const token = await graphToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.driveUser)}/drive`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`OneDrive: không lấy được drive của ${cfg.driveUser} (${res.status}). ${await res.text().catch(() => "")}`);
  const json = (await res.json()) as { id: string };
  return (odDriveId = json.id);
}

/** Chuẩn hóa 1 đoạn tên folder/tệp cho OneDrive (bỏ ký tự cấm, cắt độ dài). */
function odSegment(s: string): string {
  const cleaned = (s || "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 120);
  return cleaned || "_";
}

/** Đẩy buffer lên OneDrive theo đường dẫn thư mục (Graph tự tạo cây folder cha).
 *  Trả về con trỏ "od:<driveItemId>" để ghi vào attachments.file_url. */
export async function uploadToOneDrive(buf: Buffer, folderPath: string, fileName: string): Promise<SavedFile> {
  const driveId = await graphDriveId();
  const token = await graphToken();
  const segs = folderPath.split("/").filter(Boolean).map(odSegment);
  const encoded = [...segs, odSegment(fileName)].map(encodeURIComponent).join("/");
  const base = `https://graph.microsoft.com/v1.0/drives/${driveId}`;

  let item: { id: string };
  if (buf.length <= 4 * 1024 * 1024) {
    // ≤4MB: PUT trực tiếp.
    const res = await fetch(`${base}/root:/${encoded}:/content`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": guessMime(fileName) },
      body: new Uint8Array(buf),
    });
    if (!res.ok) throw new Error(`OneDrive upload thất bại (${res.status}). ${await res.text().catch(() => "")}`);
    item = (await res.json()) as { id: string };
  } else {
    // >4MB: upload session theo chunk (kích thước phải là bội số 320KB).
    const sess = await fetch(`${base}/root:/${encoded}:/createUploadSession`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "replace" } }),
    });
    if (!sess.ok) throw new Error(`OneDrive tạo upload session thất bại (${sess.status}).`);
    const { uploadUrl } = (await sess.json()) as { uploadUrl: string };
    const CHUNK = 5 * 320 * 1024; // 1.638.400 bytes = bội số 320KB
    const total = buf.length;
    let start = 0;
    let last: Response | null = null;
    while (start < total) {
      const end = Math.min(start + CHUNK, total);
      const chunk = buf.subarray(start, end);
      last = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Range": `bytes ${start}-${end - 1}/${total}` },
        body: new Uint8Array(chunk),
      });
      if (!last.ok && last.status !== 202) throw new Error(`OneDrive upload chunk thất bại (${last.status}).`);
      start = end;
    }
    item = (await last!.json()) as { id: string };
  }
  return { storedName: OD_PREFIX + item.id, originalName: fileName || "file", size: buf.length };
}

async function odDownload(itemId: string): Promise<Buffer> {
  const driveId = await graphDriveId();
  const token = await graphToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${encodeURIComponent(itemId)}/content`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`OneDrive tải tệp thất bại (${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}

async function odDelete(itemId: string): Promise<void> {
  const driveId = await graphDriveId();
  const token = await graphToken();
  await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
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
  if (storedName.startsWith(OD_PREFIX)) {
    return odDownload(storedName.slice(OD_PREFIX.length));
  }
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
    if (storedName.startsWith(OD_PREFIX)) {
      await odDelete(storedName.slice(OD_PREFIX.length));
      return;
    }
    if (storedName.startsWith(SB_PREFIX)) {
      await sbFetch(storedName.slice(SB_PREFIX.length), { method: "DELETE" });
      return;
    }
    await fs.unlink(path.join(DIR, path.basename(storedName)));
  } catch {
    /* bỏ qua nếu file không tồn tại */
  }
}
