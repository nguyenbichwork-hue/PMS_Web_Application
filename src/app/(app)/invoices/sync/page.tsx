import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, can } from "@/lib/auth";
import { googleSyncConfigured } from "@/lib/google-invoices";
import { PageHeader } from "@/components/ui";
import { SyncClient } from "./SyncClient";

export const metadata = { title: "Đồng bộ hóa đơn từ Google" };

export default async function InvoiceSyncPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "invoice.manage")) redirect("/invoices");

  const configured = googleSyncConfigured();
  return (
    <div className="space-y-5">
      <PageHeader
        title="Đồng bộ hóa đơn từ Google"
        subtitle="Đọc hóa đơn Mua vào từ Google Sheet và TỰ GHÉP vào PO theo NCC + mã hàng + đơn giá + số tiền (không cần số PO)."
        action={<Link href="/invoices" className="text-sm font-medium text-slate-500 hover:text-slate-800">← Hóa đơn</Link>}
      />
      <SyncClient configured={configured} />
    </div>
  );
}
