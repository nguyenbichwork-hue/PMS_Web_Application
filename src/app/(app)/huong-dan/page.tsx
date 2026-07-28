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

// ---- Dòng chảy nghiệp vụ chi tiết: mỗi mốc ghi rõ AI làm & hệ thống tự làm gì ----
interface FlowStep { role: string; title: string; detail: string; auto?: string }
const FLOW: FlowStep[] = [
  {
    role: "Nhân viên / Mua hàng",
    title: "Lập Yêu cầu mua (PR)",
    detail: "Chọn công ty, dự án/công trình, khách hàng phục vụ, hình thức thanh toán (ứng trước %/trả sau); thêm dòng hàng + nhà cung cấp đề xuất; gửi phê duyệt.",
  },
  {
    role: "Mua hàng",
    title: "Duyệt Yêu cầu mua",
    detail: "Kiểm tra nhu cầu, duyệt hoặc từ chối. Không được tự duyệt PR do chính mình tạo (phân tách nhiệm vụ).",
    auto: "Duyệt xong hệ thống tự sinh Đơn đặt hàng (PO) ở trạng thái Nháp — không phải gõ lại.",
  },
  {
    role: "Quản lý",
    title: "Duyệt Đơn đặt hàng (PO)",
    detail: "Rà soát nhà cung cấp, số lượng, đơn giá. Nếu PO gắn dự án có ngân sách và tổng cam kết vượt ngân sách → hệ thống chặn duyệt.",
    auto: "Duyệt xong hệ thống tự sinh Đề nghị thanh toán (PRQ) từ PO và mở luôn màn PRQ.",
  },
  {
    role: "Kế toán",
    title: "Hoàn thiện & duyệt Đề nghị thanh toán (PRQ)",
    detail: "Bổ sung số tài khoản/ngân hàng, nhập số tiền (gõ tiền trước thuế + %VAT là tự ra số gồm thuế), có thể gộp nhiều PO cùng NCC hoặc trả từng phần; gửi duyệt → duyệt → xuất Excel theo mẫu công ty để ký.",
  },
  {
    role: "Thủ kho (tùy chọn)",
    title: "Nhận hàng (GRN)",
    detail: "Ghi số lượng thực nhận theo PO, ghi chú lý do nếu thiếu. Nhận từng phần được; không bắt buộc cho mọi đơn.",
  },
  {
    role: "Kế toán",
    title: "Hóa đơn & Đối chiếu",
    detail: "Nhập/đồng bộ hóa đơn NCC (ngày hóa đơn phải ≥ ngày PO). Hệ thống đối chiếu tự động với PO và số đã nhận; sai lệch có thể sửa lại PO cho khớp hóa đơn điện tử.",
  },
  {
    role: "Kế toán",
    title: "Thanh toán & theo dõi",
    detail: "Ghi nhận thanh toán nhiều đợt. Công nợ nhà cung cấp và Dashboard thuế GTGT tự cập nhật theo hóa đơn — không nhập tay.",
  },
];

