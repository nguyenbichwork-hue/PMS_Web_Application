import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { getCurrentUser, can } from "@/lib/auth";
import { Card } from "@/components/ui";
import { ModuleBanner } from "@/components/module";
import { SettingsTabs } from "./SettingsTabs";
import { MisaPanel } from "./MisaPanel";
import { misaMode } from "@/lib/misa/client";
import type { Company } from "@/lib/types";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "settings.manage")) {
    return (
      <div>
        <ModuleBanner accent="slate" icon="⚙️" title="Cấu hình hệ thống" />
        <Card className="p-8 text-center text-sm text-slate-500">
          Chỉ Quản trị (Admin) mới truy cập được cấu hình hệ thống.
        </Card>
      </div>
    );
  }

  const rules = await query<{ id: number; amount_min: string; amount_max: string | null; levels: string[] }>(
    `SELECT id, amount_min, amount_max, levels FROM approval_rules WHERE document_type='PR' ORDER BY amount_min`
  );
  const users = await query<{
    id: number; name: string; email: string; department: string | null; role: string; company_id: number | null; company_name: string | null; status: string;
  }>(
    `SELECT u.id, u.name, u.email, u.department, u.role, u.company_id, c.company_name, u.status
       FROM users u LEFT JOIN companies c ON c.id = u.company_id ORDER BY u.id`
  );
  const companies = await query<Company>(`SELECT * FROM companies ORDER BY company_name`);
  // Bọc try/catch phòng bảng match_settings chưa migrate (server chưa restart).
  let matchRow: { price_tolerance_pct: string; amount_tolerance_pct: string; qty_tolerance_pct: string } | undefined;
  try {
    [matchRow] = await query(`SELECT price_tolerance_pct, amount_tolerance_pct, qty_tolerance_pct FROM match_settings WHERE id = 1`);
  } catch { /* chưa migrate → dùng mặc định */ }
  const matchSettings = {
    price: Number(matchRow?.price_tolerance_pct ?? 1),
    amount: Number(matchRow?.amount_tolerance_pct ?? 1),
    qty: Number(matchRow?.qty_tolerance_pct ?? 0),
  };
  const misaState = await query<{
    data_type: number; label: string | null; last_count: number; last_run: string | null; last_sync_time: string | null;
  }>(
    `SELECT data_type, label, last_count, last_run, last_sync_time FROM misa_sync_state ORDER BY data_type`
  );
  const audit = await query<{
    id: number; actor_name: string | null; action: string; document_type: string; document_id: number | null;
    field: string | null; old_value: string | null; new_value: string | null; created_at: string;
  }>(
    `SELECT id, actor_name, action, document_type, document_id, field, old_value, new_value, created_at
       FROM audit_log ORDER BY id DESC LIMIT 100`
  );

  return (
    <div>
      <ModuleBanner accent="slate" icon="⚙️" title="Cấu hình hệ thống" subtitle="MISA · Luồng duyệt · Đối chiếu · Người dùng · Công ty · Nhật ký" />
      <MisaPanel mode={misaMode()} state={misaState} />
      <SettingsTabs
        rules={rules.map((r) => ({
          id: r.id,
          amount_min: Number(r.amount_min),
          amount_max: r.amount_max === null ? null : Number(r.amount_max),
          levels: Array.isArray(r.levels) ? r.levels : JSON.parse(r.levels as unknown as string),
        }))}
        users={users}
        companies={companies.map((c) => ({ id: c.id, company_code: c.company_code, company_name: c.company_name, tax_code: c.tax_code, address: c.address, status: c.status }))}
        matchSettings={matchSettings}
        audit={audit}
      />
    </div>
  );
}
