# 📖 HƯỚNG DẪN SỬ DỤNG — Hệ thống Quản lý Mua hàng (PMS)

> Tài liệu hướng dẫn chi tiết **toàn bộ tính năng hiện có**. Dành cho người dùng cuối (nhân viên, mua hàng, quản lý, kế toán, quản trị).
> Mở trình duyệt, truy cập địa chỉ hệ thống rồi đăng nhập để bắt đầu.

---

## MỤC LỤC
1. [Đăng nhập & 5 vai trò](#1-đăng-nhập--5-vai-trò)
2. [Giao diện chung](#2-giao-diện-chung)
3. [Việc của tôi & Thông báo](#3-việc-của-tôi--thông-báo)
4. [Tìm kiếm nhanh (Ctrl+K)](#4-tìm-kiếm-nhanh-ctrlk)
5. [Bảng điều khiển (Dashboard)](#5-bảng-điều-khiển)
6. [Luồng nghiệp vụ mua hàng](#6-luồng-nghiệp-vụ-mua-hàng-end-to-end)
   - 6.1 Yêu cầu mua (PR)
   - 6.2 Phê duyệt PR
   - 6.3 Đơn đặt hàng (PO)
   - 6.4 Nhận hàng (GR) — toàn bộ & từng phần
   - 6.5 Hóa đơn & đối chiếu 4 bước
   - 6.6 Thanh toán nhiều đợt
7. [Danh mục: Nhà cung cấp & Hàng hóa](#7-danh-mục)
8. [Đính kèm tài liệu](#8-đính-kèm-tài-liệu)
9. [Xuất dữ liệu: Excel & PDF](#9-xuất-dữ-liệu)
10. [Cấu hình hệ thống (Admin)](#10-cấu-hình-hệ-thống-admin)
11. [Nhập dữ liệu từ Excel](#11-nhập-dữ-liệu-từ-excel-admin)
12. [Đổi màu giao diện & Sáng/Tối](#12-giao-diện-đổi-màu--sángtối)
13. [Ma trận quyền theo vai trò](#13-ma-trận-quyền)
14. [Câu hỏi thường gặp](#14-câu-hỏi-thường-gặp)

---

## 1. Đăng nhập & 5 vai trò

Mở web → tự chuyển tới trang đăng nhập. Nhập **email + mật khẩu**. Trang login có sẵn nút **tài khoản demo** (bấm để điền email).

**Mật khẩu demo chung: `password`**

| Vai trò | Email demo | Làm được gì |
|---|---|---|
| **Nhân viên** | `employee@demo.com` | Tạo yêu cầu mua (PR), theo dõi PR của mình, đính kèm báo giá |
| **Mua hàng** | `purchasing@demo.com` | Điều chỉnh & duyệt & gửi PO, nhận hàng, quản lý NCC/hàng hóa |
| **Quản lý** | `manager@demo.com` | Phê duyệt / từ chối yêu cầu mua |
| **Kế toán** | `finance@demo.com` | Nhập hóa đơn, xem đối chiếu, ghi nhận thanh toán |
| **Quản trị** | `admin@demo.com` | Quản lý người dùng, dữ liệu nền, cấu hình, nhập Excel |

> Mỗi vai trò chỉ thấy menu & thao tác thuộc quyền của mình. Dữ liệu được **lọc theo công ty** (mỗi người chỉ thấy dữ liệu công ty mình; Nhân viên chỉ thấy PR do chính mình tạo). Bấm **Đăng xuất** ở góc trên phải.

---

## 2. Giao diện chung

- **Thanh bên trái (Sidebar):** điều hướng theo nhóm — Tổng quan · Mua hàng · Danh mục · Hệ thống. Mục đang mở được tô sáng.
- **Thanh trên (Header):** ô **Tìm kiếm** (Ctrl+K), **chuông 🔔** (số việc cần xử lý), tên & vai trò, nút **đổi Sáng/Tối**, **Đăng xuất**.
- **Trên điện thoại:** sidebar thu lại thành nút **☰** (menu trượt); bảng dài **cuộn ngang**; bố cục tự co gọn.
- Mỗi trang danh sách có: **thẻ số liệu** (tổng/đang chờ/…), **ô lọc** (tìm + trạng thái), **bảng dữ liệu**, và **phân trang** (20 dòng/trang).

---

## 3. Việc của tôi & Thông báo

**Chuông 🔔** trên header hiển thị **tổng số việc đang chờ chính bạn**. Bấm chuông (hoặc menu "Việc của tôi") để mở danh sách gom theo vai trò:

| Bạn là | Sẽ thấy các việc |
|---|---|
| Quản lý / Kế toán / Quản trị | **Yêu cầu mua chờ bạn duyệt** (đúng lượt trong chuỗi duyệt) |
| Nhân viên (người tạo) | **PR nháp chưa gửi** duyệt |
| Mua hàng | **PO nháp cần duyệt**, **PO cần gửi NCC** |
| Kế toán | **PO đã nhận chưa nhập hóa đơn**, **Hóa đơn chờ đối chiếu**, **Hóa đơn đã khớp chờ thanh toán** |

Bấm vào một mục → nhảy tới danh sách đã lọc sẵn. Số trên mỗi mục là số lượng chứng từ.

---

## 4. Tìm kiếm nhanh (Ctrl+K)

Nhấn **Ctrl+K** (hoặc bấm ô "Tìm kiếm…" trên header) để mở bảng tìm nhanh.

- Gõ **số phiếu** (PR/PO/hóa đơn/GR) hoặc **tên** (nhà cung cấp, hàng hóa, mục đích PR).
- Kết quả hiện theo loại (PR · PO · HĐ · GR · NCC · Hàng).
- Dùng **↑ ↓** để chọn, **Enter** để mở, **Esc** để đóng.
- Kết quả đã được lọc theo quyền của bạn.

---

## 5. Bảng điều khiển

Trang **Bảng điều khiển** (Dashboard) hiển thị:
- Thẻ tổng quan (số PR/PO/hóa đơn, giá trị…).
- **Biểu đồ**: giá trị mua theo tháng, theo nhà cung cấp, theo công ty.

Biểu đồ tự co theo màn hình.

---

## 6. Luồng nghiệp vụ mua hàng (end-to-end)

```
PR → Phê duyệt nhiều cấp → PO (tự sinh) → Gửi NCC
   → Nhận hàng (GR, có thể từng phần) → Hóa đơn → Đối chiếu 4 bước → Thanh toán (nhiều đợt)
```

### 6.1 Yêu cầu mua (PR) — vai trò *Nhân viên / Mua hàng / Quản trị*

**Tạo PR:** Menu **Yêu cầu mua → + Tạo yêu cầu**.
1. Chọn **công ty**, **mục đích**, **độ ưu tiên**, **ngày cần**.
2. Thêm **dòng hàng**: tên hàng, số lượng, đơn giá dự kiến (có thể chọn mã hàng có sẵn + gợi ý NCC).
3. Bấm **Lưu nháp** (để sửa tiếp) hoặc **Gửi duyệt** (chuyển sang "Chờ duyệt").

> PR nháp có thể mở lại và bấm **Gửi duyệt** sau. Trên danh sách, PR quá **ngày cần** hiện badge đỏ **"Trễ Nn"**.

### 6.2 Phê duyệt PR — vai trò *Quản lý / Kế toán / Quản trị*

Mở PR đang **"Chờ duyệt"** → nếu **đến lượt bạn**, khung **"Bạn cần phê duyệt PR này"** hiện ra: nhập nhận xét (tùy chọn) → **✓ Duyệt** hoặc **✕ Từ chối**.

**Chuỗi duyệt theo giá trị** (mặc định, Admin đổi được):

| Giá trị PR | Cần duyệt theo thứ tự |
|---|---|
| < 20 triệu | Quản lý |
| 20 – 100 triệu | Quản lý → Kế toán |
| > 100 triệu | Quản lý → Kế toán → Quản trị |

- Phải duyệt **đúng lượt**: cấp sau chỉ duyệt khi cấp trước đã duyệt.
- Khi **duyệt hết các cấp** → PR chuyển **"Đã duyệt"** và **PO được tạo tự động** (dạng nháp).
- Khung "Luồng phê duyệt" trên trang PR cho thấy đã qua cấp nào, đang chờ cấp nào.

### 6.3 Đơn đặt hàng (PO) — vai trò *Mua hàng / Quản trị*

PO **tự sinh** từ PR đã duyệt, ở trạng thái **"Nháp"**, kế thừa dòng hàng + gán NCC gợi ý. Vòng đời:

```
Nháp → Đã duyệt → Đã gửi → Đã xác nhận → (Nhận một phần) → Đã nhận hàng → Đã đóng
  └─────────────────────────────► Đã hủy
```

Trên trang PO:
1. **Điều chỉnh** (khi Nháp/Đã duyệt): sửa NCC, giá, ngày giao, điều khoản — mọi thay đổi được ghi **Lịch sử điều chỉnh**.
2. **✓ Duyệt PO**.
3. **✉ Gửi NCC** (demo: mô phỏng gửi email).
4. **✔ NCC xác nhận**.
5. **✕ Hủy PO** (nhập lý do) — khi chưa nhận hàng.
6. **⬇ Xuất PDF / In** → mở bản in đẹp (tiếng Việt chuẩn), chọn *Lưu dưới dạng PDF* trong hộp thoại in.

> Danh sách PO: PO quá **ngày giao** mà chưa nhận đủ hiện badge **"Trễ Nn"**.

### 6.4 Nhận hàng (GR) — toàn bộ & **từng phần** — vai trò *Mua hàng / Kế toán / Quản trị*

Từ PO (đã gửi/xác nhận) bấm **→ Tạo phiếu nhận hàng (GR)**, hoặc menu **Nhận hàng → + Tạo phiếu nhận**.
1. Chọn PO, kho, ngày nhận.
2. Nhập **số lượng thực nhận** cho từng dòng.
3. Lưu.

**Nhận từng phần:**
- Nếu **nhận đủ** số lượng PO → PO chuyển **"Đã nhận hàng"**.
- Nếu **nhận thiếu** → PO chuyển **"Nhận một phần"**. Bạn có thể **nhận tiếp** (tạo GR khác) — hệ thống **cộng dồn** số đã nhận qua các lần.
- PO "Nhận một phần" vẫn cho **nhập hóa đơn** phần đã nhận.

### 6.5 Hóa đơn & đối chiếu 4 bước — vai trò *Kế toán / Quản trị*

Menu **Hóa đơn → + Nhập hóa đơn** (hoặc từ PO đã nhận bấm **→ Nhập hóa đơn**).
1. Nhập **số hóa đơn**, ngày, **chọn NCC thật của hóa đơn**, tiền VAT, file.
2. Chọn **PO** liên kết → thêm các **dòng** (mã hàng, SL, đơn giá).
3. Lưu → hệ thống **tự đối chiếu**.

**Đối chiếu 4 bước** cho kết quả **KHỚP / CẢNH BÁO / SAI LỆCH**:

| Bước | Kiểm tra |
|---|---|
| Nhà cung cấp | NCC hóa đơn == NCC trên PO |
| Số lượng | SL hóa đơn ≤ số **còn lại** (đã nhận − đã xuất hóa đơn trước) và ≤ SL PO còn lại |
| Đơn giá | Đơn giá từng dòng == đơn giá PO |
| Số tiền / VAT | Tổng & VAT khớp mức kỳ vọng (theo tỷ lệ nếu hóa đơn từng phần) |

**Nhiều hóa đơn cho 1 PO:** hóa đơn sau **tự trừ phần đã xuất hóa đơn trước** → không cho xuất vượt số đã nhận (nếu vượt sẽ báo **SAI LỆCH — vượt số lượng**).

Dữ liệu demo có sẵn: `INV-BOSCH-0001..0003` (khớp), `0004` (sai số lượng), `0005` (sai giá).

### 6.6 Thanh toán nhiều đợt — vai trò *Kế toán / Quản trị*

Trên hóa đơn **đã Khớp/Cảnh báo**, khung **Thanh toán** cho thấy: **Tổng · Đã thanh toán · Còn lại** + thanh tiến độ + lịch sử các đợt.
- **Ghi nhận** một đợt: nhập số tiền (mặc định = còn lại), chọn phương thức (Chuyển khoản/Tiền mặt/Khác), số UNC/tham chiếu → bấm **Ghi nhận**.
- **Trả hết**: ghi 1 đợt cho toàn bộ số còn lại.
- Khi **trả đủ** → hóa đơn chuyển **"Đã thanh toán"**. Không cho trả vượt số còn lại.

---

## 7. Danh mục

### Nhà cung cấp — vai trò *Mua hàng / Quản trị*
Menu **Nhà cung cấp**: xem/thêm/sửa NCC (mã, tên, MST, địa chỉ, liên hệ, điều khoản TT, tiền tệ, trạng thái).

### Hàng hóa — vai trò *Mua hàng / Quản trị*
Menu **Hàng hóa**: mã hàng, tên, nhóm, ĐVT, % VAT, NCC mặc định, mã kế toán, trạng thái.

> Danh mục được dùng lại khi tạo PR/PO/hóa đơn (gợi ý mã hàng, đơn giá, NCC).

---

## 8. Đính kèm tài liệu

Trên trang chi tiết PR / PO / Hóa đơn có khung **Đính kèm**:
- **Tải lên** báo giá, hợp đồng, hóa đơn scan…
- **Tải xuống** file đã đính kèm.

---

## 9. Xuất dữ liệu

- **Xuất Excel danh sách:** trên các trang **Yêu cầu mua / Đơn đặt hàng / Nhận hàng / Hóa đơn** có nút **⬇ Excel** — xuất đúng **bộ lọc đang xem** + theo quyền của bạn.
- **In / Xuất PDF đơn hàng:** trên trang PO bấm **⬇ Xuất PDF / In** → trang in đẹp, chọn *Save as PDF*.

---

## 10. Cấu hình hệ thống (Admin)

Menu **Cấu hình** (chỉ **Quản trị**). Các tab:

| Tab | Chức năng |
|---|---|
| **Luồng duyệt** | Thêm/sửa/xóa **ngưỡng duyệt** theo giá trị (từ – đến – các cấp duyệt). VD: `Manager, Finance` |
| **Người dùng** | Thêm/sửa người dùng: tên, email, phòng ban, **vai trò**, công ty, trạng thái, đặt lại mật khẩu |
| **Công ty** | Xem danh sách pháp nhân (công ty) |
| **Nhập Excel** | Nạp dữ liệu nền từ file Excel (xem mục 11) |
| **Giao diện** | Đổi **màu chủ đạo** toàn hệ thống (xem mục 12) |
| **Nhật ký** | Nhật ký hệ thống 100 dòng gần nhất: ai / làm gì / trên chứng từ nào / cũ→mới |

---

## 11. Nhập dữ liệu từ Excel (Admin)

**Cấu hình → Nhập Excel**. Nạp file theo mẫu **`08_Du_Lieu_Can_Chuan_Bi.xlsx`** (6 nhóm): Công ty, Phòng ban, Người dùng, Nhà cung cấp, Hàng hóa, Hạn mức duyệt.

1. Bấm **📎 Chọn file .xlsx** → chọn file đã điền.
2. Bấm **Nhập dữ liệu**.
3. Xem kết quả: bảng **Thêm mới / Cập nhật / Bỏ qua** cho từng nhóm + cảnh báo (nếu có).

**Quy tắc:** trùng **mã/email** → **cập nhật** (không xóa dữ liệu cũ); khớp cột theo tên tiêu đề (chịu được đổi thứ tự cột); tự bỏ hàng mô tả & hàng trống; cập nhật người dùng **không đổi mật khẩu**.

---

## 12. Giao diện: đổi màu & Sáng/Tối

- **Đổi màu chủ đạo (Admin):** Cấu hình → **Giao diện** → chọn 1 trong 6 tông (Tím / Xanh dương / Xanh lá / Xanh ngọc / Hồng đỏ / Vàng cam). Áp dụng **ngay** cho toàn hệ thống (nút, sidebar, logo, tab…) và **lưu trên trình duyệt**.
- **Sáng / Tối:** nút đổi giao diện ở header — áp cho mọi người dùng trên trình duyệt đó.

---

## 13. Ma trận quyền

| Chức năng | Nhân viên | Mua hàng | Quản lý | Kế toán | Quản trị |
|---|:---:|:---:|:---:|:---:|:---:|
| Tạo yêu cầu mua (PR) | ✅ | ✅ | | | ✅ |
| Duyệt / từ chối PR | | | ✅ | ✅ | ✅ |
| Quản lý PO (duyệt/gửi/hủy) | | ✅ | | | ✅ |
| Quản lý NCC & Hàng hóa | | ✅ | | | ✅ |
| Nhận hàng (GR) | | ✅ | | ✅ | ✅ |
| Hóa đơn & Thanh toán | | | | ✅ | ✅ |
| Người dùng & Cấu hình & Nhập Excel | | | | | ✅ |

> Ai cũng xem được Bảng điều khiển, Việc của tôi, Tìm kiếm, Hướng dẫn (trong phạm vi dữ liệu công ty mình).

---

## 14. Câu hỏi thường gặp

**Không thấy nút Duyệt trên PR?** → Chưa tới lượt bạn, hoặc PR không ở trạng thái "Chờ duyệt", hoặc bạn không có quyền duyệt.

**Duyệt xong PR mà không thấy PO?** → PO chỉ tự sinh khi PR **duyệt hết các cấp**. PR nhiều cấp cần cấp sau duyệt tiếp.

**Nhận hàng xong PO vẫn "Nhận một phần"?** → Bạn mới nhận thiếu so với số lượng PO. Nhận tiếp cho đủ để chuyển "Đã nhận hàng".

**Hóa đơn thứ 2 báo "vượt số lượng"?** → Tổng số lượng các hóa đơn đã vượt số đã nhận. Kiểm tra lại số lượng.

**Xuất PDF ra file thế nào?** → Bấm "Xuất PDF / In" → trong hộp thoại in chọn **"Save as PDF / Lưu dưới dạng PDF"**.

**Mở trên điện thoại?** → Mở hệ thống bằng trình duyệt trên điện thoại; giao diện tự co gọn (menu ☰, bảng cuộn ngang).

---

*Hết. Tài liệu này mô tả toàn bộ tính năng hiện có của hệ thống. Xem thêm `NHAT_KY_THAY_DOI.md` để biết lịch sử cập nhật.*
