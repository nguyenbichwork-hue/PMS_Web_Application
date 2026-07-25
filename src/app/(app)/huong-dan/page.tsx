import { redirect } from "next/navigation";
import { getCurrentUser, can } from "@/lib/auth";
import { Card } from "@/components/ui";
import { ModuleBanner } from "@/components/module";
import { Icon } from "@/components/icons";
import { GuideAccordion, type GuideItem } from "./GuideAccordion";

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

  // Xây danh mục hướng dẫn — lọc theo quyền; mỗi mục bấm để mở chi tiết.
  const items: GuideItem[] = [];

  if (has("pr.create"))
    items.push({
      id: "pr", icon: "pr", tone: "violet", title: "Tạo yêu cầu mua (PR)",
      summary: "Lập yêu cầu mua hàng và gửi phê duyệt",
      content: (
        <>
          <Step n={1}>Vào <b>Yêu cầu mua → “+ Tạo yêu cầu”</b>.</Step>
          <Step n={2}>Chọn công ty, mục đích, mức ưu tiên, ngày cần hàng.</Step>
          <Step n={3}>Thêm từng dòng hàng: <b>gõ mã/tên</b> để tìm sản phẩm (tự điền tên/ĐVT), nhập số lượng & đơn giá dự kiến. Khi chọn hàng, hệ thống <b>gợi ý nhà cung cấp</b>.</Step>
          <Step n={4}>Bấm <b>“Lưu nháp”</b> hoặc <b>“Gửi phê duyệt”</b>.</Step>
          <Step n={5}>Có thể đính kèm báo giá/tài liệu ở trang chi tiết.</Step>
        </>
      ),
    });

  if (has("pr.approve"))
    items.push({
      id: "approve", icon: "tasks", tone: "amber", title: "Phê duyệt yêu cầu mua",
      summary: "Duyệt / từ chối theo luồng cấp bậc",
      content: (
        <>
          <p>Mở yêu cầu đang <b>Chờ duyệt</b>. Khung bên phải hiển thị <b>luồng phê duyệt</b> theo giá trị (cấu hình ở Cấu hình → Luồng duyệt).</p>
          <p>Bấm <b>Duyệt</b> (kèm lý do) hoặc <b>Từ chối</b>. Khi duyệt đủ cấp, hệ thống <b>tự tạo Đơn đặt hàng (PO)</b>.</p>
          <p>🔁 PR bị <b>Từ chối</b> có thể bấm <b>“↻ Mở lại PR”</b> để trình duyệt lại từ đầu.</p>
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-700 ring-1 ring-inset ring-amber-100 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20">
            ⚖️ <b>Phân tách nhiệm vụ:</b> bạn <b>không thể tự duyệt PR do chính mình tạo</b> — phải người khác duyệt.
          </p>
        </>
      ),
    });

  if (has("po.manage"))
    items.push({
      id: "po", icon: "po", tone: "indigo", title: "Xử lý đơn đặt hàng (PO)",
      summary: "Điều chỉnh, duyệt, xuất PDF/Excel, gửi NCC",
      content: (
        <>
          <Step n={1}>Mở PO vừa được tạo tự động (trạng thái <b>Nháp</b>).</Step>
          <Step n={2}>Điều chỉnh nếu cần: nhà cung cấp, ngày giao, điều khoản, đơn giá — mọi thay đổi được lưu lịch sử.</Step>
          <Step n={3}>Bấm <b>Duyệt PO</b> → <b>Xuất PDF / In</b>, <b>Xuất Excel (mẫu MISA 34 cột)</b> hoặc <b>Gửi nhà cung cấp</b>.</Step>
          <Step n={4}>Khi NCC xác nhận, bấm <b>NCC xác nhận</b>; cần hủy thì <b>Hủy PO</b> (ghi lý do).</Step>
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-500 ring-1 ring-inset ring-slate-200 dark:bg-white/[0.04] dark:ring-white/10">
            🔒 Chỉ sửa nội dung PO khi còn <b>Nháp</b>. Đã duyệt rồi thì <b>khóa</b> — mọi người chỉ <b>bình luận</b>, không sửa.
          </p>
        </>
      ),
    });

  if (has("gr.manage"))
    items.push({
      id: "gr", icon: "gr", tone: "teal", title: "Nhận hàng — toàn bộ & từng phần",
      summary: "Ghi nhận số lượng thực nhận theo PO",
      content: (
        <>
          <Step n={1}>Từ PO (đã gửi/xác nhận) bấm <b>→ Tạo phiếu nhận hàng</b>, chọn kho & ngày, nhập <b>số lượng thực nhận</b>.</Step>
          <Step n={2}>Nhận <b>đủ</b> → PO chuyển <b>“Đã nhận hàng”</b>.</Step>
          <Step n={3}>Nhận <b>thiếu</b> → PO <b>“Nhận một phần”</b>; nhận tiếp bằng phiếu khác, hệ thống cộng dồn.</Step>
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-500 ring-1 ring-inset ring-slate-200 dark:bg-white/[0.04] dark:ring-white/10">
            📥 Có thể <b>nhập nhanh từ file Excel phiếu nhận</b> (cột Số PO · Mã hàng · SL nhận) — tự khớp về đúng dòng PO.
          </p>
        </>
      ),
    });

  if (has("invoice.manage")) {
    items.push({
      id: "invoice", icon: "invoice", tone: "emerald", title: "Hóa đơn & đối chiếu 3 bên",
      summary: "Nhập hóa đơn và tự đối chiếu với PO/nhận hàng",
      content: (
        <>
          <Step n={1}>Menu <b>Hóa đơn → + Nhập hóa đơn</b> (hoặc từ PO). Có thể <b>tải file XML hóa đơn điện tử</b> để tự điền.</Step>
          <Step n={2}>Nhập số hóa đơn, ngày, <b>chọn NCC thật</b>, VAT; chọn <b>PO</b> và thêm dòng hàng.</Step>
          <Step n={3}>Lưu → hệ thống tự <b>đối chiếu 4 bước</b>: Nhà cung cấp · Số lượng (không vượt phần còn lại) · Đơn giá theo dòng · VAT & Tổng tiền. Sai lệch trong <b>ngưỡng cấu hình</b> (Cấu hình → Đối chiếu) thì vẫn coi là khớp.</Step>
          <Step n={4}><b>Chống trùng:</b> cùng nhà cung cấp + cùng số hóa đơn sẽ bị chặn không cho nhập lại.</Step>
          <div className="mt-1 flex flex-wrap gap-2 text-[13px] font-semibold">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/25">KHỚP — cho thanh toán</span>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/25">CẢNH BÁO — kiểm tra lại</span>
            <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700 ring-1 ring-inset ring-rose-200 dark:bg-rose-400/10 dark:text-rose-300 dark:ring-rose-400/25">SAI LỆCH — giữ lại</span>
          </div>
        </>
      ),
    });

    items.push({
      id: "sync", icon: "invoice", tone: "cyan", title: "Đồng bộ hóa đơn từ Google Sheet",
      summary: "Tự lấy hóa đơn Mua vào và ghép PO (không cần Số PO)",
      content: (
        <>
          <p>Hóa đơn điện tử đã gom về Google Sheet sẽ được <b>tự ghép vào PO</b> theo <b>khóa tổng hợp</b>: nhà cung cấp (MST) + mã hàng + đơn giá + số tiền — <b>không cần nhập Số PO</b>.</p>
          <Step n={1}>Vào <b>Hóa đơn → “Đồng bộ hóa đơn”</b> → bấm <b>“Quét hóa đơn từ Google Sheet”</b>.</Step>
          <Step n={2}>Hệ thống chỉ lấy hóa đơn <b>Mua vào của công ty mình</b>, so khớp với PO đang mở, hiện mức <b>TỰ ĐỘNG</b> (khớp chắc) hoặc <b>CẦN XEM</b> (cần người quyết) kèm PO gợi ý + lý do.</Step>
          <Step n={3}><b>Tick chọn</b> từng hóa đơn muốn nhập (mục TỰ ĐỘNG được tick sẵn), chỉnh PO ở ô chọn nếu cần.</Step>
          <Step n={4}>Bấm <b>“Nhập N hóa đơn đã chọn”</b> → lưu + chạy đối chiếu 3 bên; hóa đơn đã nhập không hiện lại (chống trùng).</Step>
          <p className="rounded-lg bg-cyan-50 px-3 py-2 text-[13px] text-cyan-700 ring-1 ring-inset ring-cyan-100 dark:bg-cyan-400/10 dark:text-cyan-300 dark:ring-cyan-400/20">
            💡 Chỉ hóa đơn có <b>NCC + PO khớp</b> mới hiện. Muốn ghép được, trong hệ thống phải có <b>PO tương ứng</b> (đúng NCC + mã hàng) trước.
          </p>
        </>
      ),
    });

    items.push({
      id: "pay", icon: "invoice", tone: "emerald", title: "Thanh toán nhiều đợt",
      summary: "Ghi nhận thanh toán, trả hết, điều chỉnh giảm",
      content: (
        <>
          <p>Trên hóa đơn <b>đã Khớp/Cảnh báo</b>, khung <b>Thanh toán</b> cho thấy Tổng · Đã trả · Còn lại + lịch sử.</p>
          <Step n={1}>Nhập số tiền, chọn phương thức & số tham chiếu → <b>Ghi nhận</b>. Hoặc <b>Trả hết</b>.</Step>
          <Step n={2}>Trả đủ → hóa đơn <b>“Đã thanh toán”</b> (không cho trả vượt).</Step>
          <Step n={3}><b>Điều chỉnh giảm (Credit Note):</b> khi trả hàng/giảm giá sau hóa đơn — nhập số tiền giảm ở khung <b>Điều chỉnh giảm</b>, hệ thống trừ vào nghĩa vụ phải trả.</Step>
        </>
      ),
    });
  }

  if (has("supplier.manage") || has("product.manage"))
    items.push({
      id: "master", icon: "supplier", tone: "amber", title: "Nhà cung cấp & hàng hóa",
      summary: "Thêm/sửa/xóa và nhập/xuất Excel",
      content: (
        <ul className="ml-4 list-disc space-y-1">
          <li><b>Thêm/Sửa:</b> nút <b>“+ Thêm”</b> hoặc <b>“Sửa”</b> trên mỗi thẻ.</li>
          <li><b>Xóa:</b> mở <b>Sửa</b> → nút <b>“Xóa”</b> (đỏ). Nếu mục đã phát sinh chứng từ (PO/hóa đơn) sẽ được chuyển <b>“Ngưng”</b> thay vì xóa để không vỡ dữ liệu.</li>
          <li><b>Nhập Excel:</b> nút <b>“⬆ Nhập Excel”</b> — tự dò tiêu đề, trùng mã → cập nhật. Tick <b>“Đồng bộ đầy đủ”</b> để <b>xóa mục không có trong file</b>.</li>
          <li><b>Xuất Excel:</b> nút <b>“⬇ Xuất Excel”</b> — xuất đúng bộ lọc đang xem; xuất ra rồi <b>nhập lại được</b>.</li>
        </ul>
      ),
    });

  items.push({
    id: "chain", icon: "invoice", tone: "cyan", title: "Bình luận & Truy vết chứng từ",
    summary: "Trao đổi và xem cả chuỗi PR → Thanh toán",
    content: (
      <ul className="ml-4 list-disc space-y-1">
        <li>💬 <b>Bình luận:</b> mọi chứng từ (PR/PO) đều có khung <b>Bình luận</b> ở trang chi tiết — trao đổi tự do, <b>không đổi trạng thái</b>. Đơn <b>đã duyệt</b> thì nhân viên vẫn bình luận được (chỉ không sửa nội dung). Bình luận mới nhất còn hiện ở <b>Bảng điều khiển</b>.</li>
        <li>🔗 <b>Xem chuỗi chứng từ:</b> nút <b>“Xem chuỗi chứng từ”</b> ở chi tiết PR/PO/Hóa đơn mở màn <b>truy vết</b> cả chuỗi <b>Yêu cầu mua → Đơn hàng → Nhận hàng → Hóa đơn → Thanh toán</b> kèm số đã trả / còn lại.</li>
      </ul>
    ),
  });

  items.push({
    id: "tasks", icon: "tasks", tone: "indigo", title: "Việc của tôi & chuông thông báo",
    summary: "Xem nhanh việc đang chờ bạn",
    content: (
      <p>
        <b>Chuông</b> trên thanh trên hiện <b>số việc đang chờ bạn</b>. Bấm chuông (hoặc menu <b>“Việc của tôi”</b>) để xem
        danh sách gom theo vai trò, bấm một mục để tới ngay danh sách đã lọc.
      </p>
    ),
  });

  items.push({
    id: "tips", icon: "dashboard", tone: "violet", title: "Tìm kiếm nhanh & mẹo",
    summary: "Ctrl+K, giao diện sáng/tối, lọc nhanh",
    content: (
      <ul className="ml-4 list-disc space-y-1">
        <li>Nhấn <b>Ctrl+K</b> (hoặc ô “Tìm kiếm…”) → gõ số phiếu hoặc tên NCC/hàng hóa; <b>↑ ↓</b> chọn, <b>Enter</b> mở. Kết quả đã lọc theo quyền của bạn.</li>
        <li>Nút <b>🌙 / ☀️</b> đổi giao diện <b>sáng / tối</b>; bấm <b>thẻ số liệu</b> ở Bảng điều khiển để lọc nhanh.</li>
        <li>Mọi danh sách đều có <b>tìm kiếm</b>, <b>bộ lọc</b>, <b>phân trang</b>. Chứng từ trễ hạn hiện <b>badge đỏ “Trễ Nn”</b>.</li>
        <li>Trên điện thoại: sidebar thu thành nút <b>☰</b>, bảng dài <b>cuộn ngang</b>.</li>
      </ul>
    ),
  });

  if (has("settings.manage"))
    items.push({
      id: "settings", icon: "settings", tone: "slate", title: "Cấu hình hệ thống (Quản trị)",
      summary: "Luồng duyệt, đối chiếu, người dùng, công ty…",
      content: (
        <ul className="ml-4 list-disc space-y-1">
          <li><b>Luồng duyệt:</b> thêm/sửa ngưỡng phê duyệt theo giá trị.</li>
          <li><b>Đối chiếu:</b> đặt <b>ngưỡng sai lệch (%)</b> cho đơn giá / tổng tiền / số lượng khi đối chiếu hóa đơn.</li>
          <li><b>Người dùng:</b> thêm/sửa vai trò, công ty, đặt lại mật khẩu; <b>nhập/xuất Excel</b> tài khoản; <b>xóa</b> (nếu đã có dữ liệu → hiện bảng liệt kê & cho xóa kèm chuyển dữ liệu về bạn).</li>
          <li><b>Công ty:</b> thêm/sửa pháp nhân (mã, tên, MST, địa chỉ).</li>
          <li><b>Nhật ký & Truy cập:</b> nhật ký hệ thống realtime + danh sách IP đăng nhập; Admin có thể <b>dọn nhật ký</b>.</li>
          <li><b>Giao diện:</b> đổi <b>màu nhấn</b> & <b>sáng/tối</b>, lưu trên trình duyệt.</li>
        </ul>
      ),
    });

  return (
    <div className="mx-auto max-w-4xl">
      <ModuleBanner accent="slate" title="Hướng dẫn sử dụng" subtitle={`Bấm vào từng danh mục để xem hướng dẫn chi tiết. Chỉ hiện phần bạn (${ROLE_VI[role] ?? role}) có quyền.`} />

      {/* Tổng quan — luôn hiển thị */}
      <div className="mb-4 grid gap-4">
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/12 text-indigo-500 dark:text-indigo-300">
              <Icon name="flow" size={20} />
            </span>
            <h2 className="text-[17px] font-bold text-slate-900 dark:text-slate-100">Quy trình tổng quát</h2>
          </div>
          <p className="text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
            Hệ thống số hóa toàn bộ chuỗi mua hàng theo nguyên tắc <b>“nhập một lần”</b> — dữ liệu chảy tự động từ yêu cầu
            xuống các bước sau, không phải gõ lại:
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] font-semibold">
            {["Yêu cầu mua", "Phê duyệt", "Đơn đặt hàng (tự sinh)", "Nhận hàng", "Hóa đơn", "Đối chiếu", "Thanh toán"].map((s, i, arr) => (
              <span key={s} className="flex items-center gap-2">
                <span className="rounded-lg bg-brand-50 px-2.5 py-1 text-brand-700 ring-1 ring-inset ring-brand-100 dark:bg-brand-500/12 dark:text-brand-300 dark:ring-brand-500/20">{s}</span>
                {i < arr.length - 1 && <span className="text-slate-300">→</span>}
              </span>
            ))}
          </div>
        </Card>
      </div>

      {/* Danh mục chi tiết — bấm để mở */}
      <GuideAccordion items={items} />
    </div>
  );
}
