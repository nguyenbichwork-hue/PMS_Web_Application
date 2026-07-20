import "server-only";
import type { User } from "./types";

// ---------------------------------------------------------------------
// Phân quyền theo DỮ LIỆU (chống IDOR). Admin thấy toàn bộ; các vai trò
// khác chỉ thấy dữ liệu thuộc công ty của mình. Employee chỉ thấy chứng
// từ do chính mình tạo (áp riêng cho danh sách PR).
// ---------------------------------------------------------------------

export function isAdmin(user: User): boolean {
  return user.role === "Admin";
}

/** True nếu user được phép truy cập chứng từ thuộc companyId. */
export function canAccessCompany(user: User, companyId: number | null | undefined): boolean {
  if (user.role === "Admin") return true;
  return companyId != null && user.company_id === companyId;
}

/**
 * Thêm điều kiện lọc theo công ty vào mảng where/params đang xây dựng.
 * columnExpr là cột company_id trong truy vấn (VD 'pr.company_id', 'po.company_id').
 */
export function pushCompanyScope(
  user: User,
  columnExpr: string,
  where: string[],
  params: unknown[]
): void {
  if (user.role === "Admin") return;
  params.push(user.company_id);
  where.push(`${columnExpr} = $${params.length}`);
}
