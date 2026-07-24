// Test parser hóa đơn điện tử (TT78) — mẫu mô phỏng MISA meInvoice.
// Run: node --experimental-strip-types scripts/invoice-xml-test.ts
import { parseInvoiceXml } from "../src/lib/import-invoice-xml.ts";

let pass = 0, fail = 0;
const eq = (a: unknown, b: unknown, msg: string) => {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; console.log("  ✓", msg); }
  else { fail++; console.error(`  ✗ FAIL: ${msg}\n      got=${JSON.stringify(a)}\n      exp=${JSON.stringify(b)}`); }
};

// --- Mẫu 1: hóa đơn MISA chuẩn, 2 dòng, có ký hiệu + MST + khối chữ ký số ---
const misa = `<?xml version="1.0" encoding="UTF-8"?>
<HDon>
  <DLHDon Id="d1">
    <TTChung>
      <PBan>2.0.0</PBan>
      <THDon>Hóa đơn giá trị gia tăng</THDon>
      <KHMSHDon>1</KHMSHDon>
      <KHHDon>C22TAA</KHHDon>
      <SHDon>128</SHDon>
      <NLap>2026-07-15</NLap>
      <DVTTe>VND</DVTTe>
      <TGia>1</TGia>
    </TTChung>
    <NDHDon>
      <NBan>
        <Ten>CÔNG TY TNHH BOSCH VIỆT NAM</Ten>
        <MST>0301234567</MST>
        <DChi>Số 1 Lê Lợi, Q1, TP.HCM</DChi>
      </NBan>
      <NMua>
        <Ten>CÔNG TY K-HOMÈS</Ten>
        <MST>0312345678</MST>
      </NMua>
      <DSHHDVu>
        <HHDVu>
          <TChat>1</TChat>
          <STT>1</STT>
          <MHHDVu>P1</MHHDVu>
          <THHDVu>Bếp từ Bosch PID</THHDVu>
          <DVTinh>Cái</DVTinh>
          <SLuong>3</SLuong>
          <DGia>15000000</DGia>
          <TSuat>10%</TSuat>
          <ThTien>45000000</ThTien>
        </HHDVu>
        <HHDVu>
          <TChat>1</TChat>
          <STT>2</STT>
          <MHHDVu>P2</MHHDVu>
          <THHDVu>Máy hút mùi Bosch</THHDVu>
          <DVTinh>Cái</DVTinh>
          <SLuong>2</SLuong>
          <DGia>8000000</DGia>
          <TSuat>10%</TSuat>
          <ThTien>16000000</ThTien>
        </HHDVu>
        <HHDVu>
          <TChat>4</TChat>
          <STT>3</STT>
          <THHDVu>Giao hàng trong 7 ngày</THHDVu>
        </HHDVu>
      </DSHHDVu>
      <TToan>
        <THTTLTSuat>
          <LTSuat>
            <TSuat>10%</TSuat>
            <ThTien>61000000</ThTien>
            <TThue>6100000</TThue>
          </LTSuat>
        </THTTLTSuat>
        <TgTCThue>61000000</TgTCThue>
        <TgTThue>6100000</TgTThue>
        <TgTTTBSo>67100000</TgTTTBSo>
        <TgTTTBChu>Sáu mươi bảy triệu một trăm nghìn đồng</TgTTTBChu>
      </TToan>
    </NDHDon>
  </DLHDon>
  <DSCKS>
    <NBan><Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
      <SignatureValue>Zm9vYmFyYmFzZTY0c2lnbmF0dXJlPT0=</SignatureValue>
    </Signature></NBan>
  </DSCKS>
</HDon>`;

const r = parseInvoiceXml(misa);
eq(r.invoice_number, "128", "số hóa đơn = SHDon");
eq(r.invoice_series, "C22TAA", "ký hiệu = KHHDon");
eq(r.invoice_date, "2026-07-15", "ngày lập = NLap");
eq(r.seller_tax_id, "0301234567", "MST người bán");
eq(r.seller_name, "CÔNG TY TNHH BOSCH VIỆT NAM", "tên người bán (giữ dấu tiếng Việt)");
eq(r.buyer_tax_id, "0312345678", "MST người mua");
eq(r.currency, "VND", "đơn vị tiền tệ");
eq(r.subtotal, 61000000, "tổng chưa thuế = TgTCThue");
eq(r.vat_amount, 6100000, "tổng thuế = TgTThue");
eq(r.total_amount, 67100000, "tổng thanh toán = TgTTTBSo");
eq(r.items.length, 2, "chỉ lấy 2 dòng hàng hóa (bỏ dòng ghi chú TChat=4)");
eq(r.items[0], { item_code: "P1", description: "Bếp từ Bosch PID", unit: "Cái", quantity: 3, unit_price: 15000000, amount: 45000000, tax_rate: 10 }, "dòng 1 đầy đủ");
eq(r.items[1].item_code, "P2", "dòng 2 mã hàng");
eq(r.items[1].quantity, 2, "dòng 2 số lượng");
eq(r.warnings.length, 0, "không cảnh báo với file hợp lệ");

// --- Mẫu 2: có namespace (inv:) + thuế "KCT" (không chịu thuế) + thiếu MST ---
const ns = `<inv:HDon xmlns:inv="urn:xxx">
  <inv:DLHDon>
    <inv:TTChung><inv:SHDon>7</inv:SHDon><inv:NLap>2026-01-02T10:30:00</inv:NLap></inv:TTChung>
    <inv:NDHDon>
      <inv:NBan><inv:Ten>NCC KCT</inv:Ten></inv:NBan>
      <inv:DSHHDVu>
        <inv:HHDVu><inv:TChat>1</inv:TChat><inv:THHDVu>Dịch vụ tư vấn</inv:THHDVu><inv:DVTinh>Gói</inv:DVTinh><inv:SLuong>1</inv:SLuong><inv:DGia>5000000</inv:DGia><inv:TSuat>KCT</inv:TSuat><inv:ThTien>5000000</inv:ThTien></inv:HHDVu>
      </inv:DSHHDVu>
      <inv:TToan><inv:TgTCThue>5000000</inv:TgTCThue><inv:TgTThue>0</inv:TgTThue><inv:TgTTTBSo>5000000</inv:TgTTTBSo></inv:TToan>
    </inv:NDHDon>
  </inv:DLHDon>
</inv:HDon>`;

const r2 = parseInvoiceXml(ns);
eq(r2.invoice_number, "7", "namespace: đọc được SHDon");
eq(r2.invoice_date, "2026-01-02", "namespace: cắt phần giờ khỏi NLap");
eq(r2.items.length, 1, "namespace: 1 dòng");
eq(r2.items[0].tax_rate, null, 'thuế "KCT" → tax_rate null');
eq(r2.seller_tax_id, null, "thiếu MST người bán → null");
eq(r2.warnings.some((w) => w.includes("MST")), true, "cảnh báo thiếu MST người bán");

console.log(`\n${fail === 0 ? "✅ ALL PASSED" : "❌ FAILURES"}  (${pass} passed, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);
