import { redirect } from "next/navigation";
import { getCurrentUser, can } from "@/lib/auth";
import { Card } from "@/components/ui";
import { ModuleBanner } from "@/components/module";
import { Icon } from "@/components/icons";

const TILE: Record<string, string> = {
  slate: "bg-slate-500/12 text-slate-500 dark:text-slate-300",
  violet: "bg-violet-500/12 text-violet-500 dark:text-violet-300",
  amber: "bg-amber-500/12 text-amber-600 dark:text-amber-300",
  emerald: "bg-emerald-500/12 text-emerald-500 dark:text-emerald-300",
  indigo: "bg-indigo-500/12 text-indigo-500 dark:text-indigo-300",
  teal: "bg-teal-500/12 text-teal-500 dark:text-teal-300",
  cyan: "bg-cyan-500/12 text-cyan-500 dark:text-cyan-300",
  rose: "bg-rose-500/12 text-rose-500 dark:text-rose-300",
};

function Section({ icon, tone, title, children }: { icon: string; tone: keyof typeof TILE; title: string; children: React.ReactNode }) {
  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${TILE[tone]}`}>
          <Icon name={icon} size={20} />
        </span>
        <h2 className="text-[17px] font-bold text-slate-900">{title}</h2>
      </div>
      <div className="space-y-2.5 text-[15px] leading-relaxed text-slate-600">{children}</div>
    </Card>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">{n}</span>
      <div className="pt-0.5">{children}</div>
    </div>
  );
}

const ROLE_VI: Record<string, string> = { Employee: "Nhân viên", Purchasing: "Mua hàng", Manager: "Quản lý", Finance: "Kế toán", Admin: "Quản trị" };

export default async function GuidePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const role = user.role;
  const has = (p: string) => can(role, p);

  return (
    <div className="mx-auto max-w-4xl">
      <ModuleBanner accent="slate" title="Hướng dẫn sử dụng" subtitle={`Bạn đang đăng nhập với vai trò ${ROLE_VI[role] ?? role} — chỉ hiển thị hướng dẫn phần bạn có quyền.`} />

      <div className="grid gap-4">
        {/* Tổng quan — mọi vai trò */}
        <Section icon="flow" tone="indigo" title="Quy trình tổng quát">
          <p>
            Hệ thống số hóa toàn bộ chuỗi mua hàng theo nguyên tắc <b>“nhập một lần”</b> — dữ liệu chảy tự động từ yêu cầu
            xuống các bước sau, không phải gõ lại:
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] font-semibold">
            {["Yêu cầu mua", "Phê duyệt", "Đơn đặt hàng (tự sinh)", "Nhận hàng", "Hóa đơn", "Đối chiếu", "Thanh toán"].map((s, i, arr) => (
              <span key={s} className="flex items-center gap-2">
                <span className="rounded-lg bg-brand-50 px-2.5 py-1 text-brand-700 ring-1 ring-inset ring-brand-100 dark:bg-brand-500/12 dark:text-brand-300 dark:ring-brand-500/20">{s}</span>
                {i < arr.length - 1 && <span className="text-slate-300">→</span>}
              </span>
            ))}
          </div>
        </Section>

        {/* Vai trò của bạn */}
        <Section icon="users" tone="violet" title="Vai trò & quyền của bạn">
          <p>
            Vai trò hiện tại: <b>{ROLE_VI[role] ?? role}</b>. Bạn có quyền với các phần:
          </p>
          <div className="flex flex-wrap gap-2 pt-1 text-[13px] font-semibold">
            {[
              ["pr.create", "Tạo yêu cầu mua"],
              ["pr.approve", "Phê duyệt"],
              ["po.manage", "Đơn đặt hàng"],
              ["gr.manage", "Nhận hàng"],
              ["invoice.manage", "Hóa đơn & thanh toán"],
              ["supplier.manage", "Nhà cung cấp & hàng hóa"],
              ["settings.manage", "Cấu hình hệ thống"],
            ]
              .filter(([p]) => has(p))
              .map(([, label]) => (
                <span key={label} className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/25">
                  ✓ {label}
                </span>
              ))}
          </div>
        </Section>

        {has("pr.create") && (
          <Section icon="pr" tone="violet" title="Tạo yêu cầu mua (PR)">
            <Step n={1}>Vào <b>Yêu cầu mua → “+ Tạo yêu cầu”</b>.</Step>
            <Step n={2}>Chọn công ty, mục đích, mức ưu tiên, ngày cần hàng.</Step>
            <Step n={3}>Thêm từng dòng hàng: <b>gõ mã/tên</b> để tìm sản phẩm (tự điền tên/ĐVT), nhập số lượng & đơn giá dự kiến. Khi chọn hàng, hệ thống <b>gợi ý nhà cung cấp</b>.</Step>
            <Step n={4}>Bấm <b>“Lưu nháp”</b> hoặc <b>“Gửi phê duyệt”</b>.</Step>
            <Step n={5}>Có thể đính kèm báo giá/tài liệu ở trang chi tiết.</Step>
          </Section>
        )}

        {has("pr.approve") && (
          <Section icon="tasks" tone="amber" title="Phê duyệt yêu cầu mua">
            <p>Mở yêu cầu đang <b>Chờ duyệt</b>. Khung bên phải hiển thị <b>luồng phê duyệt</b> theo giá trị (cấu hình ở Cấu hình → Luồng duyệt).</p>
            <p>Bấm <b>Duyệt</b> (kèm nhận xét) hoặc <b>Từ chối</b>. Khi duyệt đủ cấp, hệ thống <b>tự tạo Đơn đặt hàng (PO)</b>.</p>
          </Section>
        )}

        {has("po.manage") && (
          <Section icon="po" tone="indigo" title="Xử lý đơn đặt hàng (PO)">
            <Step n={1}>Mở PO vừa được tạo tự động (trạng thái <b>Nháp</b>).</Step>
            <Step n={2}>Điều chỉnh nếu cần: nhà cung cấp, ngày giao, điều khoản, đơn giá — mọi thay đổi được lưu lịch sử.</Step>
            <Step n={3}>Bấm <b>Duyệt PO</b> → <b>Xuất PDF / In</b> hoặc <b>Gửi nhà cung cấp</b>.</Step>
            <Step n={4}>Khi NCC xác nhận, bấm <b>NCC xác nhận</b>; cần hủy thì <b>Hủy PO</b> (ghi lý do).</Step>
          </Section>
        )}

        {has("gr.manage") && (
          <Section icon="gr" tone="teal" title="Nhận hàng — toàn bộ & từng phần">
            <Step n={1}>Từ PO (đã gửi/xác nhận) bấm <b>→ Tạo phiếu nhận hàng</b>, chọn kho & ngày, nhập <b>số lượng thực nhận</b>.</Step>
            <Step n={2}>Nhận <b>đủ</b> → PO chuyển <b>“Đã nhận hàng”</b>.</Step>
            <Step n={3}>Nhận <b>thiếu</b> → PO <b>“Nhận một phần”</b>; nhận tiếp bằng phiếu khác, hệ thống cộng dồn.</Step>
          </Section>
        )}

        {has("invoice.manage") && (
          <>
            <Section icon="invoice" tone="emerald" title="Hóa đơn & đối chiếu">
              <Step n={1}>Menu <b>Hóa đơn → + Nhập hóa đơn</b> (hoặc từ PO).</Step>
              <Step n={2}>Nhập số hóa đơn, ngày, <b>chọn NCC thật</b>, VAT; chọn <b>PO</b> và thêm dòng hàng.</Step>
              <Step n={3}>Lưu → hệ thống tự <b>đối chiếu 4 bước</b>: Nhà cung cấp · Số lượng (không vượt phần còn lại) · Đơn giá theo dòng · VAT & Tổng tiền.</Step>
              <div className="mt-1 flex flex-wrap gap-2 text-[13px] font-semibold">
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/25">KHỚP — cho thanh toán</span>
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/25">CẢNH BÁO — kiểm tra lại</span>
                <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700 ring-1 ring-inset ring-rose-200 dark:bg-rose-400/10 dark:text-rose-300 dark:ring-rose-400/25">SAI LỆCH — giữ lại</span>
              </div>
            </Section>
            <Section icon="invoice" tone="emerald" title="Thanh toán nhiều đợt">
              <p>Trên hóa đơn <b>đã Khớp/Cảnh báo</b>, khung <b>Thanh toán</b> cho thấy Tổng · Đã trả · Còn lại + lịch sử.</p>
              <Step n={1}>Nhập số tiền, chọn phương thức & số tham chiếu → <b>Ghi nhận</b>. Hoặc <b>Trả hết</b>.</Step>
              <Step n={2}>Trả đủ → hóa đơn <b>“Đã thanh toán”</b> (không cho trả vượt).</Step>
            </Section>
          </>
        )}

        {(has("supplier.manage") || has("product.manage")) && (
          <Section icon="supplier" tone="amber" title="Nhà cung cấp & hàng hóa — thêm/sửa/xóa & Excel">
            <ul className="ml-4 list-disc space-y-1">
              <li><b>Thêm/Sửa:</b> nút <b>“+ Thêm”</b> hoặc <b>“Sửa”</b> trên mỗi thẻ.</li>
              <li><b>Xóa:</b> mở <b>Sửa</b> → nút <b>“Xóa”</b> (đỏ). Nếu mục đã phát sinh chứng từ (PO/hóa đơn) sẽ được chuyển <b>“Ngưng”</b> thay vì xóa để không vỡ dữ liệu.</li>
              <li><b>Nhập Excel:</b> nút <b>“⬆ Nhập Excel”</b> — tự dò tiêu đề, trùng mã → cập nhật. Tick <b>“Đồng bộ đầy đủ”</b> để <b>xóa mục không có trong file</b> (chỉ giữ đúng nội dung file).</li>
              <li><b>Xuất Excel:</b> nút <b>“⬇ Xuất Excel”</b> — xuất đúng bộ lọc đang xem; xuất ra rồi <b>nhập lại được</b>.</li>
            </ul>
          </Section>
        )}

        {/* Chung cho mọi người */}
        <Section icon="tasks" tone="indigo" title="Việc của tôi & chuông thông báo">
          <p>
            <b>Chuông</b> trên thanh trên hiện <b>số việc đang chờ bạn</b>. Bấm chuông (hoặc menu <b>“Việc của tôi”</b>) để xem
            danh sách gom theo vai trò, bấm một mục để tới ngay danh sách đã lọc.
          </p>
        </Section>

        <Section icon="dashboard" tone="violet" title="Tìm kiếm nhanh & mẹo">
          <ul className="ml-4 list-disc space-y-1">
            <li>Nhấn <b>Ctrl+K</b> (hoặc ô “Tìm kiếm…”) → gõ số phiếu hoặc tên NCC/hàng hóa; <b>↑ ↓</b> chọn, <b>Enter</b> mở. Kết quả đã lọc theo quyền của bạn.</li>
            <li>Nút <b>🌙 / ☀️</b> đổi giao diện <b>sáng / tối</b>; bấm <b>thẻ số liệu</b> ở Bảng điều khiển để lọc nhanh.</li>
            <li>Mọi danh sách đều có <b>tìm kiếm</b>, <b>bộ lọc</b>, <b>phân trang</b>. Chứng từ trễ hạn hiện <b>badge đỏ “Trễ Nn”</b>.</li>
            <li>Trên điện thoại: sidebar thu thành nút <b>☰</b>, bảng dài <b>cuộn ngang</b>.</li>
          </ul>
        </Section>

        {has("settings.manage") && (
          <Section icon="settings" tone="slate" title="Cấu hình hệ thống (Quản trị)">
            <ul className="ml-4 list-disc space-y-1">
              <li><b>Luồng duyệt:</b> thêm/sửa ngưỡng phê duyệt theo giá trị.</li>
              <li><b>Người dùng:</b> thêm/sửa vai trò, công ty, đặt lại mật khẩu; <b>nhập/xuất Excel</b> tài khoản; <b>xóa</b> (nếu đã có dữ liệu → hiện bảng liệt kê & cho xóa kèm chuyển dữ liệu về bạn).</li>
              <li><b>Công ty / Nhật ký:</b> danh sách pháp nhân & nhật ký hệ thống (realtime).</li>
              <li><b>Giao diện:</b> đổi <b>màu nhấn</b> & <b>sáng/tối</b>, lưu trên trình duyệt.</li>
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}
