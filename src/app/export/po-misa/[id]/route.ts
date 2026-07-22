import type { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canAccessCompany } from "@/lib/access";

// Xuất MỘT Purchase Order ra Excel theo ĐÚNG mẫu MISA (34 cột), phân màu:
//   🟡 vàng  (FFFFFF00) = thông tin người TẠO PO điền
//   🔵 xanh dương (FFCCFFFF) = thông tin NCC (tự suy từ master)
//   🟢 xanh lá (FFCCFFCC) = thông tin KẾ TOÁN bổ sung sau → để TRỐNG
// GET /export/po-misa/<poId>

const Y = "FFFFFF00"; // vàng — người tạo
const C = "FFCCFFFF"; // xanh dương — NCC
const G = "FFCCFFCC"; // xanh lá — kế toán (để trống)

interface PoRow {
  po_number: string | null; order_date: unknown; delivery_date: unknown; status: string;
  company_id: number | null; company_name: string | null;
  supplier_code: string | null; supplier_name: string | null; supplier_address: string | null;
  supplier_tax: string | null; supplier_contact: string | null; buyer_name: string | null;
}
interface ItemRow {
  item_code: string | null; description: string; quantity: unknown; unit: string | null;
  unit_price: unknown; discount: unknown; vat_rate: unknown;
}

const d = (v: unknown): string => {
  if (v == null || v === "") return "";
  const dt = new Date(v as string);
  if (isNaN(dt.getTime())) return String(v);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()}`; // DD/MM/YYYY (MISA)
};
const num = (v: unknown): number => (v == null ? 0 : Number(v));

// 34 cột theo đúng thứ tự & màu của mẫu. `v(po, it)` trả giá trị từng dòng hàng.
type ColV = string | number;
interface MCol { h: string; c: string; w: number; num?: boolean; v: (po: PoRow, it: ItemRow) => ColV }
const COLS: MCol[] = [
  { h: "Ngày đơn hàng (*)", c: Y, w: 14, v: (po) => d(po.order_date) },
  { h: "Pháp nhân", c: Y, w: 18, v: (po) => po.company_name ?? "" },
  { h: "BU", c: Y, w: 10, v: () => "" },
  { h: "Số đơn hàng (*)", c: Y, w: 16, v: (po) => po.po_number ?? "" },
  { h: "Tình trạng", c: Y, w: 12, v: (po) => po.status },
  { h: "Ngày giao hàng/Dự kiến giao hàng", c: Y, w: 20, v: (po) => d(po.delivery_date) },
  { h: "Mã nhà cung cấp", c: C, w: 14, v: (po) => po.supplier_code ?? "" },
  { h: "Tên nhà cung cấp", c: Y, w: 24, v: (po) => po.supplier_name ?? "" },
  { h: "Địa chỉ", c: C, w: 24, v: (po) => po.supplier_address ?? "" },
  { h: "Mã số thuế", c: C, w: 14, v: (po) => po.supplier_tax ?? "" },
  { h: "Người liên hệ", c: C, w: 16, v: (po) => po.supplier_contact ?? "" },
  { h: "Diễn giải", c: C, w: 20, v: () => "" },
  { h: "Nhân viên mua hàng", c: Y, w: 18, v: (po) => po.buyer_name ?? "" },
  { h: "Địa điểm giao hàng", c: Y, w: 18, v: () => "" },
  { h: "Mã hàng (*)", c: Y, w: 14, v: (_po, it) => it.item_code ?? "" },
  { h: "Tên hàng", c: Y, w: 24, v: (_po, it) => it.description },
  { h: "Là dòng ghi chú", c: G, w: 12, v: () => "" },
  { h: "Mã kho", c: G, w: 12, v: () => "" },
  { h: "ĐVT", c: Y, w: 8, v: (_po, it) => it.unit ?? "" },
  { h: "Số lượng", c: Y, w: 10, num: true, v: (_po, it) => num(it.quantity) },
  { h: "Đơn giá (trước thuế)", c: Y, w: 16, num: true, v: (_po, it) => num(it.unit_price) },
  { h: "Thành tiền", c: G, w: 16, v: () => "" },
  { h: "Tỷ lệ CK (%)", c: G, w: 12, v: () => "" },
  { h: "Tiền chiết khấu", c: G, w: 14, v: () => "" },
  { h: "% thuế GTGT", c: Y, w: 12, num: true, v: (_po, it) => num(it.vat_rate) },
  { h: "Tiền thuế GTGT", c: Y, w: 14, num: true, v: (_po, it) => Math.round((num(it.quantity) * num(it.unit_price) - num(it.discount)) * num(it.vat_rate) / 100) },
  { h: "Mã khoản mục chi phí", c: G, w: 16, v: () => "" },
  { h: "Mã đơn vị", c: G, w: 12, v: () => "" },
  { h: "Mã đối tượng THCP", c: G, w: 16, v: () => "" },
  { h: "Mã công trình", c: Y, w: 14, v: () => "" },
  { h: "Số đơn đặt hàng", c: G, w: 14, v: () => "" },
  { h: "Số hợp đồng mua", c: G, w: 14, v: () => "" },
  { h: "Số hợp đồng bán", c: G, w: 14, v: () => "" },
  { h: "Mã thống kê", c: G, w: 12, v: () => "" },
];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Chưa đăng nhập", { status: 401 });
  const { id } = await params;
  const poId = Number(id);
  if (!poId) return new Response("PO không hợp lệ", { status: 400 });

  const po = await queryOne<PoRow>(
    `SELECT po.po_number, po.order_date, po.delivery_date, po.status, po.company_id,
            c.company_name,
            s.supplier_code, s.supplier_name, s.address AS supplier_address,
            s.tax_code AS supplier_tax, s.contact_name AS supplier_contact,
            bu.name AS buyer_name
       FROM purchase_orders po
       JOIN companies c ON c.id = po.company_id
       LEFT JOIN suppliers s ON s.id = po.supplier_id
       LEFT JOIN users bu ON bu.id = po.created_by
      WHERE po.id = $1`,
    [poId]
  );
  if (!po) return new Response("Không tìm thấy PO", { status: 404 });
  if (!canAccessCompany(user, po.company_id)) return new Response("Không có quyền", { status: 403 });

  const items = await query<ItemRow>(
    `SELECT item_code, description, quantity, unit, unit_price, discount, vat_rate
       FROM purchase_order_items WHERE po_id = $1 ORDER BY line_no`,
    [poId]
  );

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("PO");
  ws.columns = COLS.map((c, i) => ({ key: `c${i}`, width: c.w }));

  // Hàng tiêu đề — tô đúng màu mẫu, chữ đậm, viền, canh giữa.
  const header = ws.getRow(1);
  COLS.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.h;
    cell.font = { bold: true, color: { argb: "FF1F2937" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c.c } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
  });
  header.height = 30;

  // Mỗi dòng hàng của PO = 1 row. PO không có dòng thì vẫn xuất 1 row rỗng (giữ mẫu).
  const rows = items.length ? items : [null];
  for (const it of rows) {
    const r = ws.addRow({});
    COLS.forEach((c, i) => {
      const cell = r.getCell(i + 1);
      cell.value = it ? c.v(po, it) : "";
      if (c.num) cell.numFmt = "#,##0";
      cell.border = { top: { style: "hair" }, bottom: { style: "hair" }, left: { style: "hair" }, right: { style: "hair" } };
    });
  }
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const buf = await wb.xlsx.writeBuffer();
  const fname = `PO-${po.po_number ?? poId}-MISA`;
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fname}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
