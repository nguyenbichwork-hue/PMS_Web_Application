export type Role = "Employee" | "Purchasing" | "Manager" | "Finance" | "Admin";

export interface User {
  id: number;
  name: string;
  email: string;
  department: string | null;
  role: Role;
  company_id: number | null;
  status: string;
}

export interface Company {
  id: number;
  company_code: string;
  company_name: string;
  tax_code: string | null;
  address: string | null;
  status: string;
}

export interface Supplier {
  id: number;
  supplier_code: string;
  supplier_name: string;
  tax_code: string | null;
  address: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  bank_account: string | null;
  payment_term: string | null;
  currency: string;
  debt: number;
  status: string;
}

export interface Product {
  id: number;
  item_code: string;
  item_name: string;
  category: string | null;
  unit: string;
  vat_rate: number;
  default_supplier: number | null;
  accounting_code: string | null;
  status: string;
}

export type PRStatus =
  | "Draft"
  | "Pending Approval"
  | "Approved"
  | "Rejected"
  | "Completed";

export interface PurchaseRequest {
  id: number;
  pr_number: string | null;
  request_date: string;
  requester_id: number;
  department: string | null;
  company_id: number;
  purpose: string | null;
  priority: "Low" | "Normal" | "High" | "Urgent";
  required_date: string | null;
  status: PRStatus;
  total_amount: number;
  current_level: number;
  // joined
  requester_name?: string;
  company_name?: string;
}

export interface PRItem {
  id: number;
  pr_id: number;
  item_code: string | null;
  item_name: string;
  description: string | null;
  quantity: number;
  unit: string | null;
  estimated_price: number;
  supplier_suggestion: number | null;
  note: string | null;
  line_no: number;
}

export type POStatus =
  | "Draft"
  | "Approved"
  | "Sent"
  | "Confirmed"
  | "Received"
  | "Partially Received"
  | "Closed"
  | "Cancelled";

export interface PurchaseOrder {
  id: number;
  po_number: string | null;
  pr_id: number | null;
  supplier_id: number | null;
  company_id: number;
  order_date: string;
  delivery_date: string | null;
  payment_term: string | null;
  currency: string;
  status: POStatus;
  subtotal: number;
  vat_total: number;
  grand_total: number;
  // joined
  supplier_name?: string;
  company_name?: string;
  pr_number?: string | null;
}

export interface POItem {
  id: number;
  po_id: number;
  item_code: string | null;
  description: string;
  quantity: number;
  unit: string | null;
  unit_price: number;
  discount: number;
  vat_rate: number;
  amount: number;
  line_no: number;
}

export interface GoodsReceipt {
  id: number;
  gr_number: string | null;
  po_id: number;
  receive_date: string;
  warehouse: string | null;
  receiver_id: number | null;
  status: string;
  note: string | null;
  po_number?: string | null;
  supplier_name?: string;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  invoice_date: string;
  supplier_id: number | null;
  tax_code: string | null;
  po_id: number | null;
  total_amount: number;
  vat_amount: number;
  file_attachment: string | null;
  status: string;
  match_result: string | null;
  supplier_name?: string;
  po_number?: string | null;
}

export interface InvoiceItem {
  id: number;
  invoice_id: number;
  item_code: string | null;
  description: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
}

export interface MatchCheck {
  id: number;
  invoice_id: number;
  check_name: string;
  result: "PASS" | "WARNING" | "FAIL";
  reason: string | null;
}

export interface ApprovalRecord {
  id: number;
  document_type: string;
  document_id: number;
  approver_id: number | null;
  approval_level: number;
  status: string;
  comment: string | null;
  approved_time: string;
  approver_name?: string;
}
