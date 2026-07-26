import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/access";
import { ModuleBanner } from "@/components/module";
import { MonitorTabs } from "../settings/SettingsTabs";
import { MonitorPinGate } from "./PinGate";
import { LockButton } from "./LockButton";
import { MONITOR_COOKIE, verifyMonitorToken, pinConfigured } from "@/lib/monitor-access";

// =====================================================================
// TRANG GIÁM SÁT ẨN — Dung lượng / Truy cập / Nhật ký. KHÔNG có link trong menu.
// 3 lớp: (1) phải đăng nhập, (2) phải là Admin (nếu không → 404 để "vô hình"),
// (3) phải nhập đúng PIN (cookie hết hạn sau 30 phút).
// =====================================================================
export const dynamic = "force-dynamic";

export default async function MonitorPage() {
  const user = await getCurrentUser();
  // Không phải Admin → 404 (giả vờ trang không tồn tại, không lộ khu vực này).
  if (!user || !isAdmin(user)) notFound();

  const jar = await cookies();
  const unlocked = verifyMonitorToken(jar.get(MONITOR_COOKIE)?.value);
  if (!unlocked) return <MonitorPinGate configured={pinConfigured()} />;

  const audit = await query<{
    id: number; actor_name: string | null; action: string; document_type: string; document_id: number | null;
    field: string | null; old_value: string | null; new_value: string | null; created_at: string;
  }>(
    `SELECT id, actor_name, action, document_type, document_id, field, old_value, new_value, created_at
       FROM audit_log ORDER BY id DESC LIMIT 100`
  );

  return (
    <div>
      <ModuleBanner
        accent="slate"
        icon="🔒"
        title="Giám sát hệ thống"
        subtitle="Dung lượng · Truy cập · Nhật ký — khu vực bảo mật (PIN)"
        action={<LockButton />}
      />
      <MonitorTabs audit={audit} />
    </div>
  );
}
