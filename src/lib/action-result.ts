import "server-only";

// Kết quả chuẩn cho Server Action: TRẢ VỀ lỗi thay vì throw.
//
// Vì sao? Ở PRODUCTION, Next.js CỐ TÌNH xóa message của mọi lỗi được *throw* ra
// từ Server Action và thay bằng câu chung chung:
//   "An error occurred in the Server Components render. The specific message is
//    omitted in production builds… A digest property is included…"
// → Người dùng KHÔNG bao giờ thấy được lỗi tiếng Việt thật ("Bắt buộc đính kèm
// tệp", "Bạn không được tự duyệt PR"…). Giá trị TRẢ VỀ thì KHÔNG bị xóa. Nên với
// các lỗi nghiệp vụ mong đợi, ta trả về { ok:false, error } để hiển thị đúng.
export type ActionResult = { ok: true } | { ok: false; error: string };

// Một vài mã lỗi kỹ thuật → câu tiếng Việt thân thiện.
const FRIENDLY: Record<string, string> = {
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này.",
};

/**
 * Bọc thân một Server Action KHÔNG dùng redirect(): bắt lỗi rồi TRẢ VỀ thông
 * điệp (không throw). Lỗi đầy đủ vẫn được ghi log phía server để truy vết.
 */
export async function runAction(fn: () => Promise<void>): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (e) {
    console.error("[action]", e); // stack đầy đủ trong log server / Vercel Functions
    const raw = e instanceof Error ? e.message : "";
    return { ok: false, error: FRIENDLY[raw] || raw || "Có lỗi xảy ra. Vui lòng thử lại." };
  }
}
