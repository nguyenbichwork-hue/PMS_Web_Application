// =====================================================================
// AUTO-MATCH Hóa đơn → PO (logic THUẦN, không chạm DB).
//
// Khi hóa đơn (đọc từ XML) KHÔNG kèm số PO, ta tự tìm đúng PO bằng cách
// dựng một "KHÓA TỔNG HỢP" từ nhiều tín hiệu và CHẤM ĐIỂM từng PO ứng viên:
//   • NHÀ CUNG CẤP (MST)  — cổng bắt buộc: MST người bán == MST của NCC trên PO
//   • MÃ / TÊN HÀNG        — bao nhiêu dòng hóa đơn khớp được dòng PO (coverage)
//   • ĐƠN GIÁ              — giá dòng khớp có sát giá PO không (trong ngưỡng)
//   • SỐ TIỀN             — tổng hóa đơn sát tổng PO / phần còn lại chưa xuất HĐ
//
// Trả về danh sách PO xếp hạng + mức tin cậy:
//   AUTO   — điểm cao & bỏ xa ứng viên nhì → gán tự động được
//   REVIEW — có ứng viên khả dĩ nhưng mập mờ → để người xác nhận
//   NONE   — không PO nào đủ khớp
//
// KHÓA này cũng in ra chuỗi `key` để lưu vết/audit (vd
// "MST:0301234567|PO:PO-2026-00035|cov:3/3|price:3/3|amt:Δ0.4%").
// =====================================================================

