// Test parser Excel phiếu nhận hàng (GRN). Tạo file xlsx trong bộ nhớ bằng
// exceljs rồi parse lại. Run: node --experimental-strip-types scripts/grn-excel-test.ts
import ExcelJS from "exceljs";
import { parseGRNWorkbook } from "../src/lib/import-grn-excel.ts";

let pass = 0, fail = 0;
const eq = (a: unknown, b: unknown, msg: string) => {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; console.log("  ✓", msg); }
  else { fail++; console.error(`  ✗ FAIL: ${msg}\n      got=${JSON.stringify(a)}\n      exp=${JSON.stringify(b)}`); }
};

async function build(rows: unknown[][], header: string[], titleRows: string[][] = []): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Phiếu nhận");
  for (const t of titleRows) ws.addRow(t);
  ws.addRow(header);
  for (const r of rows) ws.addRow(r);
  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}

// --- Mẫu 1: tiêu đề tiếng Việt có dấu, có dòng tiêu đề gộp ở trên ---
{
  const buf = await build(
    [
      ["PO-2026-00001", "P1", "Bếp từ Bosch", 3],
      ["PO-2026-00001", "P2", "Máy hút mùi", 2],
      ["", "", "", ""], // dòng trống
    ],
    ["Số PO", "Mã hàng", "Tên hàng", "SL nhận"],
    [["BẢNG KÊ NHẬN HÀNG THÁNG 7"]] // dòng tiêu đề gộp
  );
  const r = await parseGRNWorkbook(buf);
  eq(r.headerRow, 2, "dò được dòng tiêu đề (sau dòng tiêu đề gộp)");
  eq(r.rows.length, 2, "đọc 2 dòng dữ liệu (bỏ dòng trống)");
  eq(r.rows[0], { row: 3, po_number: "PO-2026-00001", item_code: "P1", description: "Bếp từ Bosch", received_qty: 3, accepted_qty: null, rejected_qty: null }, "dòng 1 đầy đủ");
  eq(r.poNumbers, ["PO-2026-00001"], "gom đúng số PO duy nhất");
  eq(r.warnings.length, 0, "không cảnh báo");
}

// --- Mẫu 2: đổi thứ tự cột + tên tiếng Anh + cột SL đạt/SL lỗi ---
{
  const buf = await build(
    [
      ["P1", 5, "PO-2026-00002", 4, 1],
    ],
    ["Item Code", "Received", "PO", "SL đạt", "SL lỗi"]
  );
  const r = await parseGRNWorkbook(buf);
  eq(r.rows.length, 1, "đổi thứ tự cột vẫn đọc được");
  eq(r.rows[0].po_number, "PO-2026-00002", "khớp cột PO tiếng Anh");
  eq(r.rows[0].received_qty, 5, "SL nhận");
  eq(r.rows[0].accepted_qty, 4, "SL đạt");
  eq(r.rows[0].rejected_qty, 1, "SL lỗi");
}

// --- Mẫu 3: thiếu cột bắt buộc → cảnh báo, không crash ---
{
  const buf = await build([["P1", 3]], ["Mã hàng", "SL nhận"]); // thiếu Số PO
  const r = await parseGRNWorkbook(buf);
  eq(r.headerRow, -1, "thiếu cột Số PO → không dò được tiêu đề");
  eq(r.rows.length, 0, "không đọc dòng nào");
  eq(r.warnings.length > 0, true, "có cảnh báo thiếu cột");
}

// --- Mẫu 4: dòng thiếu SL nhận / SL âm → bỏ qua kèm cảnh báo ---
{
  const buf = await build(
    [
      ["PO-9", "P1", "Hàng ok", 2],
      ["PO-9", "P2", "Hàng lỗi SL", -1],
      ["PO-9", "", "Thiếu mã", 5],
    ],
    ["Số PO", "Mã hàng", "Tên hàng", "SL nhận"]
  );
  const r = await parseGRNWorkbook(buf);
  eq(r.rows.length, 1, "chỉ 1 dòng hợp lệ");
  eq(r.warnings.length, 2, "2 cảnh báo (SL âm + thiếu mã)");
}

console.log(`\n${fail === 0 ? "✅ ALL PASSED" : "❌ FAILURES"}  (${pass} passed, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);
