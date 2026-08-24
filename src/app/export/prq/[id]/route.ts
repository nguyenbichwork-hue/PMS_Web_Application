import type { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { query, queryOne } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canAccessCompany } from "@/lib/access";
import { amountInWordsVi } from "@/lib/num-to-words-vi";

// GET /export/prq/<id> → xuất mẫu "Payment Requisition" (.xlsx) điền sẵn từ PRQ.

interface Head {
  id: number; prq_number: string | null; company_id: number; company_name: string; company_code: string;
  supplier_name: string | null; supplier_tax: string | null; supplier_address: string | null;
  supplier_phone: string | null; supplier_email: string | null;
  payment_type: string; due_date: string | null; bank_account: string | null; bank_name: string | null;
  bank_address: string | null; swift_code: string | null; reason: string | null; currency: string;
  grand_total: string;
}
interface Line {
  inv_no: string | null; inv_date: string | null; description: string | null;
  tax_code: string | null; gl_account: string | null; cost_center: string | null; currency: string; amount: string;
  quantity: string | null;
}

const fmtDate = (v: string | null) => (v ? String(v).slice(0, 10).split("-").reverse().join("/") : "");

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Chưa đăng nhập", { status: 401 });
  const { id } = await params;
  const prqId = Number(id);

  const h = await queryOne<Head>(
    `SELECT prq.*, c.company_name, c.company_code,
            s.supplier_name, s.tax_code AS supplier_tax, s.address AS supplier_address,
            s.phone AS supplier_phone, s.email AS supplier_email
       FROM payment_requisitions prq
       JOIN companies c ON c.id = prq.company_id
       LEFT JOIN suppliers s ON s.id = prq.supplier_id
      WHERE prq.id = $1`,
    [prqId]
  );
  if (!h) return new Response("Không tìm thấy", { status: 404 });
  if (!canAccessCompany(user, h.company_id)) return new Response("FORBIDDEN", { status: 403 });

  const lines = await query<Line>(
    `SELECT it.inv_no, it.inv_date, it.description, it.tax_code, it.gl_account, it.cost_center, it.currency, it.amount,
            poi.quantity AS quantity
       FROM payment_requisition_items it
       LEFT JOIN purchase_order_items poi ON poi.id = it.po_item_id
      WHERE it.prq_id = $1 ORDER BY it.line_no, it.id`,
    [prqId]
  );

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Payment Requisition");
  ws.columns = [
    { width: 6 }, { width: 18 }, { width: 13 }, { width: 34 },
    { width: 16 }, { width: 12 }, { width: 16 }, { width: 9 }, { width: 8 }, { width: 16 },
  ];
  const B = (cell: string) => { ws.getCell(cell).font = { bold: true }; };
  const label = (row: number, text: string, value: string) => {
    ws.getCell(`A${row}`).value = text;
    ws.getCell(`A${row}`).font = { bold: true };
    ws.mergeCells(`C${row}:E${row}`);
    ws.getCell(`C${row}`).value = value;
  };

  ws.mergeCells("A1:J1");
  ws.getCell("A1").value = "PAYMENT REQUISITION — ĐỀ NGHỊ THANH TOÁN";
  ws.getCell("A1").font = { bold: true, size: 15 };
  ws.getCell("A1").alignment = { horizontal: "center" };

  ws.getCell("A2").value = `Số / No.: ${h.prq_number ?? "PRQ-" + h.id}`;
  ws.getCell("G2").value = "Payment Type:";
  B("G2");
  ws.getCell("I2").value = h.payment_type === "Advance" ? "Advance / Prepayment" : "Normal Payment";

  label(3, "To / Kính gửi:", "1. Requester  2. HoD  3. Head of Finance & Accounting  4. CEO");
  label(4, "Pháp nhân / Entity:", `${h.company_code} — ${h.company_name}`);
  label(5, "Vendor Name / NCC:", h.supplier_name ?? "");
  label(6, "Address / Địa chỉ:", h.supplier_address ?? "");
  label(7, "Tax No. / MST:", h.supplier_tax ?? "");
  ws.getCell("G7").value = "Tel:"; B("G7"); ws.getCell("I7").value = h.supplier_phone ?? "";
  label(8, "Email:", h.supplier_email ?? "");
  ws.getCell("G8").value = "Due date:"; B("G8"); ws.getCell("I8").value = fmtDate(h.due_date);

  ws.getCell("A9").value = "Bank Details / Thông tin ngân hàng"; B("A9");
  label(10, "Bank Account No / Số TK:", h.bank_account ?? "");
  label(11, "Beneficiary's Bank / Ngân hàng:", h.bank_name ?? "");
  label(12, "Bank address / Địa chỉ NH:", h.bank_address ?? "");
  label(13, "Swift code:", h.swift_code ?? "");

  // Bảng dòng
  const HEAD = 15;
  const heads = ["S/N", "Inv No / Số HĐ", "Inv Date / Ngày HĐ", "Description / Diễn giải", "Tax code", "GL Account", "Cost Center", "Qty / SL", "Cur", "Amount / Số tiền"];
  heads.forEach((t, i) => {
    const cell = ws.getRow(HEAD).getCell(i + 1);
    cell.value = t;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  let r = HEAD + 1;
  lines.forEach((l, i) => {
    const row = ws.getRow(r++);
    row.getCell(1).value = i + 1;
    row.getCell(2).value = l.inv_no ?? "";
    row.getCell(3).value = fmtDate(l.inv_date);
    row.getCell(4).value = l.description ?? "";
    row.getCell(5).value = l.tax_code ?? "";
    row.getCell(6).value = l.gl_account ?? "";
    row.getCell(7).value = l.cost_center ?? "";
    // Số lượng lấy từ dòng PO liên kết (po_item_id); dòng thanh toán trọn gói không gắn PO item → mặc định 1.
    row.getCell(8).value = l.quantity != null ? Number(l.quantity) : 1;
    row.getCell(8).alignment = { horizontal: "right" };
    row.getCell(9).value = l.currency || h.currency;
    row.getCell(10).value = Number(l.amount);
    row.getCell(10).numFmt = "#,##0";
  });

  // Tổng cộng
  const totalRow = ws.getRow(r++);
  ws.mergeCells(`A${totalRow.number}:I${totalRow.number}`);
  totalRow.getCell(1).value = "Total / Tổng cộng";
  totalRow.getCell(1).font = { bold: true };
  totalRow.getCell(1).alignment = { horizontal: "right" };
  totalRow.getCell(10).value = Number(h.grand_total);
  totalRow.getCell(10).numFmt = "#,##0";
  totalRow.getCell(10).font = { bold: true };

  r++;
  ws.mergeCells(`A${r}:J${r}`);
  ws.getCell(`A${r}`).value = `Amount in words / Bằng chữ: ${amountInWordsVi(Number(h.grand_total))}`;
  ws.getCell(`A${r}`).font = { italic: true };
  r += 2;
  ws.mergeCells(`A${r}:J${r}`);
  ws.getCell(`A${r}`).value = `Reason / Lý do: ${h.reason ?? ""}`;

  // Chữ ký
  r += 3;
  const sigHead = ws.getRow(r);
  ["REQUESTER", "HOD", "HEAD OF FINANCE", "CEO"].forEach((t, i) => {
    const col = 1 + i * 2;
    ws.mergeCells(r, col, r, col + 1);
    sigHead.getCell(col).value = t;
    sigHead.getCell(col).font = { bold: true };
    sigHead.getCell(col).alignment = { horizontal: "center" };
  });
  const sigSub = ws.getRow(r + 1);
  for (let i = 0; i < 4; i++) {
    const col = 1 + i * 2;
    ws.mergeCells(r + 1, col, r + 1, col + 1);
    sigSub.getCell(col).value = "Date / Name / Signature";
    sigSub.getCell(col).alignment = { horizontal: "center" };
    sigSub.getCell(col).font = { size: 9, color: { argb: "FF888888" } };
  }

  const buf = await wb.xlsx.writeBuffer();
  const fname = (h.prq_number ?? `PRQ-${h.id}`).replace(/[^\w-]+/g, "_");
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fname}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
