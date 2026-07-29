# Hướng dẫn triển khai lưu trữ file bằng Cloudflare R2

> Mục tiêu: chuyển việc lưu **file đính kèm** (chứng từ, hình ảnh, PDF hóa đơn…) của PR/PO/Hóa đơn
> từ ổ đĩa cục bộ (`./storage`) sang **Cloudflare R2** để dùng thật, lâu dài, chi phí tối ưu.

## 0. Vì sao đổi rất nhẹ

Toàn bộ app đã lưu file qua một lớp trừu tượng duy nhất: `src/lib/storage.ts` với 3 hàm
`saveFile` / `readFile` / `removeFile`. Mọi nơi khác (action đính kèm, route tải xuống, giao diện)
**không cần sửa** — chỉ thay phần thân 3 hàm này bằng R2.

```
Giao diện đính kèm  ─┐
uploadAttachmentAction├─►  src/lib/storage.ts  ──►  (cục bộ ./storage)  ➜  ĐỔI THÀNH  ➜  Cloudflare R2
route tải xuống     ─┘        (chỉ sửa file NÀY)
```

Bảng `attachments` giữ nguyên: cột `file_url` sẽ chứa **object key** trên R2 thay vì tên file cục bộ.

---

## PHẦN A — Thiết lập trên Cloudflare (một lần)

### A1. Tạo tài khoản & bật R2
1. Đăng ký/đăng nhập https://dash.cloudflare.com
2. Menu trái chọn **R2**. Lần đầu sẽ yêu cầu **thêm phương thức thanh toán** (bắt buộc để kích hoạt R2)
   — **vẫn được hạn mức miễn phí 10 GB + không phí băng thông**; chỉ tính tiền khi vượt.

### A2. Tạo bucket
1. **R2 → Create bucket**.
2. Đặt tên, ví dụ: `pms-attachments` (chữ thường, không dấu).
3. Location: để **Automatic**. Bấm **Create**.
4. **Không** bật Public access — chứng từ là dữ liệu nhạy cảm, ta phục vụ tải qua app đã đăng nhập.

### A3. Tạo API Token (khóa truy cập)
1. Trong trang R2, bấm **Manage R2 API Tokens** (góc phải) → **Create API token**.
2. **Permissions**: chọn **Object Read & Write** (đọc + ghi).
3. **Specify bucket(s)**: chọn **Apply to specific buckets only → `pms-attachments`** (nguyên tắc quyền tối thiểu).
4. Bấm **Create API Token**. Màn hình hiện **1 lần duy nhất**:
   - **Access Key ID**
   - **Secret Access Key**
   - **Endpoint** dạng `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
   Sao chép cả 3 (và **Account ID** thấy ở trang tổng quan R2).

> ⚠️ Lưu ngay Secret Access Key vào nơi an toàn — không xem lại được sau khi đóng.

---

## PHẦN B — Biến môi trường

Thêm vào `.env.local` (KHÔNG commit — file này đã được gitignore):

```dotenv
# Cloudflare R2
R2_ACCOUNT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
R2_ACCESS_KEY_ID=xxxxxxxxxxxxxxxxxxxx
R2_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
R2_BUCKET=pms-attachments
```

Trên **Vercel** (khi deploy): Project → **Settings → Environment Variables**, thêm đúng 4 biến trên
cho môi trường **Production** (và Preview nếu muốn). Sau đó **Redeploy**.

---

## PHẦN C — Cài SDK

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

(R2 tương thích giao thức S3 nên dùng SDK S3 của AWS.)

---

## PHẦN D — Thay `src/lib/storage.ts` bằng bản R2

Giữ **nguyên tên & chữ ký** 3 hàm để phần còn lại của app không phải sửa. Dán đè toàn bộ file:

```ts
import "server-only";
import { randomUUID } from "node:crypto";
import {
  S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Đọc cấu hình lúc RUNTIME (không phải lúc build) để không vỡ build khi thiếu env.
function client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Thiếu cấu hình R2 (R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY).");
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}
const bucket = () => process.env.R2_BUCKET || "pms-attachments";

export interface SavedFile {
  storedName: string; // object key trên R2 (lưu vào cột file_url)
  originalName: string;
  size: number;
}

export async function saveFile(file: File): Promise<SavedFile> {
  const buf = Buffer.from(await file.arrayBuffer());
  const safe = (file.name || "file").replace(/[^\w.\- ]/g, "_").slice(0, 80);
  // Key có tiền tố năm/tháng để dễ quản lý + phần ngẫu nhiên chống trùng.
  const now = new Date();
  const prefix = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const storedName = `${prefix}/${Date.now()}-${randomUUID().slice(0, 8)}-${safe}`;
  await client().send(new PutObjectCommand({
    Bucket: bucket(),
    Key: storedName,
    Body: buf,
    ContentType: file.type || "application/octet-stream",
  }));
  return { storedName, originalName: file.name || safe, size: buf.length };
}

export async function readFile(storedName: string): Promise<Buffer> {
  const res = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: storedName }));
  // SDK v3 cung cấp transformToByteArray trên Body.
  const bytes = await res.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

export async function removeFile(storedName: string): Promise<void> {
  try {
    await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: storedName }));
  } catch {
    /* bỏ qua nếu không tồn tại */
  }
}