// matchKey nội tuyến (gương của matching.ts) để file này THUẦN, test được bằng
// `node --experimental-strip-types` mà không kéo theo import khác.
/** Chuẩn hóa 1 khóa so khớp (mã hàng / tên hàng). */
export function matchKey(s: string | null | undefined): string {
  return (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Chuẩn hóa MST để so trùng: bỏ mọi khoảng trắng/gạch. */
export function normTax(s: string | null | undefined): string {
  return (s ?? "").replace(/[\s-]/g, "");
}

export interface AutoMatchInvoiceLine {
  itemCode: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface AutoMatchInvoice {
  sellerTaxId: string | null;
  total: number; // tổng thanh toán (gồm thuế)
  lines: AutoMatchInvoiceLine[];
}

export interface AutoMatchPoLine {
  itemCode: string | null;
  description: string | null;
  unitPrice: number;
  quantity?: number;         // để đối chiếu SL theo dòng (tùy chọn, không ảnh hưởng chấm điểm)
  vatRate?: number | null;   // để đối chiếu VAT theo dòng
  poItemId?: number;         // id dòng PO (để ghi phân bổ)
  receivedQty?: number | null; // SL đã nhận (GRN) của dòng PO
}

export interface AutoMatchPo {
  poId: number;
  poNumber: string;
  supplierId: number | null;
  supplierTaxId: string | null;
  supplierName?: string | null;
  grandTotal: number; // tổng PO (gồm thuế)
  /** Phần tiền của PO CHƯA được xuất hóa đơn (grandTotal - đã xuất). Bỏ qua nếu không biết. */
  remainingAmount?: number;
  lines: AutoMatchPoLine[];
}

export interface CandidateScore {
  poId: number;
  poNumber: string;
  supplierId: number | null;
  supplierName?: string | null;
  score: number; // 0..1
  vendorOk: boolean; // MST khớp (cả 2 bên có MST và trùng)
  vendorConflict: boolean; // cả 2 bên có MST nhưng KHÁC nhau → chặn cứng (§11.4)
  coverage: number; // tỷ lệ dòng hóa đơn khớp được dòng PO
  matchedLines: number;
  totalLines: number;
  priceAgreement: number; // tỷ lệ dòng khớp có giá sát PO
  amountScore: number; // độ sát tổng tiền (0..1)
  amountDiffPct: number; // |HĐ - tham chiếu| / tham chiếu
  key: string; // khóa tổng hợp (để audit)
  reasons: string[];
}

export type AutoMatchLevel = "AUTO" | "REVIEW" | "NONE";

export interface AutoMatchResult {
  level: AutoMatchLevel;
  best: CandidateScore | null;
  candidates: CandidateScore[]; // xếp hạng giảm dần theo score
}

export interface AutoMatchOptions {
  /** Ngưỡng lệch đơn giá coi là "sát" (tỷ lệ, mặc định 1%). */
  priceTolerance?: number;
  /** Điểm tối thiểu để gán TỰ ĐỘNG (mặc định 0.75). */
  autoThreshold?: number;
  /** Khoảng cách điểm tối thiểu so với ứng viên nhì để chắc chắn (mặc định 0.15). */
  autoMargin?: number;
  /** Điểm tối thiểu để coi là ứng viên đáng xem xét (mặc định 0.45). */
  reviewThreshold?: number;
}

/** Tra đơn giá PO cho 1 dòng hóa đơn: MÃ trước → TÊN sau → null. */
function lookupPoPrice(
  byCode: Map<string, number>,
  byDesc: Map<string, number>,
  line: AutoMatchInvoiceLine
): number | null {
  if (line.itemCode) {
    const v = byCode.get(matchKey(line.itemCode));
    if (v !== undefined) return v;
  }
  if (line.description) {
    const v = byDesc.get(matchKey(line.description));
    if (v !== undefined) return v;
  }
  return null;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

/** Chấm điểm MỘT PO ứng viên với hóa đơn. */
export function scoreCandidate(
  invoice: AutoMatchInvoice,
  po: AutoMatchPo,
  opts: AutoMatchOptions = {}
): CandidateScore {
  const priceTol = opts.priceTolerance ?? 0.01;

  const invTax = normTax(invoice.sellerTaxId);
  const poTax = normTax(po.supplierTaxId);
  const vendorOk = !!invTax && !!poTax && invTax === poTax;
  // Cả hai bên đều CÓ MST nhưng KHÁC nhau → xung đột NCC: theo đặc tả §11.4
  // "Vendor & legal entity … Block nếu sai" — PO này KHÔNG được phép ghép.
  const vendorConflict = !!invTax && !!poTax && invTax !== poTax;

  // Bảng tra giá PO theo mã & theo tên.
  const byCode = new Map<string, number>();
  const byDesc = new Map<string, number>();
  for (const l of po.lines) {
    if (l.itemCode) byCode.set(matchKey(l.itemCode), l.unitPrice);
    if (l.description) byDesc.set(matchKey(l.description), l.unitPrice);
  }

  const totalLines = invoice.lines.length;
  let matchedLines = 0;
  let priceOkLines = 0;
  for (const line of invoice.lines) {
    const poPrice = lookupPoPrice(byCode, byDesc, line);
    if (poPrice === null) continue;
    matchedLines++;
    const base = Math.max(Math.abs(line.unitPrice), Math.abs(poPrice), 1);
    if (Math.abs(line.unitPrice - poPrice) / base <= priceTol) priceOkLines++;
  }
  const coverage = totalLines > 0 ? matchedLines / totalLines : 0;
  const priceAgreement = matchedLines > 0 ? priceOkLines / matchedLines : 0;

  // Độ sát tổng tiền: lấy MIN lệch so với tổng PO và so với phần còn lại
  // (hóa đơn từng phần sẽ sát "phần còn lại" hơn tổng PO).
  const refs = [po.grandTotal];
  if (po.remainingAmount !== undefined && po.remainingAmount > 0) refs.push(po.remainingAmount);
  let amountDiffPct = 1;
  for (const ref of refs) {
    const d = Math.abs(invoice.total - ref) / Math.max(Math.abs(ref), 1);
    if (d < amountDiffPct) amountDiffPct = d;
  }
  // Hóa đơn vượt tổng PO nhiều → khó là PO này: phạt thêm.
  const overshoot = invoice.total > po.grandTotal * 1.02;
  const amountScore = Math.max(0, 1 - amountDiffPct) * (overshoot ? 0.5 : 1);

  // Tổng điểm: coverage quan trọng nhất, rồi giá, rồi tiền. Nhân cổng NCC.
  const raw = 0.5 * coverage + 0.3 * priceAgreement + 0.2 * amountScore;
  // Khác MST → xung đột NCC: điểm 0 (bị loại ở autoMatch). Thiếu MST 1 bên → hạ mạnh.
  const score = vendorConflict ? 0 : vendorOk ? raw : raw * 0.25;

  const key =
    `MST:${normTax(invoice.sellerTaxId) || "?"}` +
    `|PO:${po.poNumber}` +
    `|cov:${matchedLines}/${totalLines}` +
    `|price:${priceOkLines}/${matchedLines}` +
    `|amt:Δ${pct(amountDiffPct)}`;

  const reasons: string[] = [];
  reasons.push(vendorOk ? `NCC khớp MST (${po.supplierName ?? po.supplierTaxId}).` : "MST người bán KHÔNG khớp NCC của PO.");
  reasons.push(`Khớp ${matchedLines}/${totalLines} dòng theo mã/tên (${pct(coverage)}).`);
  if (matchedLines > 0) reasons.push(`${priceOkLines}/${matchedLines} dòng có đơn giá sát PO.`);
  reasons.push(`Lệch tổng tiền ${pct(amountDiffPct)}${overshoot ? " (hóa đơn vượt tổng PO)" : ""}.`);

  return {
    poId: po.poId,
    poNumber: po.poNumber,
    supplierId: po.supplierId,
    supplierName: po.supplierName,
    score,
    vendorOk,
    vendorConflict,
    coverage,
    matchedLines,
    totalLines,
    priceAgreement,
    amountScore,
    amountDiffPct,
    key,
    reasons,
  };
}

/** Chấm điểm MỌI PO ứng viên và quyết mức tin cậy. */
export function autoMatchInvoiceToPo(
  invoice: AutoMatchInvoice,
  candidates: AutoMatchPo[],
  opts: AutoMatchOptions = {}
): AutoMatchResult {
  const autoThreshold = opts.autoThreshold ?? 0.75;
  const autoMargin = opts.autoMargin ?? 0.15;
  const reviewThreshold = opts.reviewThreshold ?? 0.45;

  const scored = candidates
    .map((po) => scoreCandidate(invoice, po, opts))
    // CHẶN CỨNG (§11.4): loại mọi PO khác MST NCC hoặc KHÔNG có dòng nào khớp.
    // → tab đề xuất/đối chiếu KHÔNG bao giờ gợi ý sai NCC như trước nữa.
    .filter((c) => !c.vendorConflict && c.matchedLines > 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0] ?? null;
  const second = scored[1] ?? null;

  let level: AutoMatchLevel = "NONE";
  if (best && best.score >= autoThreshold && best.vendorOk) {
    const margin = best.score - (second?.score ?? 0);
    level = margin >= autoMargin ? "AUTO" : "REVIEW";
  } else if (best && best.score >= reviewThreshold) {
    level = "REVIEW";
  }

  return { level, best, candidates: scored };
}
