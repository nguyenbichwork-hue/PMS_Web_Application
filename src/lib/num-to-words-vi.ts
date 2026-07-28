// Đọc số tiền thành chữ tiếng Việt (dùng cho mẫu Payment Requisition — "Số tiền bằng chữ").
// Hỗ trợ tới hàng tỷ tỷ; làm tròn về số nguyên đồng.

const ONES = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

function readThree(n: number, full: boolean): string {
  const tram = Math.floor(n / 100);
  const chuc = Math.floor((n % 100) / 10);
  const donvi = n % 100 % 10;
  const parts: string[] = [];
  if (full || tram > 0) parts.push(`${ONES[tram]} trăm`);
  if (chuc > 1) {
    parts.push(`${ONES[chuc]} mươi`);
    if (donvi === 1) parts.push("mốt");
    else if (donvi === 5) parts.push("lăm");
    else if (donvi > 0) parts.push(ONES[donvi]);
  } else if (chuc === 1) {
    parts.push("mười");
    if (donvi === 5) parts.push("lăm");
    else if (donvi > 0) parts.push(ONES[donvi]);
  } else if (chuc === 0) {
    if (donvi > 0 && (full || tram > 0)) parts.push(`lẻ ${ONES[donvi]}`);
    else if (donvi > 0) parts.push(ONES[donvi]);
  }
  return parts.join(" ").trim();
}

const GROUP = ["", " nghìn", " triệu", " tỷ"];

/** Đọc một số nguyên không âm thành chữ. */
export function readInteger(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return "không";
  // Tách nhóm 3 chữ số, tối đa 4 nhóm (tỷ) rồi lặp lại tỷ (tỷ tỷ).
  const groups: number[] = [];
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }
  const words: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === 0) continue;
    const isLead = i === groups.length - 1;
    const suffixIdx = i % 3; // 0..2 → "", nghìn, triệu
    const tyCount = Math.floor(i / 3); // mỗi 3 nhóm là 1 cấp "tỷ"
    const chunk = readThree(g, !isLead);
    let suffix = GROUP[suffixIdx];
    for (let t = 0; t < tyCount; t++) suffix += " tỷ";
    words.push((chunk + suffix).trim());
  }
  return words.join(" ").replace(/\s+/g, " ").trim();
}

/** "Tám triệu ba trăm mười sáu nghìn đồng." — chữ hoa đầu, đơn vị "đồng". */
export function amountInWordsVi(value: number, unit = "đồng"): string {
  const words = readInteger(value);
  const s = words.charAt(0).toUpperCase() + words.slice(1);
  return `${s} ${unit}.`;
}
