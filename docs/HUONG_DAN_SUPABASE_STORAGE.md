# Lưu trữ tệp đính kèm bằng Supabase Storage

> Mục tiêu: chuyển tệp đính kèm (hình ảnh, PDF, chứng từ…) từ ổ đĩa cục bộ (`./storage`)
> sang **Supabase Storage** để không mất tệp khi redeploy và không lỗi trên host chỉ-đọc.

App đã sửa để **tự dùng Supabase khi có cấu hình**; nếu chưa cấu hình thì vẫn lưu cục bộ
(dev). Chỉ cần làm 3 bước dưới là chạy thật.

## 1. Tạo bucket

1. Vào https://supabase.com → chọn project đang dùng cho tài khoản (accounts DB).
2. Menu trái **Storage → New bucket**.
3. Tên bucket: `attachments`. **KHÔNG bật Public** (để riêng tư — tải xuống luôn qua app đã đăng nhập).
4. Create.

## 2. Lấy khóa Service Role

1. **Project Settings → API**.
2. Sao chép:
   - **Project URL** (dạng `https://xxxxxxxx.supabase.co`)
   - **service_role** key (mục *Project API keys* — **bí mật**, chỉ dùng phía server)

> ⚠️ `service_role` có toàn quyền — **không** đưa ra client, **không** commit lên git.

## 3. Đặt biến môi trường

Thêm vào `.env.local` (đã gitignore):

```dotenv
SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...(service_role key)...
SUPABASE_STORAGE_BUCKET=attachments
```

Khi deploy (Vercel…): thêm đúng 3 biến này vào Environment Variables (Production) rồi redeploy.

**Restart hẳn app** để nạp biến mới.

## Kiểm thử

1. Tạo/mở một PR → đính kèm 1 ảnh + 1 PDF.
2. Vào **Supabase → Storage → attachments** thấy tệp nằm trong thư mục `năm/tháng/…`.
3. Bấm tên tệp trong app → xem trước được PDF/ảnh (Content-Type đã đúng).
4. Xóa đính kèm trong app → tệp biến mất trên Supabase.

## Ghi chú

- Tệp cũ đã lưu cục bộ **không tự chuyển** sang Supabase; chỉ tệp tải lên **sau khi cấu hình**
  mới nằm trên Supabase. Cột `attachments.file_url` đánh dấu tệp Supabase bằng tiền tố `sb:`;
  tệp cục bộ cũ vẫn đọc được như trước.
- Không cần cài thêm thư viện — app gọi Supabase Storage qua HTTP API sẵn có.
