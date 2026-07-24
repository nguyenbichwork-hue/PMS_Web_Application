// =====================================================================
// Parser HÓA ĐƠN ĐIỆN TỬ Việt Nam (chuẩn TT78/QĐ1450-TCT).
// Đọc được XML của MISA meInvoice, Viettel S-Invoice, VNPT... vì cùng bộ
// tag chuẩn: TTChung/SHDon·KHHDon·NLap, NBan/MST, DSHHDVu/HHDVu, TToan.
//
// PURE (KHÔNG "server-only") để test bằng `node --experimental-strip-types`.
// Chỉ chuyển XML → dữ liệu chuẩn hóa; map NCC/PO + ghi DB nằm ở actions.
//
// Cách đọc: chuẩn hóa theo TÊN TAG (chịu được namespace "ns:Tag" + thuộc tính),
// giới hạn phạm vi vào <DLHDon> để không đụng khối chữ ký số <DSCKS> (base64,
// không chứa dấu ngoặc nhọn nên an toàn với regex).
// =====================================================================

export interface ParsedInvoiceLine {
  item_code: string | null;   // MHHDVu (mã hàng — có thể trống)
  description: string;        // THHDVu (tên hàng hóa/dịch vụ)
  unit: string | null;        // DVTinh (đơn vị tính)
  quantity: number;          // SLuong
  unit_price: number;        // DGia (đơn giá chưa thuế)
  amount: number;            // ThTien (thành tiền chưa thuế)
  tax_rate: number | null;    // TSuat ("10%" → 10; "KCT"/"KKKNT" → null)
}

export interface ParsedInvoiceXml {
  invoice_number: string;         // SHDon (số hóa đơn)
  invoice_series: string | null;   // KHHDon (ký hiệu, VD "C22TAA")
  invoice_date: string | null;     // NLap → yyyy-mm-dd
  seller_tax_id: string | null;    // NBan/MST
  seller_name: string | null;      // NBan/Ten
  buyer_tax_id: string | null;     // NMua/MST
  currency: string;               // DVTTe (mặc định VND)
  subtotal: number;               // TgTCThue (tổng tiền chưa thuế)
  vat_amount: number;             // TgTThue (tổng tiền thuế)
  total_amount: number;           // TgTTTBSo (tổng thanh toán)
  items: ParsedInvoiceLine[];
  warnings: string[];
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&")
    .trim();
}

/** Nội dung THÔ (chưa decode) của tag ĐẦU TIÊN trong `scope`. Chịu namespace + attr. */
function tagRaw(scope: string, name: string): string | null {
  const re = new RegExp(`<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>`, "i");
  const m = scope.match(re);
  return m ? m[1] : null;
}

/** Nội dung đã decode của tag đầu tiên. null nếu không có tag. */
function tag(scope: string, name: string): string | null {
  const raw = tagRaw(scope, name);
  return raw === null ? null : decodeEntities(raw);
}

/** Danh sách nội dung THÔ của MỌI tag cùng tên (dùng cho các dòng HHDVu lặp lại). */
function tagBlocks(scope: string, name: string): string[] {
  const re = new RegExp(`<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(scope))) out.push(m[1]);
  return out;
}

/** Chuỗi số TT78 dùng dấu chấm thập phân, không có phân tách nghìn. */
const num = (s: string | null): number => {
  if (s == null) return 0;
  const t = s.replace(/[,\s₫%]/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
};

export function parseInvoiceXml(xml: string): ParsedInvoiceXml {
  const warnings: string[] = [];

  // Giới hạn phạm vi vào phần dữ liệu hóa đơn (bỏ khối chữ ký số).
  const dl = tagRaw(xml, "DLHDon") ?? xml;
  const ttc = tagRaw(dl, "TTChung") ?? dl;
  const nd = tagRaw(dl, "NDHDon") ?? dl;
  const nban = tagRaw(nd, "NBan") ?? "";
  const nmua = tagRaw(nd, "NMua") ?? "";
  const tt = tagRaw(nd, "TToan") ?? nd;

  const invoice_number = tag(ttc, "SHDon") ?? "";
  const invoice_series = tag(ttc, "KHHDon");
  const nlap = tag(ttc, "NLap");
  const invoice_date = nlap ? nlap.slice(0, 10) : null; // cắt phần giờ nếu có
  const currency = tag(ttc, "DVTTe") || "VND";

  const seller_tax_id = tag(nban, "MST");
  const seller_name = tag(nban, "Ten");
  const buyer_tax_id = tag(nmua, "MST");

  const subtotal = num(tag(tt, "TgTCThue"));
  const vat_amount = num(tag(tt, "TgTThue"));
  const total_amount = num(tag(tt, "TgTTTBSo"));

  const dshh = tagRaw(nd, "DSHHDVu") ?? "";
  const items: ParsedInvoiceLine[] = [];
  for (const b of tagBlocks(dshh, "HHDVu")) {
    const name = tag(b, "THHDVu") ?? "";
    // TChat: 1=hàng hóa/dịch vụ, 2=khuyến mại, 3=chiết khấu, 4=ghi chú/diễn giải.
    // Chỉ lấy dòng hàng hóa/dịch vụ thực (bỏ dòng ghi chú không có tên hoặc TChat≠1).
    const tchat = tag(b, "TChat");
    if (!name || (tchat && tchat !== "1" && tchat !== "")) continue;
    const rate = tag(b, "TSuat");
    items.push({
      item_code: tag(b, "MHHDVu"),
      description: name,
      unit: tag(b, "DVTinh"),
      quantity: num(tag(b, "SLuong")),
      unit_price: num(tag(b, "DGia")),
      amount: num(tag(b, "ThTien")),
      tax_rate: rate && /\d/.test(rate) ? num(rate) : null,
    });
  }

  if (!invoice_number) warnings.push("Không đọc được số hóa đơn (SHDon) — kiểm tra file XML.");
  if (items.length === 0) warnings.push("Không đọc được dòng hàng hóa/dịch vụ (HHDVu).");
  if (!seller_tax_id) warnings.push("Không đọc được MST người bán (NBan/MST) — sẽ không tự khớp nhà cung cấp.");

  return {
    invoice_number,
    invoice_series,
    invoice_date,
    seller_tax_id,
    seller_name,
    buyer_tax_id,
    currency,
    subtotal,
    vat_amount,
    total_amount,
    items,
    warnings,
  };
}