/** (Tùy chọn) URL tải trực tiếp từ R2, hết hạn sau `expiresSec` giây. */
export async function signedDownloadUrl(storedName: string, filename: string, expiresSec = 300): Promise<string> {
  const cmd = new GetObjectCommand({
    Bucket: bucket(),
    Key: storedName,
    ResponseContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
  });
  return getSignedUrl(client(), cmd, { expiresIn: expiresSec });
}
```

> Sau bước này app đã chạy R2. `uploadAttachmentAction`, `deleteAttachmentAction` và route tải xuống
> `src/app/api/attachments/[id]/route.ts` **không cần sửa** — chúng vẫn gọi `saveFile/readFile/removeFile`.

---

## PHẦN E — (Tùy chọn, khuyến nghị khi scale) Tải xuống bằng presigned URL

Mặc định route tải xuống đọc file về server rồi trả cho trình duyệt (đơn giản, an toàn). Khi lượng
tải lớn, có thể để trình duyệt tải **thẳng từ R2** để nhẹ server — sửa route thành chuyển hướng:

```ts
// src/app/api/attachments/[id]/route.ts
import { getCurrentUser } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { signedDownloadUrl } from "@/lib/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const att = await queryOne<{ file_name: string; file_url: string }>(
    `SELECT file_name, file_url FROM attachments WHERE id = $1`, [Number(id)]
  );
  if (!att) return new Response("Not found", { status: 404 });
  const url = await signedDownloadUrl(att.file_url, att.file_name);
  return Response.redirect(url, 302);
}
```

Giữ kiểm tra đăng nhập ở server; link R2 tự hết hạn sau 5 phút. **Vẫn không cần bật public bucket.**

---

## PHẦN F — CORS

Không cần cấu hình CORS vì app **upload qua server** (trình duyệt gửi file tới Server Action, server
mới đẩy lên R2). Chỉ khi nào chuyển sang upload trực tiếp trình duyệt → R2 (presigned PUT) mới cần thêm
CORS cho bucket.

---

## PHẦN G — (Tùy chọn) Tiết kiệm thêm khi dữ liệu lớn: Lifecycle

Chứng từ cũ phải giữ 10 năm nhưng hiếm mở lại → chuyển sang tầng rẻ hơn:
1. **R2 → bucket `pms-attachments` → Settings → Object lifecycle rules → Add rule**.
2. Điều kiện: đối tượng **cũ hơn N ngày** (ví dụ 730 = 2 năm).
3. Hành động: chuyển sang **Infrequent Access** (giá lưu rẻ hơn; có phí truy xuất nhỏ khi mở lại).

Chỉ nên bật khi đã dùng nhiều TB — ở quy mô nhỏ/vừa chưa cần.

---

## PHẦN H — Bảo mật (bắt buộc)

- **Không commit** `.env.local` / khóa R2 lên git (đã gitignore — kiểm tra lại).
- Token dùng quyền **Object Read & Write** và **giới hạn đúng 1 bucket** (đã làm ở A3).
- Bucket **private**; tải xuống luôn qua route đã kiểm đăng nhập (hoặc presigned tự hết hạn).
- Giới hạn dung lượng/loại file đã có sẵn trong `uploadAttachmentAction` (`MAX_BYTES = 10MB`); có thể
  siết thêm phần mở rộng cho phép (pdf, jpg, png, xlsx…) nếu muốn.
- Chống trùng nội dung file đã có (SHA-256 trong action) — giữ nguyên.

---

## PHẦN I — Kiểm thử

1. `npm run dev`.
2. Mở một PR/PO/Hóa đơn → khung **Đính kèm** → tải lên 1 file PDF/ảnh.
3. Kiểm tra: file xuất hiện trên **R2 dashboard → bucket → Objects** (đúng tiền tố năm/tháng).
4. Bấm tên file trong app để tải xuống → xem đúng nội dung.
5. Xóa đính kèm trong app → đối tượng biến mất trên R2.
6. Chạy `npm run build` để chắc không lỗi TypeScript.

---

## PHẦN J — Chi phí (nhắc lại)

- **Miễn phí**: 10 GB lưu trữ + 1 triệu ghi + 10 triệu đọc mỗi tháng, **egress = 0**.
- Vượt free: **$0.015/GB/tháng**, tải xuống vẫn miễn phí.
- Ước tính thực tế (5 MB/giao dịch): quy mô vừa ~**$2–4/tháng**, quy mô lớn (1.2 TB) ~**$9/tháng**.

---

## Checklist triển khai

- [ ] Bật R2 + thêm phương thức thanh toán
- [ ] Tạo bucket `pms-attachments` (private)
- [ ] Tạo API token (Object Read & Write, chỉ bucket này) → lưu Access Key/Secret/Account ID
- [ ] Điền 4 biến R2 vào `.env.local` (và Vercel env khi deploy)
- [ ] `npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`
- [ ] Thay nội dung `src/lib/storage.ts` bằng bản R2 (Phần D)
- [ ] (Tùy chọn) Đổi route tải xuống sang presigned (Phần E)
- [ ] Test upload/download/delete + `npm run build`
- [ ] Đặt lifecycle khi dữ liệu lớn (Phần G)
