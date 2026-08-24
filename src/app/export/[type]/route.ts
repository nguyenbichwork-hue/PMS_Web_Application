import type { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { pushCompanyScope } from "@/lib/access";
import type { User } from "@/lib/types";

// Xuất danh sách ra Excel (.xlsx) — có phân quyền công ty + lọc theo trạng thái/từ khóa.
// GET /export/<type>?status=&q=   với type = pr|po|gr|invoice|suppliers|products

interface Col { h: string; k: string; w?: number }
interface Conf {
  sheet: string; file: string; sql: string; params: unknown[]; columns: Col[]; map: (r: Record<string, unknown>) => Record<string, unknown>;
}

const s = (v: unknown) => (v == null ? "" : String(v));
const n = (v: unknown) => (v == null ? 0 : Number(v));
// DATE trên Neon trả về Date object, PGlite trả chuỗi → format thống nhất DD/MM/YYYY (giờ địa phương).
const fdate = (v: unknown) => {
  if (v == null || v === "") return "";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const PRQ_STATUS_VI: Record<string, string> = {
  Draft: "Nháp", Submitted: "Đã gửi", Approved: "Đã duyệt", Paid: "Đã thanh toán", Cancelled: "Đã hủy", Rejected: "Từ chối",
};

function build(type: string, user: User, status: string, q: string, category: string, df: string, dt: string): Conf | null {
  const admin = user.role === "Admin";
  switch (type) {
    case "pr": {
      const where: string[] = []; const params: unknown[] = [];
      if (status) { params.push(status); where.push(`pr.status=$${params.length}`); }
      if (q) { params.push(`%${q}%`); where.push(`(pr.pr_number ILIKE $${params.length} OR pr.purpose ILIKE $${params.length})`); }
      if (!admin) { params.push(user.company_id); where.push(`pr.company_id=$${params.length}`); }
      if (user.role === "Employee") { params.push(user.id); where.push(`pr.requester_id=$${params.length}`); }
      const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
      return {
        sheet: "YeuCauMua", file: "yeu-cau-mua",
        sql: `SELECT pr.pr_number, pr.request_date, u.name requester, c.company_name, pr.purpose, pr.priority,
                     pr.total_amount, pr.vat_total, (pr.total_amount + COALESCE(pr.vat_total,0)) AS gross, pr.status
                FROM purchase_requests pr JOIN users u ON u.id=pr.requester_id JOIN companies c ON c.id=pr.company_id ${clause} ORDER BY pr.id DESC`,
        params,
        columns: [
          { h: "Số PR", k: "a", w: 16 }, { h: "Ngày", k: "b", w: 12 }, { h: "Người yêu cầu", k: "c", w: 22 },
          { h: "Công ty", k: "d", w: 18 }, { h: "Mục đích", k: "e", w: 34 }, { h: "Ưu tiên", k: "f", w: 12 },
          { h: "Chưa thuế", k: "g", w: 16 }, { h: "VAT", k: "i", w: 14 }, { h: "Giá trị (gồm thuế)", k: "j", w: 18 }, { h: "Trạng thái", k: "h", w: 16 },
        ],
        map: (r) => ({ a: s(r.pr_number), b: s(r.request_date), c: s(r.requester), d: s(r.company_name), e: s(r.purpose), f: s(r.priority), g: n(r.total_amount), i: n(r.vat_total), j: n(r.gross), h: s(r.status) }),
      };
    }
    case "po": {
      const where: string[] = []; const params: unknown[] = [];
      if (status) { params.push(status); where.push(`po.status=$${params.length}`); }
      if (q) { params.push(`%${q}%`); where.push(`po.po_number ILIKE $${params.length}`); }
      if (!admin) { params.push(user.company_id); where.push(`po.company_id=$${params.length}`); }
      const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
      return {
        sheet: "DonDatHang", file: "don-dat-hang",
        sql: `SELECT po.po_number, po.order_date, po.delivery_date, s.supplier_name, c.company_name, po.subtotal, po.vat_total, po.grand_total, po.status
                FROM purchase_orders po LEFT JOIN suppliers s ON s.id=po.supplier_id JOIN companies c ON c.id=po.company_id ${clause} ORDER BY po.id DESC`,
        params,
        columns: [
          { h: "Số PO", k: "a", w: 16 }, { h: "Ngày đặt", k: "b", w: 12 }, { h: "Ngày giao", k: "c", w: 12 },
          { h: "Nhà cung cấp", k: "d", w: 24 }, { h: "Công ty", k: "e", w: 18 }, { h: "Tạm tính", k: "f", w: 16 },
          { h: "VAT", k: "g", w: 14 }, { h: "Tổng cộng", k: "h", w: 16 }, { h: "Trạng thái", k: "i", w: 14 },
        ],
        map: (r) => ({ a: s(r.po_number), b: s(r.order_date), c: s(r.delivery_date), d: s(r.supplier_name), e: s(r.company_name), f: n(r.subtotal), g: n(r.vat_total), h: n(r.grand_total), i: s(r.status) }),
      };
    }
    case "invoice": {
      const where: string[] = []; const params: unknown[] = [];
      if (status) { params.push(status); where.push(`i.status=$${params.length}`); }
      if (q) { params.push(`%${q}%`); where.push(`(i.invoice_number ILIKE $${params.length} OR po.po_number ILIKE $${params.length})`); }
      if (!admin) { params.push(user.company_id); where.push(`po.company_id=$${params.length}`); }
      const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
      return {
        sheet: "HoaDon", file: "hoa-don",
        sql: `SELECT i.invoice_number, i.invoice_date, s.supplier_name, po.po_number, i.total_amount, i.vat_amount, i.match_result, i.status
                FROM invoices i LEFT JOIN suppliers s ON s.id=i.supplier_id LEFT JOIN purchase_orders po ON po.id=i.po_id ${clause} ORDER BY i.id DESC`,
        params,
        columns: [
          { h: "Số hóa đơn", k: "a", w: 18 }, { h: "Ngày", k: "b", w: 12 }, { h: "Nhà cung cấp", k: "c", w: 24 },
          { h: "Đơn hàng", k: "d", w: 16 }, { h: "Tổng tiền", k: "e", w: 16 }, { h: "VAT", k: "f", w: 14 },
          { h: "Đối chiếu", k: "g", w: 14 }, { h: "Trạng thái", k: "h", w: 16 },
        ],
        map: (r) => ({ a: s(r.invoice_number), b: s(r.invoice_date), c: s(r.supplier_name), d: s(r.po_number), e: n(r.total_amount), f: n(r.vat_amount), g: s(r.match_result), h: s(r.status) }),
      };
    }
    case "gr": {
      const where: string[] = []; const params: unknown[] = [];
      if (q) { params.push(`%${q}%`); where.push(`gr.gr_number ILIKE $${params.length}`); }
      if (!admin) { params.push(user.company_id); where.push(`po.company_id=$${params.length}`); }
      const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
      return {
        sheet: "NhanHang", file: "nhan-hang",
        sql: `SELECT gr.gr_number, gr.receive_date, gr.warehouse, po.po_number, u.name receiver, gr.status
                FROM goods_receipts gr LEFT JOIN purchase_orders po ON po.id=gr.po_id LEFT JOIN users u ON u.id=gr.receiver_id ${clause} ORDER BY gr.id DESC`,
        params,
        columns: [
          { h: "Số GR", k: "a", w: 16 }, { h: "Ngày nhận", k: "b", w: 12 }, { h: "Kho", k: "c", w: 16 },
          { h: "Đơn hàng", k: "d", w: 16 }, { h: "Người nhận", k: "e", w: 22 }, { h: "Trạng thái", k: "f", w: 14 },
        ],
        map: (r) => ({ a: s(r.gr_number), b: s(r.receive_date), c: s(r.warehouse), d: s(r.po_number), e: s(r.receiver), f: s(r.status) }),
      };
    }
    case "suppliers": {
      // Cột KHỚP với parser nhập (import-section) để xuất xong nhập lại được.
      const where: string[] = []; const params: unknown[] = [];
      if (status) { params.push(status); where.push(`status=$${params.length}`); }
      if (q) { params.push(`%${q}%`); where.push(`(supplier_name ILIKE $${params.length} OR supplier_code ILIKE $${params.length})`); }
      const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
      return {
        sheet: "Danh sách nhà cung cấp", file: "nha-cung-cap",
        sql: `SELECT supplier_code, supplier_name, tax_code, address, contact_name, phone, email, bank_account, debt, payment_term, currency, status
                FROM suppliers ${clause} ORDER BY supplier_name`,
        params,
        columns: [
          { h: "Mã nhà cung cấp", k: "a", w: 20 }, { h: "Tên nhà cung cấp", k: "b", w: 36 }, { h: "Mã số thuế", k: "c", w: 16 },
          { h: "Địa chỉ", k: "d", w: 34 }, { h: "Người liên hệ", k: "e", w: 20 }, { h: "Điện thoại", k: "f", w: 16 },
          { h: "Email", k: "g", w: 22 }, { h: "Số tài khoản", k: "h", w: 18 }, { h: "Số tiền nợ", k: "i", w: 16 },
          { h: "Điều khoản TT", k: "j", w: 14 }, { h: "Tiền tệ", k: "k", w: 10 }, { h: "Trạng thái", k: "l", w: 12 },
        ],
        map: (r) => ({ a: s(r.supplier_code), b: s(r.supplier_name), c: s(r.tax_code), d: s(r.address), e: s(r.contact_name), f: s(r.phone), g: s(r.email), h: s(r.bank_account), i: n(r.debt), j: s(r.payment_term), k: s(r.currency), l: s(r.status) }),
      };
    }
    case "products": {
      const where: string[] = []; const params: unknown[] = [];
      if (q) { params.push(`%${q}%`); where.push(`(item_name ILIKE $${params.length} OR item_code ILIKE $${params.length})`); }
      if (category) { params.push(category); where.push(`category=$${params.length}`); }
      const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
      return {
        sheet: "Danh sách hàng hóa", file: "hang-hoa",
        sql: `SELECT p.item_code, p.item_name, p.category, p.unit, p.vat_rate, p.accounting_code, p.status,
                     sup.supplier_code AS default_supplier_code, sup.supplier_name AS default_supplier_name
                FROM products p LEFT JOIN suppliers sup ON sup.id = p.default_supplier ${clause} ORDER BY p.item_name`,
        params,
        columns: [
          { h: "Mã", k: "a", w: 18 }, { h: "Tên", k: "b", w: 42 }, { h: "Nhóm", k: "c", w: 18 },
          { h: "ĐVT", k: "d", w: 10 }, { h: "Thuế suất", k: "e", w: 12 }, { h: "Mã kế toán", k: "f", w: 16 },
          { h: "Mã NCC", k: "h", w: 18 }, { h: "Tên NCC", k: "i", w: 28 }, { h: "Trạng thái", k: "g", w: 12 },
        ],
        map: (r) => ({ a: s(r.item_code), b: s(r.item_name), c: s(r.category), d: s(r.unit), e: n(r.vat_rate), f: s(r.accounting_code), h: s(r.default_supplier_code), i: s(r.default_supplier_name), g: s(r.status) }),
      };
    }
    case "users": {
      if (!admin) return null; // danh sách tài khoản: chỉ Quản trị được xuất
      const where: string[] = []; const params: unknown[] = [];
      if (status) { params.push(status); where.push(`u.status=$${params.length}`); }
      if (q) { params.push(`%${q}%`); where.push(`(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`); }
      const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
      return {
        sheet: "Danh sách người dùng", file: "nguoi-dung",
        sql: `SELECT u.name, u.email, u.department, u.role, c.company_code, u.status
                FROM users u LEFT JOIN companies c ON c.id=u.company_id ${clause} ORDER BY u.name`,
        params,
        columns: [
          { h: "Họ tên", k: "a", w: 24 }, { h: "Email", k: "b", w: 26 }, { h: "Phòng ban", k: "c", w: 18 },
          { h: "Vai trò", k: "d", w: 14 }, { h: "Mã công ty", k: "e", w: 14 }, { h: "Trạng thái", k: "f", w: 12 },
        ],
        map: (r) => ({ a: s(r.name), b: s(r.email), c: s(r.department), d: s(r.role), e: s(r.company_code), f: s(r.status) }),
      };
    }
    case "customers": {
      // Cột KHỚP với parser nhập (import-section) để xuất xong nhập lại được.
      const where: string[] = []; const params: unknown[] = [];
      if (status) { params.push(status); where.push(`status=$${params.length}`); }
      if (q) { params.push(`%${q}%`); where.push(`(customer_name ILIKE $${params.length} OR customer_code ILIKE $${params.length})`); }
      const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
      return {
        sheet: "Danh sách khách hàng", file: "khach-hang",
        sql: `SELECT customer_code, customer_name, tax_code, address, contact_name, phone, email, note, status
                FROM customers ${clause} ORDER BY customer_name`,
        params,
        columns: [
          { h: "Mã khách hàng", k: "a", w: 20 }, { h: "Tên khách hàng", k: "b", w: 36 }, { h: "Mã số thuế", k: "c", w: 16 },
          { h: "Địa chỉ", k: "d", w: 34 }, { h: "Người liên hệ", k: "e", w: 20 }, { h: "Điện thoại", k: "f", w: 16 },
          { h: "Email", k: "g", w: 22 }, { h: "Ghi chú", k: "h", w: 24 }, { h: "Trạng thái", k: "i", w: 12 },
        ],
        map: (r) => ({ a: s(r.customer_code), b: s(r.customer_name), c: s(r.tax_code), d: s(r.address), e: s(r.contact_name), f: s(r.phone), g: s(r.email), h: s(r.note), i: s(r.status) }),
      };
    }
    case "projects": {
      const where: string[] = []; const params: unknown[] = [];
      if (status) { params.push(status); where.push(`p.status=$${params.length}`); }
      if (q) { params.push(`%${q}%`); where.push(`(p.project_name ILIKE $${params.length} OR p.project_code ILIKE $${params.length})`); }
      const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
      return {
        sheet: "Danh sách dự án", file: "du-an",
        sql: `SELECT p.project_code, p.project_name, c.company_code, cu.customer_code, p.budget,
                     p.manager_name, p.location, p.start_date, p.end_date, p.status
                FROM projects p
                LEFT JOIN companies c ON c.id = p.company_id
                LEFT JOIN customers cu ON cu.id = p.customer_id
                ${clause} ORDER BY p.project_name`,
        params,
        columns: [
          { h: "Mã dự án", k: "a", w: 18 }, { h: "Tên dự án", k: "b", w: 34 }, { h: "Mã công ty", k: "c", w: 14 },
          { h: "Mã khách hàng", k: "d", w: 16 }, { h: "Ngân sách", k: "e", w: 18 }, { h: "Người phụ trách", k: "f", w: 20 },
          { h: "Địa điểm", k: "g", w: 24 }, { h: "Ngày bắt đầu", k: "h", w: 14 }, { h: "Ngày kết thúc", k: "i", w: 14 },
          { h: "Trạng thái", k: "j", w: 12 },
        ],
        map: (r) => ({ a: s(r.project_code), b: s(r.project_name), c: s(r.company_code), d: s(r.customer_code), e: n(r.budget), f: s(r.manager_name), g: s(r.location), h: s(r.start_date), i: s(r.end_date), j: s(r.status) }),
      };
    }
    case "prq": {
      // Khớp phạm vi + bộ lọc của trang danh sách Đề nghị thanh toán (status, từ khóa, khoảng ngày lập).
      const where: string[] = []; const params: unknown[] = [];
      if (status) { params.push(status); where.push(`prq.status=$${params.length}`); }
      if (q) {
        params.push(`%${q}%`); const p = params.length;
        where.push(`(prq.prq_number ILIKE $${p} OR s.supplier_name ILIKE $${p} OR s.supplier_code ILIKE $${p} OR s.tax_code ILIKE $${p})`);
      }
      if (df) { params.push(df); where.push(`prq.created_at::date >= $${params.length}`); }
      if (dt) { params.push(dt); where.push(`prq.created_at::date <= $${params.length}`); }
      pushCompanyScope(user, "prq.company_id", where, params);
      const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
      return {
        sheet: "DeNghiThanhToan", file: "de-nghi-thanh-toan",
        sql: `SELECT prq.prq_number, s.supplier_name, c.company_name,
                     (SELECT string_agg(DISTINCT pr.department, ', ')
                        FROM payment_requisition_items it
                        JOIN purchase_orders po ON po.id = it.po_id
                        JOIN purchase_requests pr ON pr.id = po.pr_id
                       WHERE it.prq_id = prq.id AND pr.department IS NOT NULL AND pr.department <> '') AS bu,
                     prq.payment_type, prq.due_date, prq.grand_total,
                     COALESCE((SELECT sum(amount) FROM prq_payments pp WHERE pp.prq_id = prq.id), 0) AS paid,
                     prq.status
                FROM payment_requisitions prq
                JOIN companies c ON c.id = prq.company_id
                LEFT JOIN suppliers s ON s.id = prq.supplier_id
                ${clause} ORDER BY prq.id DESC`,
        params,
        columns: [
          { h: "Số đề nghị", k: "a", w: 18 }, { h: "Nhà cung cấp", k: "b", w: 36 }, { h: "Công ty", k: "c", w: 18 },
          { h: "BU", k: "d", w: 22 }, { h: "Loại", k: "e", w: 12 }, { h: "Đến hạn", k: "f", w: 14 },
          { h: "Số tiền (gồm thuế)", k: "g", w: 18 }, { h: "Đã chi", k: "h", w: 16 }, { h: "Còn lại", k: "i", w: 16 },
          { h: "Trạng thái", k: "j", w: 16 },
        ],
        map: (r) => {
          const total = n(r.grand_total); const paid = n(r.paid);
          return {
            a: s(r.prq_number), b: s(r.supplier_name), c: s(r.company_name), d: s(r.bu),
            e: r.payment_type === "Advance" ? "Ứng trước" : "Thường", f: fdate(r.due_date),
            g: total, h: paid, i: total - paid, j: PRQ_STATUS_VI[s(r.status)] ?? s(r.status),
          };
        },
      };
    }
    default:
      return null;
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Chưa đăng nhập", { status: 401 });
  const { type } = await params;
  const sp = req.nextUrl.searchParams;
  const conf = build(type, user, sp.get("status") ?? "", sp.get("q") ?? "", sp.get("category") ?? "", sp.get("df") ?? "", sp.get("dt") ?? "");
  if (!conf) return new Response("Loại xuất không hợp lệ", { status: 400 });

  const rows = await query<Record<string, unknown>>(conf.sql, conf.params);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(conf.sheet);
  ws.columns = conf.columns.map((c) => ({ header: c.h, key: c.k, width: c.w ?? 18 }));

  // Hàng tiêu đề: nền tím đậm, chữ trắng đậm, canh giữa.
  const head = ws.getRow(1);
  head.height = 24;
  head.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF7C3AED" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FF5B21B6" } } };
  });

  for (const r of rows) ws.addRow(conf.map(r));

  // Dữ liệu: kẻ viền nhạt, zebra so le, số căn phải + format nghìn, ngày căn giữa.
  const thin = { style: "thin" as const, color: { argb: "FFE2E8F0" } };
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const zebra = r % 2 === 0;
    row.eachCell((cell) => {
      cell.border = { top: thin, bottom: thin, left: thin, right: thin };
      if (zebra) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      if (typeof cell.value === "number") {
        cell.numFmt = "#,##0";
        cell.alignment = { horizontal: "right", vertical: "middle" };
      } else {
        cell.alignment = { vertical: "middle" };
      }
    });
  }

  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: conf.columns.length } };

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${conf.file}-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