function FlowTimeline() {
  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-6 dark:border-white/10">
      {FLOW.map((s, i) => (
        <li key={i} className="relative">
          <span className="absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">{i + 1}</span>
          <div className="rounded-xl border border-slate-200/70 bg-white p-3.5 dark:border-white/10 dark:bg-white/[0.02]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">{s.role}</span>
              <span className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">{s.title}</span>
            </div>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-600 dark:text-slate-300">{s.detail}</p>
            {s.auto && (
              <p className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[12.5px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20">
                Tự động: {s.auto}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export default async function GuidePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const role = user.role;
  const has = (p: string) => can(role, p);

  const items: GuideItem[] = [];

  if (has("pr.create"))
    items.push({
      id: "pr", icon: "pr", tone: "violet", title: "Tạo yêu cầu mua (PR)",
      summary: "Lập yêu cầu mua hàng và gửi phê duyệt",
      content: (
        <>
          <Step n={1}>Vào <b>Yêu cầu mua → “+ Tạo yêu cầu”</b>.</Step>
          <Step n={2}>Chọn <b>công ty</b>, <b>dự án/công trình</b> (tự điền mã công trình + gợi ý khách hàng), <b>khách hàng</b> đơn phục vụ, <b>số đơn bán/HĐ bán</b>, mục đích, ưu tiên, ngày cần hàng.</Step>
          <Step n={3}>Chọn <b>hình thức thanh toán</b> (trả sau / ứng trước — nếu ứng trước nhập tỷ lệ %).</Step>
          <Step n={4}>Thêm từng dòng hàng: <b>gõ mã/tên</b> để tìm sản phẩm (tự điền tên/ĐVT/VAT), nhập số lượng & đơn giá dự kiến; hệ thống <b>gợi ý nhà cung cấp</b> theo lịch sử.</Step>
          <Step n={5}>Bấm <b>“Lưu nháp”</b> hoặc <b>“Gửi phê duyệt”</b>. Có thể đính kèm báo giá ở trang chi tiết. Ô tô <b>vàng</b> là phần người yêu cầu điền.</Step>
        </>
      ),
    });

  if (has("pr.approve"))
    items.push({
      id: "approve", icon: "tasks", tone: "amber", title: "Phê duyệt yêu cầu mua (Mua hàng)",
      summary: "Duyệt / từ chối — duyệt xong tự sinh PO",
      content: (
        <>
          <p>Mở yêu cầu đang <b>Chờ duyệt</b>, xem chi tiết hàng hóa & giá trị.</p>
          <p>Bấm <b>Duyệt</b> (kèm lý do) hoặc <b>Từ chối</b>. Khi duyệt, hệ thống <b>tự tạo Đơn đặt hàng (PO) nháp</b> chuyển sang bộ phận Quản lý.</p>
          <p>PR bị <b>Từ chối</b> có thể bấm <b>“Mở lại PR”</b> để trình duyệt lại từ đầu.</p>
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-700 ring-1 ring-inset ring-amber-100 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20">
            <b>Phân tách nhiệm vụ:</b> bạn <b>không thể tự duyệt PR do chính mình tạo</b> — phải người khác duyệt.
          </p>
        </>
      ),
    });

  if (has("po.manage") || has("po.approve"))
    items.push({
      id: "po", icon: "po", tone: "indigo", title: "Đơn đặt hàng (PO)",
      summary: "Duyệt, điều chỉnh khớp hóa đơn, xuất PDF/Excel",
      content: (
        <>
          <Step n={1}>Mở PO vừa được tạo tự động (trạng thái <b>Nháp</b>).</Step>
          <Step n={2}><b>Quản lý</b> bấm <b>“Duyệt đơn hàng”</b>. Nếu PO gắn dự án có ngân sách và tổng cam kết <b>vượt ngân sách</b> → hệ thống <b>chặn duyệt</b> kèm số tiền. Duyệt xong hệ thống <b>tự sinh Đề nghị thanh toán</b>.</Step>
          <Step n={3}>Có thể <b>“Xuất PDF / In”</b>, <b>Xuất Excel (mẫu MISA)</b>, <b>“Gửi cho nhà cung cấp”</b>, hoặc <b>“Nhà cung cấp xác nhận”</b>.</Step>
          <Step n={4}>Cần hủy thì <b>“Hủy đơn hàng”</b> (ghi lý do).</Step>
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-500 ring-1 ring-inset ring-slate-200 dark:bg-white/[0.04] dark:ring-white/10">
            Có thể <b>sửa nội dung PO cho khớp hóa đơn điện tử</b> (số lượng/đơn giá) ở mọi trạng thái, <b>trừ khi đã Đóng/Hủy</b>. Mọi thay đổi được ghi lịch sử; sửa xong vào hóa đơn bấm <b>“Đối chiếu lại”</b>.
          </p>
        </>
      ),
    });

  if (has("prq.manage") || has("prq.approve"))
    items.push({
      id: "prq", icon: "invoice", tone: "emerald", title: "Đề nghị thanh toán (PRQ)",
      summary: "Bổ sung ngân hàng, số tiền, gộp PO, xuất Excel",
      content: (
        <>
          <p>PRQ được <b>tự sinh khi Quản lý duyệt PO</b> — một đề nghị cho một nhà cung cấp.</p>
          <Step n={1}>Bổ sung <b>số tài khoản / tên ngân hàng</b> (tự điền từ NCC, sửa được), loại thanh toán, ngày đến hạn.</Step>
          <Step n={2}>Nhập số tiền từng dòng: gõ <b>tiền trước thuế + %VAT</b> là tự ra <b>số tiền gồm thuế</b> (vẫn sửa tay được).</Step>
          <Step n={3}>Có thể <b>gộp thêm PO cùng nhà cung cấp</b>, hoặc xóa bớt dòng để <b>trả từng phần</b>.</Step>
          <Step n={4}><b>Gửi duyệt</b> → <b>Kế toán duyệt thanh toán</b> → <b>“Xuất Excel (mẫu PRQ)”</b> theo mẫu công ty (kèm số tiền bằng chữ) để ký & nộp hồ sơ.</Step>
        </>
      ),
    });

  if (has("gr.manage"))
    items.push({
      id: "gr", icon: "gr", tone: "teal", title: "Nhận hàng — toàn bộ & từng phần (tùy chọn)",
      summary: "Ghi số lượng thực nhận theo PO",
      content: (
        <>
          <Step n={1}>Từ PO (đã gửi/xác nhận) bấm <b>“Tạo phiếu nhận hàng”</b>, chọn kho & ngày, nhập <b>số lượng thực nhận</b>; ghi chú lý do nếu thiếu.</Step>
          <Step n={2}>Nhận <b>đủ</b> → PO chuyển <b>“Đã nhận hàng”</b>.</Step>
          <Step n={3}>Nhận <b>thiếu</b> → PO <b>“Nhận một phần”</b>; nhận tiếp bằng phiếu khác, hệ thống cộng dồn.</Step>
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-500 ring-1 ring-inset ring-slate-200 dark:bg-white/[0.04] dark:ring-white/10">
            Có thể <b>nhập nhanh từ Excel phiếu nhận</b> (cột Số PO · Mã hàng · SL nhận) — tự khớp về đúng dòng PO. Nhận hàng là bước tùy chọn, không thay đổi số lượng đặt trên PO.
          </p>
        </>
      ),
    });

  if (has("invoice.manage")) {
    items.push({
      id: "invoice", icon: "invoice", tone: "emerald", title: "Hóa đơn & đối chiếu",
      summary: "Nhập hóa đơn và tự đối chiếu với PO/nhận hàng",
      content: (
        <>
          <Step n={1}>Menu <b>Hóa đơn → “+ Nhập hóa đơn”</b> (hoặc từ PO). Có thể <b>tải file XML hóa đơn điện tử</b> để tự điền.</Step>
          <Step n={2}>Nhập số hóa đơn, ngày (<b>phải ≥ ngày PO</b>), chọn NCC thật, VAT; chọn <b>PO</b> và thêm dòng hàng.</Step>
          <Step n={3}>Lưu → hệ thống <b>đối chiếu</b>: Nhà cung cấp · Số lượng · Đơn giá theo dòng · VAT & Tổng tiền. Sai lệch trong <b>ngưỡng cấu hình</b> vẫn coi là khớp.</Step>
          <Step n={4}><b>Chống trùng:</b> cùng nhà cung cấp + cùng số hóa đơn sẽ bị chặn nhập lại. Nếu PO sai so với hóa đơn điện tử → <b>sửa PO</b> rồi bấm <b>“Đối chiếu lại”</b>.</Step>
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
          <p>Hóa đơn điện tử đã gom về Google Sheet được <b>tự ghép vào PO</b> theo <b>khóa tổng hợp</b>: nhà cung cấp (MST) + mã hàng + đơn giá + số tiền — <b>không cần nhập Số PO</b>.</p>
          <Step n={1}>Vào <b>Hóa đơn → “Đồng bộ hóa đơn”</b> → bấm <b>“Quét hóa đơn từ Google Sheet”</b>.</Step>
          <Step n={2}>Hệ thống chỉ lấy hóa đơn <b>Mua vào của công ty mình</b>, hiện mức <b>TỰ ĐỘNG</b> (khớp chắc) hoặc <b>CẦN XEM</b> kèm PO gợi ý + lý do.</Step>
          <Step n={3}><b>Tick chọn</b> hóa đơn muốn nhập (mục TỰ ĐỘNG tick sẵn), chỉnh PO nếu cần, rồi bấm <b>“Nhập N hóa đơn đã chọn”</b> → lưu + đối chiếu.</Step>
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
          <Step n={3}><b>Điều chỉnh giảm (Credit Note):</b> khi trả hàng/giảm giá sau hóa đơn — nhập số tiền giảm, hệ thống trừ vào nghĩa vụ phải trả.</Step>
        </>
      ),
    });
  }

  // Công nợ + Thuế: hiển thị cho vai trò back-office (không phải Nhân viên thuần).
  if (role !== "Employee") {
    items.push({
      id: "payables", icon: "invoice", tone: "rose", title: "Công nợ nhà cung cấp",
      summary: "Số còn phải trả theo tuổi nợ (tự tính)",
      content: (
        <>
          <p>Menu <b>Tài chính → “Công nợ NCC”</b>. Số phải trả được <b>tự tính</b> = hóa đơn − đã thanh toán − điều chỉnh giảm, không nhập tay.</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>Chia theo <b>tuổi nợ</b>: chưa đến hạn · 1–30 · 31–60 · 61–90 · trên 90 ngày (đến hạn = ngày hóa đơn + điều khoản NET của NCC).</li>
            <li>Bấm tên nhà cung cấp để xem <b>từng hóa đơn còn nợ</b>, badge đỏ “Trễ Nn” cho khoản quá hạn.</li>
          </ul>
        </>
      ),
    });

    items.push({
      id: "tax", icon: "dashboard", tone: "cyan", title: "Dashboard thuế GTGT",
      summary: "Thuế đầu vào theo tháng & theo nhà cung cấp",
      content: (
        <p>Menu <b>Tài chính → “Dashboard thuế”</b>. Tổng hợp <b>thuế GTGT đầu vào</b> từ hóa đơn theo <b>tháng</b> và theo <b>nhà cung cấp</b>, chọn <b>năm</b> — phục vụ đối chiếu tờ khai.</p>
      ),
    });
  }

  if (has("customer.manage") || has("project.manage"))
    items.push({
      id: "cust-proj", icon: "supplier", tone: "violet", title: "Khách hàng & Dự án (ngân sách)",
      summary: "Gắn đơn mua với khách/dự án và kiểm soát ngân sách",
      content: (
        <ul className="ml-4 list-disc space-y-1">
          <li><b>Khách hàng</b> (Danh mục → Khách hàng): thêm/sửa khách; khi tạo PR chọn khách hàng + số đơn bán để biết <b>đơn mua phục vụ khách nào</b> — theo suốt sang PO.</li>
          <li><b>Dự án/Công trình</b> (Danh mục → Dự án): đặt <b>ngân sách</b> cho dự án. Trang dự án hiện <b>Ngân sách · Đã cam kết (PO) · Còn lại</b>.</li>
          <li><b>Kiểm soát ngân sách:</b> khi duyệt PO thuộc dự án, nếu tổng cam kết <b>vượt ngân sách</b> → hệ thống <b>chặn duyệt</b>. Đặt ngân sách = 0 nghĩa là không kiểm soát.</li>
        </ul>
      ),
    });

  if (has("supplier.manage") || has("product.manage"))
    items.push({
      id: "master", icon: "supplier", tone: "amber", title: "Nhà cung cấp & hàng hóa",
      summary: "Thêm/sửa/xóa và nhập/xuất Excel",
      content: (
        <ul className="ml-4 list-disc space-y-1">
          <li><b>Thêm/Sửa:</b> nút <b>“+ Thêm”</b> hoặc <b>“Sửa”</b> trên mỗi thẻ.</li>
          <li><b>Xóa:</b> mở <b>Sửa</b> → nút <b>“Xóa”</b>. Mục đã phát sinh chứng từ sẽ chuyển <b>“Ngưng”</b> thay vì xóa để không vỡ dữ liệu.</li>
          <li><b>Nhập Excel:</b> nút <b>“Nhập Excel”</b> — tự dò tiêu đề, trùng mã → cập nhật. Tick <b>“Đồng bộ đầy đủ”</b> để xóa mục không có trong file.</li>
          <li><b>Xuất Excel:</b> nút <b>“Xuất Excel”</b> — xuất đúng bộ lọc đang xem; xuất ra rồi nhập lại được.</li>
        </ul>
      ),
    });

  items.push({
    id: "chain", icon: "invoice", tone: "cyan", title: "Bình luận & Truy vết chứng từ",
    summary: "Trao đổi và xem cả chuỗi PR → Thanh toán",
    content: (
      <ul className="ml-4 list-disc space-y-1">
        <li><b>Bình luận:</b> mọi chứng từ (PR/PO) đều có khung Bình luận ở trang chi tiết — trao đổi tự do, <b>không đổi trạng thái</b>. Đơn đã duyệt vẫn bình luận được. Bình luận mới nhất hiện ở <b>Bảng điều khiển</b>.</li>
        <li><b>Xem chuỗi chứng từ:</b> nút <b>“Xem chuỗi chứng từ”</b> ở chi tiết PR/PO/Hóa đơn mở màn truy vết cả chuỗi <b>Yêu cầu mua → Đơn hàng → Nhận hàng → Hóa đơn → Thanh toán</b> kèm số đã trả / còn lại.</li>
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

  if (has("settings.manage"))
    items.push({
      id: "settings", icon: "settings", tone: "slate", title: "Cấu hình hệ thống (Quản trị)",
      summary: "Đối chiếu, người dùng, công ty, phòng ban…",
      content: (
        <ul className="ml-4 list-disc space-y-1">
          <li><b>Đối chiếu:</b> đặt <b>ngưỡng sai lệch (%)</b> cho đơn giá / tổng tiền / số lượng khi đối chiếu hóa đơn.</li>
          <li><b>Người dùng:</b> thêm/sửa vai trò, công ty, đặt lại mật khẩu; nhập/xuất Excel tài khoản.</li>
          <li><b>Công ty & Phòng ban (BU):</b> thêm/sửa pháp nhân và phòng ban; phòng ban nhập được từ Excel và hiện ngay ở combobox khi tạo PR.</li>
          <li><b>Nhật ký & Truy cập:</b> nhật ký hệ thống realtime + danh sách IP đăng nhập.</li>
          <li><b>Giao diện:</b> đổi màu nhấn & sáng/tối, lưu trên trình duyệt.</li>
        </ul>
      ),
    });

  return (
    <div className="mx-auto max-w-4xl">
      <ModuleBanner accent="slate" title="Hướng dẫn sử dụng" subtitle={`Dòng chảy nghiệp vụ và hướng dẫn từng phần. Chỉ hiện phần bạn (${ROLE_VI[role] ?? role}) có quyền.`} />

      {/* Quy trình tổng quát — chuỗi ngắn gọn */}
      <Card className="mb-4 p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/12 text-indigo-500 dark:text-indigo-300">
            <Icon name="flow" size={20} />
          </span>
          <h2 className="text-[17px] font-bold text-slate-900 dark:text-slate-100">Quy trình tổng quát</h2>
        </div>
        <p className="text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
          Hệ thống số hóa toàn bộ chuỗi mua hàng theo nguyên tắc <b>“nhập một lần”</b> — dữ liệu chảy tự động xuống các bước sau, không phải gõ lại:
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] font-semibold">
          {["Yêu cầu mua", "Duyệt (Mua hàng)", "Đơn đặt hàng (tự sinh)", "Duyệt (Quản lý)", "Đề nghị thanh toán (tự sinh)", "Nhận hàng", "Hóa đơn & đối chiếu", "Thanh toán"].map((s, i, arr) => (
            <span key={s} className="flex items-center gap-2">
              <span className="rounded-lg bg-brand-50 px-2.5 py-1 text-brand-700 ring-1 ring-inset ring-brand-100 dark:bg-brand-500/12 dark:text-brand-300 dark:ring-brand-500/20">{s}</span>
              {i < arr.length - 1 && <span className="text-slate-300">→</span>}
            </span>
          ))}
        </div>
      </Card>

      {/* Dòng chảy nghiệp vụ chi tiết — ai làm gì ở mỗi bước */}
      <Card className="mb-4 p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/12 text-brand-600 dark:text-brand-300">
            <Icon name="flow" size={20} />
          </span>
          <div>
            <h2 className="text-[17px] font-bold text-slate-900 dark:text-slate-100">Dòng chảy nghiệp vụ chi tiết</h2>
            <p className="text-[13px] text-slate-500">Ai làm gì ở mỗi bước và hệ thống tự động làm gì.</p>
          </div>
        </div>
        <FlowTimeline />
      </Card>

      {/* Danh mục chi tiết — bấm để mở */}
      <GuideAccordion items={items} />
    </div>
  );
}
