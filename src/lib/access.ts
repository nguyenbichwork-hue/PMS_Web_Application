import "server-only";
import type { User } from "./types";

// ---------------------------------------------------------------------
// Phân quyền theo DỮ LIỆU (chống IDOR).
// MÔ HÌNH: đội BACK-OFFICE (Mua hàng/Quản lý/Kế toán/Quản trị) dùng CHUNG cho
// cả tập đoàn → thấy & xử lý chứng từ của MỌI pháp nhân. Chỉ NHÂN VIÊN
// (Employee) bị giới hạn theo công ty của mình (và chỉ thấy PR do mình tạo).
// ---------------------------------------------------------------------

export function isAdmin(user: User): boolean {
  return user.role === "Admin";
}

/**
 * Vai trò XUYÊN CÔNG TY. Theo chốt 19/08/2026: TOÀN BỘ tài khoản là đội
 * back-office dùng chung cho cả tập đoàn (4 pháp nhân) — kể cả "Người tạo lệnh"
 * (Employee), vì maker phải tạo PR/PRQ cho MỌI công ty. Vì vậy không giới hạn
 * theo công ty với bất kỳ vai trò nào. (Employee vẫn CHỈ thấy PR do chính mình
 * tạo — lọc riêng ở trang danh sách PR, không đụng hàm này.)
 */
export function isCrossCompany(user: User): boolean {
  return (["Employee", "Purchasing", "Manager", "Finance", "Admin"] as const).includes(user.role);
}

/**
 * Vai trò DUYỆT xuyên công ty. Theo quy trình 07/2026: PURCHASING duyệt PR,
 * MANAGER duyệt PO — cả hai + Finance/Admin đều xử lý xuyên pháp nhân. Là tập
 * con của isCrossCompany (mọi vai trò trừ Nhân viên).
 */
export function isCrossCompanyApprover(user: User): boolean {
  return (
    user.role === "Admin" ||
    user.role === "Manager" ||
    user.role === "Finance" ||
    user.role === "Purchasing"
  );
}

/** True nếu user được phép truy cập chứng từ thuộc companyId. */
export function canAccessCompany(user: User, companyId: number | null | undefined): boolean {
  if (isCrossCompany(user)) return true;
  return companyId != null && user.company_id === companyId;
}

/**
 * Thêm điều kiện lọc theo công ty vào mảng where/params đang xây dựng.
 * columnExpr là cột company_id trong truy vấn (VD 'pr.company_id', 'po.company_id').
 * Vai trò xuyên công ty (không phải Nhân viên) KHÔNG bị lọc.
 */
export function pushCompanyScope(
  user: User,
  columnExpr: string,
  where: string[],
  params: unknown[]
): void {
  if (isCrossCompany(user)) return;
  params.push(user.company_id);
  where.push(`${columnExpr} = $${params.length}`);
}
