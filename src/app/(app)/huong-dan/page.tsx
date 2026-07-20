import { Card } from "@/components/ui";
import { ModuleBanner } from "@/components/module";

function Section({ icon, title, color, children }: { icon: string; title: string; color: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${color} text-base`}>{icon}</span>
        <h2 className="text-base font-bold text-slate-800">{title}</h2>
      </div>
      <div className="space-y-2 text-sm leading-relaxed text-slate-600">{children}</div>
    </Card>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-xs font-bold text-white">
        {n}
      </span>
      <div className="pt-0.5">{children}</div>
    </div>
  );
}

const ROLES: [string, string, string][] = [
  ["Nhân viên", "bg-sky-100 text-sky-700", "Tạo yêu cầu mua (PR), theo dõi PR của mình, đính kèm báo giá."],
  ["Mua hàng", "bg-violet-100 text-violet-700", "Điều chỉnh & gửi PO, tạo phiếu nhận hàng, quản lý NCC/hàng hóa."],
  ["Quản lý", "bg-amber-100 text-amber-700", "Phê duyệt hoặc từ chối yêu cầu mua của phòng ban."],
  ["Kế toán", "bg-emerald-100 text-emerald-700", "Nhập hóa đơn, xem kết quả đối chiếu, đánh dấu thanh toán."],
  ["Quản trị", "bg-fuchsia-100 text-fuchsia-700", "Quản lý người dùng, dữ liệu nền, cấu hình luồng duyệt."],
];

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-4xl">
      <ModuleBanner
        accent="indigo"
        icon="📖"
        title="Hướng dẫn sử dụng"
        subtitle="Làm quen với quy trình mua hàng chỉ trong vài phút"
      />

      <div className="grid gap-4">
        <Section icon="🔄" title="Quy trình tổng quát" color="bg-indigo-100 text-indigo-700">
          <p>
            Hệ thống số hóa toàn bộ chuỗi mua hàng theo nguyên tắc <b>“nhập một lần”</b> — dữ liệu chảy tự động từ
            yêu cầu xuống các bước sau, không phải gõ lại:
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
            {["Yêu cầu mua", "Phê duyệt", "Đơn đặt hàng (tự sinh)", "Nhận hàng", "Hóa đơn", "Đối chiếu", "Thanh toán"].map(
              (s, i, arr) => (
                <span key={s} className="flex items-center gap-2">
                  <span className="rounded-lg bg-violet-50 px-2.5 py-1 text-violet-700">{s}</span>
                  {i < arr.length - 1 && <span className="text-slate-300">→</span>}
                </span>
              )
            )}
          </div>
        </Section>

        <Section icon="👥" title="Vai trò & quyền hạn" color="bg-fuchsia-100 text-fuchsia-700">
          <div className="space-y-2">
            {ROLES.map(([r, cls, desc]) => (
              <div key={r} className="flex items-start gap-3">
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{r}</span>
                <span>{desc}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section icon="📝" title="Tạo yêu cầu mua (dành cho Nhân viên)" color="bg-violet-100 text-violet-700">
          <Step n={1}>Vào <b>Yêu cầu mua → “+ Tạo yêu cầu”</b>.</Step>
          <Step n={2}>Chọn công ty, mục đích, mức ưu tiên, ngày cần hàng.</Step>
          <Step n={3}>Thêm từng dòng hàng: chọn sản phẩm (tự điền tên/ĐVT), nhập số lượng & đơn giá dự kiến.</Step>
          <Step n={4}>Bấm <b>“Lưu nháp”</b> để lưu tạm, hoặc <b>“Gửi phê duyệt”</b> để chuyển cho quản lý.</Step>
          <Step n={5}>Có thể đính kèm báo giá/tài liệu ở khung “Tài liệu đính kèm” trong trang chi tiết.</Step>
        </Section>

        <Section icon="✅" title="Phê duyệt (dành cho Quản lý / Kế toán)" color="bg-amber-100 text-amber-700">
          <p>Mở yêu cầu đang <b>Chờ duyệt</b>. Khung bên phải hiển thị <b>luồng phê duyệt</b> theo giá trị:</p>
          <ul className="ml-4 list-disc space-y-0.5">
            <li>Dưới 20 triệu → chỉ cần <b>Quản lý</b>.</li>
            <li>20–100 triệu → <b>Quản lý</b> rồi <b>Kế toán</b>.</li>
            <li>Trên 100 triệu → thêm <b>Ban giám đốc</b>.</li>
          </ul>
          <p>Bấm <b>Duyệt</b> (kèm nhận xét) hoặc <b>Từ chối</b>. Khi duyệt đủ cấp, hệ thống <b>tự tạo Đơn đặt hàng (PO)</b>.</p>
        </Section>

        <Section icon="🧾" title="Xử lý đơn hàng (dành cho Mua hàng)" color="bg-indigo-100 text-indigo-700">
          <Step n={1}>Mở PO vừa được tạo tự động (trạng thái <b>Nháp</b>).</Step>
          <Step n={2}>Điều chỉnh nếu cần: nhà cung cấp, ngày giao, điều khoản, đơn giá — mọi thay đổi được lưu lịch sử.</Step>
          <Step n={3}>Bấm <b>Duyệt PO</b> → <b>Xuất PDF / In</b> (mở bản in đẹp, chọn “Lưu dưới dạng PDF”) hoặc <b>Gửi nhà cung cấp</b>.</Step>
          <Step n={4}>Khi NCC xác nhận, bấm <b>NCC xác nhận</b>; nếu cần hủy thì <b>Hủy PO</b> (ghi lý do).</Step>
        </Section>

        <Section icon="📦" title="Nhận hàng — toàn bộ & từng phần" color="bg-teal-100 text-teal-700">
          <Step n={1}>Từ PO (đã gửi/xác nhận) bấm <b>→ Tạo phiếu nhận hàng</b>, chọn kho & ngày, nhập <b>số lượng thực nhận</b> từng dòng.</Step>
          <Step n={2}>Nhận <b>đủ</b> số lượng PO → PO chuyển <b>“Đã nhận hàng”</b>.</Step>
          <Step n={3}>Nhận <b>thiếu</b> → PO chuyển <b>“Nhận một phần”</b>; có thể <b>nhận tiếp</b> (tạo phiếu khác) — hệ thống cộng dồn.</Step>
        </Section>

        <Section icon="💳" title="Hóa đơn & nhiều hóa đơn/PO (Kế toán)" color="bg-emerald-100 text-emerald-700">
          <Step n={1}>Menu <b>Hóa đơn → + Nhập hóa đơn</b> (hoặc từ PO bấm “→ Nhập hóa đơn”).</Step>
          <Step n={2}>Nhập số hóa đơn, ngày, <b>chọn NCC thật của hóa đơn</b>, VAT; chọn <b>PO</b> và thêm dòng hàng.</Step>
          <Step n={3}>Lưu → hệ thống tự <b>đối chiếu 4 bước</b>.</Step>
          <Step n={4}><b>Nhiều hóa đơn cho 1 PO:</b> hóa đơn sau tự trừ phần đã xuất trước — không cho xuất vượt số đã nhận.</Step>
        </Section>

        <Section icon="🔍" title="Hiểu kết quả đối chiếu" color="bg-emerald-100 text-emerald-700">
          <p>Engine so sánh hóa đơn với PO và phiếu nhận hàng qua 4 bước:</p>
          <ul className="ml-4 list-disc space-y-0.5">
            <li><b>Nhà cung cấp</b> — hóa đơn đúng NCC của PO?</li>
            <li><b>Số lượng</b> — không vượt số <b>còn lại</b> (đã nhận − đã xuất hóa đơn trước) & số trên PO?</li>
            <li><b>Đơn giá</b> — khớp theo từng dòng?</li>
            <li><b>VAT & Tổng tiền</b> — đúng kỳ vọng?</li>
          </ul>
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-emerald-700">KHỚP — cho thanh toán</span>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-amber-700">CẢNH BÁO — kiểm tra lại</span>
            <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-rose-700">SAI LỆCH — giữ lại, làm việc với NCC</span>
          </div>
        </Section>

        <Section icon="💰" title="Thanh toán nhiều đợt (Kế toán)" color="bg-emerald-100 text-emerald-700">
          <p>Trên hóa đơn <b>đã Khớp/Cảnh báo</b>, khung <b>Thanh toán</b> cho thấy Tổng · Đã trả · Còn lại + lịch sử các đợt.</p>
          <Step n={1}>Nhập số tiền (mặc định = còn lại), chọn phương thức & số tham chiếu → bấm <b>Ghi nhận</b>.</Step>
          <Step n={2}>Hoặc bấm <b>Trả hết</b> để thanh toán toàn bộ số còn lại trong 1 lần.</Step>
          <Step n={3}>Khi trả đủ → hóa đơn chuyển <b>“Đã thanh toán”</b>. Không cho trả vượt số còn lại.</Step>
        </Section>

        <Section icon="✅" title="Việc của tôi & Chuông thông báo" color="bg-indigo-100 text-indigo-700">
          <p>
            <b>Chuông 🔔</b> trên thanh trên hiện <b>số việc đang chờ bạn</b>. Bấm chuông (hoặc menu <b>“Việc của tôi”</b>) để
            xem danh sách gom theo vai trò: PR chờ bạn duyệt, PO nháp cần duyệt, PO cần gửi NCC, hóa đơn chờ đối chiếu /
            chờ thanh toán… Bấm một mục để tới ngay danh sách đã lọc.
          </p>
        </Section>

        <Section icon="🔍" title="Tìm kiếm nhanh (Ctrl+K)" color="bg-violet-100 text-violet-700">
          <p>
            Nhấn <b>Ctrl+K</b> (hoặc bấm ô “Tìm kiếm…” trên thanh trên) → gõ số phiếu (PR/PO/hóa đơn/GR) hoặc tên
            (nhà cung cấp, hàng hóa). Dùng <b>↑ ↓</b> để chọn, <b>Enter</b> để mở. Kết quả đã lọc theo quyền của bạn.
          </p>
        </Section>

        <Section icon="📤" title="Xuất & Nhập dữ liệu" color="bg-teal-100 text-teal-700">
          <ul className="ml-4 list-disc space-y-0.5">
            <li><b>Xuất Excel:</b> nút <b>⬇ Excel</b> trên các danh sách (PR/PO/Nhận hàng/Hóa đơn) — xuất đúng bộ lọc đang xem.</li>
            <li><b>Xuất PDF đơn hàng:</b> trên PO bấm <b>Xuất PDF / In</b>.</li>
            <li><b>Nhập Excel</b> (Quản trị): Cấu hình → <b>Nhập Excel</b> — nạp Công ty/Phòng ban/Người dùng/NCC/Hàng hóa/Hạn mức từ file mẫu. Trùng mã/email → cập nhật, không xóa dữ liệu cũ.</li>
          </ul>
        </Section>

        <Section icon="⚙️" title="Cấu hình hệ thống (Quản trị)" color="bg-slate-200 text-slate-700">
          <ul className="ml-4 list-disc space-y-0.5">
            <li><b>Luồng duyệt:</b> thêm/sửa ngưỡng duyệt theo giá trị.</li>
            <li><b>Người dùng:</b> thêm/sửa vai trò, công ty, đặt lại mật khẩu.</li>
            <li><b>Công ty / Nhật ký:</b> danh sách pháp nhân & nhật ký hệ thống.</li>
            <li><b>Giao diện:</b> đổi <b>màu chủ đạo</b> toàn hệ thống (6 tông), lưu trên trình duyệt.</li>
          </ul>
        </Section>

        <Section icon="📱" title="Dùng trên điện thoại" color="bg-cyan-100 text-cyan-700">
          <p>
            Giao diện tự co gọn cho màn hình nhỏ: sidebar thu thành nút <b>☰</b> (menu trượt), bảng dài <b>cuộn ngang</b>,
            các thẻ & biểu đồ tự xếp lại. Mở hệ thống bằng trình duyệt trên điện thoại là dùng được bình thường.
          </p>
        </Section>

        <Section icon="💡" title="Mẹo nhanh" color="bg-slate-200 text-slate-700">
          <ul className="ml-4 list-disc space-y-1">
            <li>Dùng nút <b>🌙 / ☀️</b> trên thanh trên để đổi giao diện <b>sáng / tối</b>.</li>
            <li>Bấm các <b>thẻ số liệu</b> ở Bảng điều khiển để lọc nhanh danh sách tương ứng.</li>
            <li>Mọi trang danh sách đều có <b>tìm kiếm</b>, <b>bộ lọc</b> và <b>phân trang</b> (20 dòng/trang).</li>
            <li>Chứng từ trễ hạn hiện <b>badge đỏ “Trễ Nn”</b> (PR quá ngày cần, PO quá ngày giao).</li>
            <li>Quản trị đổi được <b>màu giao diện</b> ở Cấu hình → Giao diện.</li>
            <li>Mọi thao tác quan trọng đều được ghi <b>nhật ký</b> (xem ở mục Cấu hình — chỉ Quản trị).</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
