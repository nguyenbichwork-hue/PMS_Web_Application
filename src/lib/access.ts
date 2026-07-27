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
 * Vai trò XUYÊN CÔNG TY: mọi vai trò TRỪ Nhân viên. Đội back-office dùng chung
 * cho nhiều pháp nhân nên thấy/xử lý chứng từ của tất cả công ty trong tập đoàn.
 */
export function isCrossCompany(user: User): boolean {
  return user.role !== "Employee";
}

/**
 * Vai trò DUYỆT xuyên công ty (Manager/Finance/Admin) — giữ để dùng riêng ở
 * luồng duyệt PR. Là tập con của isCrossCompany.
 */
export function isCrossCompanyApprover(user: User): boolean {
  return user.role === "Admin" || user.role === "Manager" || user.role === "Finance";
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
