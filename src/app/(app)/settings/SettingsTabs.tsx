"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveUserAction, deleteUserAction, forceDeleteUserAction, saveApprovalRuleAction, deleteApprovalRuleAction, fetchAuditAction, deleteAuditEntryAction, clearAuditLogAction, clearAllHistoryAction, saveMatchSettingsAction, getStorageStatsAction, getAccessLogAction, getDataHealthAction, type UsageItem, type StorageStats, type AccessEntry, type DataHealth } from "@/actions/admin";
import { syncDiagnosticAction, type SyncDiagnostic } from "@/actions/invoice-sync";
import { saveCompanyAction, deleteCompanyAction } from "@/actions/master";
import { Card, Button, Field, inputCls, StatusBadge, Th, Td, ExportButton } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { SectionImport } from "@/components/SectionImport";
import { PasswordInput } from "@/components/PasswordInput";
import { AccentPicker } from "@/components/AccentPicker";
import { Icon } from "@/components/icons";
import { money, date } from "@/lib/format";

interface Rule { id: number; amount_min: number; amount_max: number | null; levels: string[] }
interface UserRow { id: number; name: string; email: string; department: string | null; role: string; company_id: number | null; company_name: string | null; status: string }
interface CompanyRow { id: number; company_code: string; company_name: string; tax_code: string | null; address: string | null; status: string }
interface AuditRow { id: number; actor_name: string | null; action: string; document_type: string; document_id: number | null; field: string | null; old_value: string | null; new_value: string | null; created_at: string }

// LƯU Ý: Dung lượng / Truy cập / Nhật ký ĐÃ TÁCH sang trang giám sát ẩn (có PIN)
// — xem MonitorTabs bên dưới + src/app/(app)/giam-sat. Không để ở Cấu hình nữa.
const TABS = [
  { key: "rules", label: "Luồng duyệt", icon: "flow" },
  { key: "match", label: "Đối chiếu", icon: "invoice" },
  { key: "users", label: "Người dùng", icon: "users" },
  { key: "companies", label: "Công ty", icon: "company" },
  { key: "theme", label: "Giao diện", icon: "palette" },
] as const;

interface MatchSettings { price: number; amount: number; qty: number }

const ROLE_VI: Record<string, string> = { Employee: "Nhân viên", Purchasing: "Mua hàng", Manager: "Quản lý", Finance: "Kế toán", Admin: "Quản trị" };

type TabKey = (typeof TABS)[number]["key"];

export function SettingsTabs({ rules, users, companies, matchSettings }: { rules: Rule[]; users: UserRow[]; companies: CompanyRow[]; matchSettings: MatchSettings }) {
  const [tab, setTab] = useState<TabKey>("rules");

  // Khôi phục tab từ URL (?tab=) khi mở/quay lại trang.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && TABS.some((x) => x.key === t)) setTab(t as TabKey);
  }, []);

  // Đổi tab tức thì (client), đồng bộ URL không tải lại server.
  const select = (k: TabKey) => {
    setTab(k);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", k);
    window.history.replaceState(null, "", url.toString());
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => select(t.key)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === t.key ? "bg-brand-500 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Icon name={t.icon} size={16} /> {t.label}
          </button>
        ))}
      </div>

      <div key={tab} className="animate-fade-up [animation-duration:.25s]">
        {tab === "rules" && <RulesPanel rules={rules} />}
        {tab === "match" && <TolerancePanel settings={matchSettings} />}
        {tab === "users" && <UsersPanel users={users} companies={companies} />}
        {tab === "companies" && <CompaniesPanel companies={companies} />}
        {tab === "theme" && <AccentPicker />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// GIÁM SÁT (ẩn, có PIN): Dung lượng · Truy cập · Nhật ký — tách khỏi Cấu hình
// để chỉ Admin biết URL + nhập PIN mới xem được. Dùng lại 3 panel bên dưới.
// ---------------------------------------------------------------------
const MONITOR_TABS = [
  { key: "data", label: "Dữ liệu", icon: "import" },
  { key: "storage", label: "Dung lượng", icon: "dashboard" },
  { key: "access", label: "Truy cập", icon: "bell" },
  { key: "audit", label: "Nhật ký", icon: "log" },
] as const;

export function MonitorTabs({ audit }: { audit: AuditRow[] }) {
  const [tab, setTab] = useState<(typeof MONITOR_TABS)[number]["key"]>("data");
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
        {MONITOR_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === t.key ? "bg-brand-500 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Icon name={t.icon} size={16} /> {t.label}
          </button>
        ))}
      </div>
      <div key={tab} className="animate-fade-up [animation-duration:.25s]">
        {tab === "data" && <DataPanel />}
        {tab === "storage" && <StoragePanel />}
        {tab === "access" && <AccessPanel />}
        {tab === "audit" && <AuditPanel audit={audit} />}
      </div>
    </div>
  );
}

// ---------------- Kiểm tra DỮ LIỆU kéo về (DB + Google Sheet + Drive) ----------------
const LEVEL_VI: Record<string, { label: string; cls: string }> = {
  AUTO: { label: "Tự động", cls: "bg-emerald-100 text-emerald-700" },
  REVIEW: { label: "Cần xem", cls: "bg-amber-100 text-amber-700" },
  NONE: { label: "Chưa ghép", cls: "bg-rose-100 text-rose-700" },
  IMPORTED: { label: "Đã nhập", cls: "bg-slate-100 text-slate-600" },
};

function DataPanel() {
  const [health, setHealth] = useState<DataHealth | null>(null);
  const [sync, setSync] = useState<SyncDiagnostic | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setErr(null);
    Promise.allSettled([getDataHealthAction(), syncDiagnosticAction()])
      .then(([h, s]) => {
        if (h.status === "fulfilled") setHealth(h.value); else setErr("Không đếm được dữ liệu.");
        if (s.status === "fulfilled") setSync(s.value); else setSync(null);
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Dữ liệu nghiệp vụ trong hệ thống</h3>
          <Button variant="secondary" onClick={load} disabled={loading}>{loading ? "Đang tải…" : "↻ Làm mới"}</Button>
        </div>
        {err && <p className="text-sm text-rose-500">{err}</p>}
        {!health && !err && <p className="text-sm text-slate-400">Đang tải…</p>}
        {health && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {health.totals.map((t) => (
                <div key={t.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className={`text-xl font-bold ${t.rows === 0 ? "text-rose-500" : "text-slate-800"}`}>{t.rows.toLocaleString("vi-VN")}</div>
                  <div className="text-xs text-slate-500">{t.label}</div>
                </div>
              ))}
            </div>
            {health.byCompany.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full">
                  <thead className="bg-slate-50"><tr><Th>Công ty (pháp nhân)</Th><Th className="text-right">PR</Th><Th className="text-right">PO</Th><Th className="text-right">Nhận hàng</Th><Th className="text-right">Hóa đơn</Th></tr></thead>
                  <tbody>
                    {health.byCompany.map((c) => (
                      <tr key={c.company} className="hover:bg-slate-50">
                        <Td className="font-medium">{c.company}</Td>
                        <Td className="text-right">{c.pr}</Td>
                        <Td className="text-right">{c.po}</Td>
                        <Td className="text-right">{c.grn}</Td>
                        <Td className="text-right">{c.invoice}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-slate-400">Số 0 (đỏ) nghĩa là bảng đó chưa có dữ liệu. Cập nhật {new Date(health.generatedAt).toLocaleString("vi-VN")}.</p>
          </div>
        )}
      </Card>

      {/* Google Sheet + Drive — hóa đơn có kéo về / ghép được không */}
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Đồng bộ hóa đơn (Google Sheet + Drive)</h3>
        {!sync && <p className="text-sm text-slate-400">Đang tải…</p>}
        {sync && !sync.configured && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">Chưa cấu hình Google (thiếu khóa service account / INVOICE_SHEET_ID). Đồng bộ chưa hoạt động.</p>
        )}
        {sync && sync.configured && sync.error && (
          <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-600">Lỗi đọc Sheet: {sync.error}</p>
        )}
        {sync && sync.configured && !sync.error && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="HĐ mua-vào đọc được" value={sync.totalPurchase} />
              <Stat label="PO đang mở (ứng viên)" value={sync.openPoCount} tone={sync.openPoCount === 0 ? "rose" : "slate"} />
              <Stat label="Tự động" value={sync.counts.auto} />
              <Stat label="Cần xem" value={sync.counts.review} />
              <Stat label="Chưa ghép" value={sync.counts.none} tone={sync.counts.none > 0 ? "rose" : "slate"} />
              <Stat label="Đã nhập" value={sync.alreadyImported} />
            </div>

            {/* Trạng thái Drive */}
            <div className={`rounded-lg border p-3 text-sm ${sync.drive.probed && !sync.drive.ok ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
              <b>Google Drive (file XML gốc): </b>
              {!sync.drive.probed
                ? "Không có hóa đơn nào kèm link XML để kiểm tra."
                : sync.drive.ok
                ? `✓ Đọc được Drive (thử file “${sync.drive.fileName ?? "?"}”). ${sync.drive.withXml} hóa đơn có XML, ${sync.drive.withoutXml} không có.`
                : `✗ KHÔNG đọc được Drive (mã ${sync.drive.status}). Có thể folder/file chưa chia sẻ cho service account. ${sync.drive.error ?? ""}`}
            </div>
            {sync.companyTaxId != null && (
              <p className="text-xs text-slate-400">Đang lọc hóa đơn theo MST bên mua = <b>{sync.companyTaxId || "(trống — lấy tất cả)"}</b> (biến COMPANY_TAX_ID).</p>
            )}

            <div className="max-h-[420px] overflow-auto rounded-lg border border-slate-200">
              <table className="w-full">
                <thead className="sticky top-0 bg-slate-50"><tr><Th>Số HĐ</Th><Th>Người bán</Th><Th>MST</Th><Th className="text-right">Tổng</Th><Th>Trạng thái</Th><Th>Lý do</Th></tr></thead>
                <tbody>
                  {sync.items.length === 0 && <tr><Td colSpan={6} className="text-slate-400">Không có hóa đơn mua-vào nào từ Sheet.</Td></tr>}
                  {sync.items.map((it, i) => {
                    const lv = LEVEL_VI[it.level];
                    return (
                      <tr key={i} className="hover:bg-slate-50">
                        <Td className="text-xs font-medium">{it.invoiceNumber ?? "—"}</Td>
                        <Td className="max-w-[180px] truncate text-xs">{it.sellerName ?? "—"}</Td>
                        <Td className="font-mono text-xs">{it.sellerTaxId ?? "—"}</Td>
                        <Td className="text-right text-xs">{money(it.total)}</Td>
                        <Td><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${lv.cls}`}>{lv.label}</span></Td>
                        <Td className="text-xs text-slate-500">{it.reason}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-400">Danh sách hiện tối đa 300 hóa đơn, ưu tiên loại “Chưa ghép” lên đầu kèm lý do để xử lý.</p>
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------- Dung lượng lưu trữ ----------------
function fmtBytes(b: number | null): string {
  if (b == null) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function UsageBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const tone = pct > 90 ? "bg-rose-500" : pct > 70 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span>{pct < 1 ? pct.toFixed(2) : pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${tone}`} style={{ width: `${Math.max(pct, 0.5)}%` }} />
      </div>
    </div>
  );
}

function StoragePanel() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setErr(null);
    getStorageStatsAction()
      .then(setStats)
      .catch((e) => setErr(e instanceof Error ? e.message : "Không tải được dung lượng."))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const totalTableBytes = stats?.tables.reduce((s, t) => s + (t.bytes ?? 0), 0) ?? 0;
  const dbUsed = stats?.dbBytes ?? totalTableBytes;
  const totalRows = stats?.tables.reduce((s, t) => s + t.rows, 0) ?? 0;

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Dung lượng lưu trữ</h3>
        <Button variant="secondary" onClick={load} disabled={loading}>
          {loading ? "Đang tải…" : "↻ Làm mới"}
        </Button>
      </div>

      {err && <p className="text-sm text-rose-500">{err}</p>}
      {!stats && !err && <p className="text-sm text-slate-400">Đang tải…</p>}

      {stats && (
        <div className="space-y-5">
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            <div><b className="text-slate-700">Chế độ:</b> {stats.mode}</div>
            <div className="mt-1">{stats.note}</div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-sm font-semibold text-slate-700">DB nghiệp vụ · {stats.businessEngine}</span>
                <span className="text-lg font-bold text-slate-900">{fmtBytes(dbUsed)}</span>
              </div>
              <div className="space-y-2">
                <UsageBar used={dbUsed} limit={stats.limits.freeDb} label={`Gói Free (${fmtBytes(stats.limits.freeDb)})`} />
                <UsageBar used={dbUsed} limit={stats.limits.proDb} label={`Gói Pro (${fmtBytes(stats.limits.proDb)})`} />
              </div>
            </div>

            {stats.accounts ? (
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-sm font-semibold text-slate-700">DB tài khoản · {stats.accounts.engine}</span>
                  <span className="text-lg font-bold text-slate-900">{stats.accounts.dbBytes != null ? fmtBytes(stats.accounts.dbBytes) : "—"}</span>
                </div>
                <p className="text-xs text-slate-500">{stats.accounts.users.toLocaleString("vi-VN")} tài khoản đăng nhập (rất nhỏ so với dữ liệu nghiệp vụ).</p>
                {stats.accounts.dbBytes != null && (
                  <div className="mt-2 space-y-2">
                    <UsageBar used={stats.accounts.dbBytes} limit={stats.limits.freeDb} label={`Supabase Free (${fmtBytes(stats.limits.freeDb)})`} />
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-sm font-semibold text-slate-700">File chứng từ ({stats.files.count})</span>
                  <span className="text-lg font-bold text-slate-900">{fmtBytes(stats.files.bytes)}</span>
                </div>
                <div className="space-y-2">
                  <UsageBar used={stats.files.bytes} limit={stats.limits.freeFile} label={`Gói Free (${fmtBytes(stats.limits.freeFile)})`} />
                  <UsageBar used={stats.files.bytes} limit={stats.limits.proFile} label={`Gói Pro (${fmtBytes(stats.limits.proFile)})`} />
                </div>
              </div>
            )}
          </div>

          {stats.accounts && (
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-sm font-semibold text-slate-700">File chứng từ ({stats.files.count})</span>
                <span className="text-lg font-bold text-slate-900">{fmtBytes(stats.files.bytes)}</span>
              </div>
              <div className="space-y-2 md:max-w-md">
                <UsageBar used={stats.files.bytes} limit={stats.limits.freeFile} label={`Gói Free (${fmtBytes(stats.limits.freeFile)})`} />
                <UsageBar used={stats.files.bytes} limit={stats.limits.proFile} label={`Gói Pro (${fmtBytes(stats.limits.proFile)})`} />
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr><Th>Bảng dữ liệu</Th><Th className="text-right">Số bản ghi</Th><Th className="text-right">Dung lượng</Th></tr>
              </thead>
              <tbody>
                {stats.tables.map((t) => (
                  <tr key={t.table} className="hover:bg-slate-50">
                    <Td>{t.label}</Td>
                    <Td className="text-right">{t.rows.toLocaleString("vi-VN")}</Td>
                    <Td className="text-right text-slate-500">{fmtBytes(t.bytes)}</Td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-semibold">
                  <Td>Tổng</Td>
                  <Td className="text-right">{totalRows.toLocaleString("vi-VN")}</Td>
                  <Td className="text-right">{fmtBytes(stats.dbBytes ?? totalTableBytes)}</Td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="text-xs text-slate-400">
            Cập nhật {new Date(stats.generatedAt).toLocaleString("vi-VN")}. Cột “Dung lượng” chỉ hiện khi engine đo được
            (Postgres/Supabase); PGlite cục bộ có thể để trống — khi đó xem theo số bản ghi.
          </p>
        </div>
      )}
    </Card>
  );
}

// ---------------- Lịch sử truy cập (IP) ----------------
const ACTION_VI: Record<string, { label: string; cls: string }> = {
  Login: { label: "Đăng nhập", cls: "bg-emerald-100 text-emerald-700" },
  LoginFailed: { label: "Sai mật khẩu", cls: "bg-rose-100 text-rose-700" },
  Logout: { label: "Đăng xuất", cls: "bg-slate-100 text-slate-600" },
};

function uaLabel(ua: string | null): string {
  if (!ua) return "—";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad|iOS/.test(ua) ? "iOS"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome"
    : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return [br, os].filter(Boolean).join(" · ") || ua.slice(0, 30);
}

function Stat({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "rose" }) {
  return (
    <div className={`rounded-xl border p-3 ${tone === "rose" ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-slate-50"}`}>
      <div className={`text-xl font-bold ${tone === "rose" ? "text-rose-600" : "text-slate-800"}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function AccessPanel() {
  const [rows, setRows] = useState<AccessEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setErr(null);
    getAccessLogAction()
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : "Không tải được lịch sử truy cập."))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const logins = (rows ?? []).filter((r) => r.action === "Login").length;
  const failed = (rows ?? []).filter((r) => r.action === "LoginFailed").length;
  const uniqueIps = new Set((rows ?? []).map((r) => r.ip).filter(Boolean)).size;

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Lịch sử truy cập (IP)</h3>
        <Button variant="secondary" onClick={load} disabled={loading}>{loading ? "Đang tải…" : "↻ Làm mới"}</Button>
      </div>

      {err && <p className="text-sm text-rose-500">{err}</p>}
      {!rows && !err && <p className="text-sm text-slate-400">Đang tải…</p>}

      {rows && (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2 text-center">
            <Stat label="IP khác nhau" value={uniqueIps} />
            <Stat label="Lượt đăng nhập" value={logins} />
            <Stat label="Sai mật khẩu" value={failed} tone={failed > 0 ? "rose" : "slate"} />
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr><Th>Thời gian</Th><Th>Người dùng</Th><Th>Hành động</Th><Th>IP</Th><Th>Trình duyệt</Th></tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><Td colSpan={5} className="text-slate-400">Chưa có lượt truy cập nào.</Td></tr>
                )}
                {rows.map((r) => {
                  const a = ACTION_VI[r.action] ?? { label: r.action, cls: "bg-slate-100 text-slate-600" };
                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <Td className="whitespace-nowrap text-xs text-slate-500">{new Date(r.at).toLocaleString("vi-VN")}</Td>
                      <Td>{r.actor ?? "—"}</Td>
                      <Td><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${a.cls}`}>{a.label}</span></Td>
                      <Td className="font-mono text-xs">{r.ip ?? "—"}</Td>
                      <Td className="text-xs text-slate-500">{uaLabel(r.ua)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Ghi mỗi lần đăng nhập/đăng xuất. Chạy máy cục bộ hiện “local”; khi lên hosting/proxy sẽ là IP thật (x-forwarded-for).
          </p>
        </>
      )}
    </Card>
  );
}

// ---------------- Luồng duyệt ----------------
function RulesPanel({ rules }: { rules: Rule[] }) {
  const [editing, setEditing] = useState<Rule | "new" | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Ngưỡng phê duyệt PR (theo giá trị)</h3>
        <Button onClick={() => setEditing("new")}>+ Thêm ngưỡng</Button>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full">
          <thead><tr><Th>Từ</Th><Th>Đến</Th><Th>Chuỗi duyệt</Th><Th className="text-right">Thao tác</Th></tr></thead>
          <tbody>
            {rules.length === 0 && (
              <tr><Td colSpan={4} className="text-slate-400">Chưa có ngưỡng duyệt nào — bấm “+ Thêm ngưỡng”.</Td></tr>
            )}
            {rules.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <Td>{money(r.amount_min)}</Td>
                <Td>{r.amount_max === null ? "∞" : money(r.amount_max)}</Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-1">
                    {r.levels.map((lv, i) => (
                      <span key={i} className="inline-flex items-center gap-1">
                        <span className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">{ROLE_VI[lv] ?? lv}</span>
                        {i < r.levels.length - 1 && <span className="text-slate-300">→</span>}
                      </span>
                    ))}
                  </div>
                </Td>
                <Td>
                  <div className="flex justify-end gap-3">
                    <button className="text-sm text-brand-600 hover:underline" onClick={() => setEditing(r)}>Sửa</button>
                    <button
                      className="text-sm text-rose-500 hover:underline"
                      onClick={() => { if (confirm("Xóa ngưỡng này?")) start(async () => { await deleteApprovalRuleAction(r.id); router.refresh(); }); }}
                      disabled={pending}
                    >Xóa</button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-400">Chuỗi duyệt nhập các vai trò cách nhau dấu phẩy, theo thứ tự. VD: <code>Manager, Finance, Admin</code></p>

      {editing && (
        <Modal open title={editing === "new" ? "Thêm ngưỡng duyệt" : "Sửa ngưỡng duyệt"} onClose={() => setEditing(null)}>
          <form action={async (fd) => { await saveApprovalRuleAction(fd); setEditing(null); router.refresh(); }} className="space-y-3">
            {editing !== "new" && <input type="hidden" name="id" value={editing.id} />}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Từ (₫)" required><input name="amount_min" type="number" defaultValue={editing === "new" ? 0 : editing.amount_min} className={inputCls} required /></Field>
              <Field label="Đến (₫) — trống = ∞"><input name="amount_max" type="number" defaultValue={editing === "new" || editing.amount_max === null ? "" : editing.amount_max} className={inputCls} /></Field>
            </div>
            <Field label="Chuỗi duyệt (vai trò, cách nhau dấu phẩy)" required>
              <input name="levels" defaultValue={editing === "new" ? "Manager" : editing.levels.join(", ")} className={inputCls} required placeholder="Manager, Finance" />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Hủy</Button>
              <Button type="submit">Lưu</Button>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  );
}

// ---------------- Đối chiếu (tolerance) ----------------
function TolerancePanel({ settings }: { settings: MatchSettings }) {
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  return (
    <Card className="p-5">
      <h3 className="mb-1 text-sm font-semibold text-slate-700">Ngưỡng đối chiếu hóa đơn ↔ PO</h3>
      <p className="mb-4 text-xs text-slate-400">
        Mức sai lệch (%) được tự động chấp nhận khi đối chiếu. Trong ngưỡng → coi như khớp; vượt ngưỡng → Sai lệch (FAIL/WARNING).
      </p>
      <form
        action={(fd) => start(async () => { await saveMatchSettingsAction(fd); setSaved(true); router.refresh(); })}
        className="max-w-lg space-y-3"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Đơn giá (%)"><input name="price" type="number" step="0.01" min={0} defaultValue={settings.price} className={inputCls} /></Field>
          <Field label="Tổng tiền (%)"><input name="amount" type="number" step="0.01" min={0} defaultValue={settings.amount} className={inputCls} /></Field>
          <Field label="Số lượng (%)"><input name="qty" type="number" step="0.01" min={0} defaultValue={settings.qty} className={inputCls} /></Field>
        </div>
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
          Gợi ý: Đơn giá 1% · Tổng tiền 1% · Số lượng 0% (không cho vượt số đã nhận). Thuế chỉ chấp nhận sai số làm tròn — không cấu hình ở đây.
        </p>
        <div className="flex items-center gap-3 pt-1">
          <Button type="submit" disabled={pending}>{pending ? "Đang lưu…" : "Lưu ngưỡng"}</Button>
          {saved && !pending && <span className="text-xs font-medium text-emerald-600">✓ Đã lưu</span>}
        </div>
      </form>
    </Card>
  );
}

// ---------------- Người dùng ----------------
function UsersPanel({ users, companies }: { users: UserRow[]; companies: CompanyRow[] }) {
  const [editing, setEditing] = useState<UserRow | "new" | null>(null);
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState<{ user: UserRow; usage: UsageItem[] } | null>(null);
  const router = useRouter();

  const remove = (u: UserRow) => {
    if (!confirm(`Xóa tài khoản "${u.name}" (${u.email})?`)) return;
    start(async () => {
      const res = await deleteUserAction(u.id);
      if (res.ok) { router.refresh(); return; }
      // Tài khoản đã phát sinh dữ liệu → mở bảng thông báo để xác nhận xóa cưỡng bức.
      if (res.hasData) { setConfirming({ user: u, usage: res.usage ?? [] }); return; }
      alert(res.error ?? "Không xóa được tài khoản.");
    });
  };

  const forceRemove = () => {
    if (!confirming) return;
    const uid = confirming.user.id;
    start(async () => {
      const res = await forceDeleteUserAction(uid);
      setConfirming(null);
      if (!res.ok) alert(res.error ?? "Không xóa được tài khoản.");
      else router.refresh();
    });
  };

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700">Người dùng & phân quyền</h3>
        <div className="flex items-center gap-2">
          <ExportButton href="/export/users" />
          <SectionImport section="users" variant="light" />
          <Button onClick={() => setEditing("new")}>+ Thêm người dùng</Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full">
          <thead><tr><Th>Tên</Th><Th>Email</Th><Th>Phòng ban</Th><Th>Vai trò</Th><Th>Công ty</Th><Th>Trạng thái</Th><Th className="text-right">Thao tác</Th></tr></thead>
          <tbody>
            {users.length === 0 && (
              <tr><Td colSpan={7} className="text-slate-400">Chưa có người dùng nào — bấm “+ Thêm người dùng”.</Td></tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <Td className="font-medium">{u.name}</Td>
                <Td className="text-xs">{u.email}</Td>
                <Td>{u.department ?? "—"}</Td>
                <Td><span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{ROLE_VI[u.role] ?? u.role}</span></Td>
                <Td>{u.company_name ?? "—"}</Td>
                <Td><StatusBadge status={u.status} /></Td>
                <Td>
                  <div className="flex justify-end gap-3">
                    <button className="text-sm text-brand-600 hover:underline" onClick={() => setEditing(u)}>Sửa</button>
                    <button className="text-sm text-rose-500 hover:underline disabled:opacity-40" onClick={() => remove(u)} disabled={pending}>Xóa</button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal open title={editing === "new" ? "Thêm người dùng" : "Sửa người dùng"} onClose={() => setEditing(null)}>
          <form action={async (fd) => { await saveUserAction(fd); setEditing(null); router.refresh(); }} className="space-y-3">
            {editing !== "new" && <input type="hidden" name="id" value={editing.id} />}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Họ tên" required><input name="name" defaultValue={editing === "new" ? "" : editing.name} className={inputCls} required /></Field>
              <Field label="Email" required><input name="email" type="email" defaultValue={editing === "new" ? "" : editing.email} className={inputCls} required /></Field>
              <Field label="Phòng ban"><input name="department" defaultValue={editing === "new" ? "" : editing.department ?? ""} className={inputCls} /></Field>
              <Field label="Vai trò" required>
                <select name="role" defaultValue={editing === "new" ? "Employee" : editing.role} className={inputCls}>
                  {Object.keys(ROLE_VI).map((r) => <option key={r} value={r}>{ROLE_VI[r]}</option>)}
                </select>
              </Field>
              <Field label="Công ty">
                <select name="company_id" defaultValue={editing === "new" ? "" : editing.company_id ?? ""} className={inputCls}>
                  <option value="">—</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                </select>
              </Field>
              <Field label="Trạng thái">
                <select name="status" defaultValue={editing === "new" ? "Active" : editing.status} className={inputCls}>
                  <option value="Active">Đang dùng</option><option value="Inactive">Ngưng</option>
                </select>
              </Field>
            </div>
            <Field label={editing === "new" ? "Mật khẩu (trống = 'password')" : "Đặt lại mật khẩu (trống = giữ nguyên)"}>
              <PasswordInput name="password" type="text" className={inputCls} placeholder="••••••" />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Hủy</Button>
              <Button type="submit">Lưu</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Bảng thông báo khi tài khoản ĐÃ phát sinh dữ liệu — cho xóa cưỡng bức */}
      {confirming && (
        <Modal
          open
          onClose={() => setConfirming(null)}
          title="Tài khoản đã phát sinh dữ liệu"
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setConfirming(null)}>Hủy</Button>
              <button
                onClick={forceRemove}
                disabled={pending}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
              >
                {pending ? "Đang xóa…" : "Xóa luôn (chuyển dữ liệu cho tôi)"}
              </button>
            </>
          }
        >
          <p className="text-sm text-slate-600">
            Tài khoản <b>{confirming.user.name}</b> ({confirming.user.email}) đang gắn với các dữ liệu sau:
          </p>
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full">
              <thead><tr><Th>Loại dữ liệu</Th><Th className="text-right">Số lượng</Th></tr></thead>
              <tbody>
                {confirming.usage.map((x) => (
                  <tr key={x.label} className="hover:bg-slate-50">
                    <Td>{x.label}</Td>
                    <Td className="text-right font-semibold text-slate-700">{x.count}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Nếu bấm <b>Xóa luôn</b>, toàn bộ dữ liệu trên sẽ được <b>chuyển sang tài khoản Quản trị của bạn</b> (giữ nguyên chứng từ),
            sau đó tài khoản này bị xóa — kể cả trên Supabase. Không thể hoàn tác.
          </p>
        </Modal>
      )}
    </Card>
  );
}

// ---------------- Công ty ----------------
function CompaniesPanel({ companies }: { companies: CompanyRow[] }) {
  const [editing, setEditing] = useState<CompanyRow | "new" | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const remove = (c: CompanyRow) => {
    if (!confirm(`Xóa pháp nhân "${c.company_name}" (${c.company_code})?`)) return;
    start(async () => {
      const res = await deleteCompanyAction(c.id);
      if (!res.ok) { alert(res.error ?? "Không xóa được pháp nhân."); return; }
      if (res.deactivated) alert("Pháp nhân đã có chứng từ tham chiếu → đã chuyển sang trạng thái Ngưng.");
      router.refresh();
    });
  };

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700">Pháp nhân (Companies)</h3>
        <Button onClick={() => setEditing("new")}>+ Thêm pháp nhân</Button>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full">
          <thead>
            <tr>
              <Th>Mã</Th><Th>Tên công ty</Th><Th>Mã số thuế</Th><Th>Địa chỉ</Th><Th>Trạng thái</Th><Th className="text-right">Thao tác</Th>
            </tr>
          </thead>
          <tbody>
            {companies.length === 0 && (
              <tr><Td className="text-slate-400" colSpan={6}>Chưa có pháp nhân nào — bấm “+ Thêm pháp nhân”.</Td></tr>
            )}
            {companies.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <Td className="font-medium">{c.company_code}</Td>
                <Td>{c.company_name}</Td>
                <Td className="tabular-nums">{c.tax_code ?? "—"}</Td>
                <Td className="max-w-xs truncate text-slate-500">{c.address ?? "—"}</Td>
                <Td><StatusBadge status={c.status} /></Td>
                <Td>
                  <div className="flex justify-end gap-3">
                    <button className="text-sm text-brand-600 hover:underline" onClick={() => setEditing(c)}>Sửa</button>
                    <button className="text-sm text-rose-500 hover:underline disabled:opacity-40" onClick={() => remove(c)} disabled={pending}>Xóa</button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal open title={editing === "new" ? "Thêm pháp nhân" : "Sửa pháp nhân"} onClose={() => setEditing(null)}>
          <form action={async (fd) => { await saveCompanyAction(fd); setEditing(null); router.refresh(); }} className="space-y-3">
            {editing !== "new" && <input type="hidden" name="id" value={editing.id} />}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mã pháp nhân" required>
                <input
                  name="company_code"
                  defaultValue={editing === "new" ? "" : editing.company_code}
                  className={inputCls}
                  required
                  disabled={editing !== "new"}
                  placeholder="VD: KH"
                />
              </Field>
              <Field label="Trạng thái">
                <select name="status" defaultValue={editing === "new" ? "Active" : editing.status} className={inputCls}>
                  <option value="Active">Đang dùng</option><option value="Inactive">Ngưng</option>
                </select>
              </Field>
            </div>
            <Field label="Tên công ty" required>
              <input name="company_name" defaultValue={editing === "new" ? "" : editing.company_name} className={inputCls} required placeholder="VD: Công ty TNHH K-Homès" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mã số thuế"><input name="tax_code" defaultValue={editing === "new" ? "" : editing.tax_code ?? ""} className={inputCls} /></Field>
              <Field label="Địa chỉ"><input name="address" defaultValue={editing === "new" ? "" : editing.address ?? ""} className={inputCls} /></Field>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Hủy</Button>
              <Button type="submit">Lưu</Button>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  );
}

// ---------------- Nhật ký (realtime — chỉ Admin) ----------------
const AUTH_ACTIONS = new Set(["Login", "Logout", "LoginFailed"]);
function actionClass(a: string) {
  if (a === "LoginFailed") return "bg-rose-50 text-rose-700";
  if (a === "Login") return "bg-emerald-50 text-emerald-700";
  if (a === "Logout") return "bg-slate-100 text-slate-600";
  return "bg-indigo-50 text-indigo-700";
}

function AuditPanel({ audit }: { audit: AuditRow[] }) {
  const [rows, setRows] = useState<AuditRow[]>(audit);
  const [auto, setAuto] = useState(true);
  const [updatedAt, setUpdatedAt] = useState("");
  const [busy, start] = useTransition();
  const router = useRouter();

  // Tự động làm mới mỗi 4 giây (poll) khi bật.
  useEffect(() => {
    if (!auto) return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetchAuditAction();
        if (alive) {
          setRows(r as AuditRow[]);
          setUpdatedAt(new Date().toLocaleTimeString("vi-VN"));
        }
      } catch {
        /* mất quyền / lỗi mạng — bỏ qua nhịp này */
      }
    };
    tick();
    const id = setInterval(tick, 4000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [auto]);

  // Dọn nhật ký (dữ liệu ảo/demo) → tạm dừng auto để kết quả không bị ghi đè ngay.
  const removeOne = (a: AuditRow) => {
    if (!confirm(`Xóa dòng nhật ký này?\n${a.action} · ${a.document_type}${a.document_id ? ` #${a.document_id}` : ""}`)) return;
    setAuto(false);
    setRows((p) => p.filter((x) => x.id !== a.id)); // xóa lạc quan
    start(async () => {
      const res = await deleteAuditEntryAction(a.id);
      if (!res.ok) { alert(res.error ?? "Không xóa được."); setAuto(true); }
    });
  };

  const clearAll = () => {
    if (!confirm("Dọn SẠCH toàn bộ nhật ký? Thao tác này không thể hoàn tác.")) return;
    setAuto(false);
    start(async () => {
      const res = await clearAuditLogAction();
      if (!res.ok) { alert(res.error ?? "Không dọn được nhật ký."); setAuto(true); return; }
      setRows([]);
    });
  };

  // ⚠️ TẠM (demo): xóa TOÀN BỘ lịch sử chứng từ, giữ tài khoản + danh mục.
  const clearHistory = () => {
    if (!confirm("⚠️ XÓA TOÀN BỘ lịch sử chứng từ?\n\nGồm: PR · PO · Nhận hàng · Hóa đơn · Thanh toán · Lịch sử duyệt/điều chỉnh · Bình luận · Đính kèm · Nhật ký.\nGIỮ NGUYÊN: tài khoản, công ty, NCC, hàng hóa, ngưỡng duyệt.\n\nKhông thể hoàn tác — chỉ dùng để reset dữ liệu demo.")) return;
    if (!confirm("Xác nhận LẦN 2: xóa sạch toàn bộ chứng từ để làm lại demo?")) return;
    setAuto(false);
    start(async () => {
      const res = await clearAllHistoryAction();
      if (!res.ok) { alert(res.error ?? "Xóa thất bại."); setAuto(true); return; }
      setRows([]);
      router.refresh();
      alert("Đã xóa toàn bộ lịch sử chứng từ. Có thể bắt đầu demo lại từ đầu.");
    });
  };

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700">Nhật ký hệ thống (100 dòng gần nhất)</h3>
        <div className="flex items-center gap-3">
          {auto && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Trực tiếp{updatedAt ? ` · ${updatedAt}` : ""}
            </span>
          )}
          <button
            onClick={() => setAuto((v) => !v)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            {auto ? "⏸ Tạm dừng" : "▶ Tự động làm mới"}
          </button>
          <button
            onClick={clearAll}
            disabled={busy || rows.length === 0}
            className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-100 disabled:opacity-40"
          >
            🧹 Dọn sạch
          </button>
        </div>
      </div>
      <div className="overflow-auto rounded-lg border border-slate-200">
        <table className="w-full">
          <thead><tr><Th>Thời gian</Th><Th>Người</Th><Th>Hành động</Th><Th>Chứng từ</Th><Th>Thay đổi</Th><Th className="text-right">Xóa</Th></tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className={`hover:bg-slate-50 ${AUTH_ACTIONS.has(a.action) ? "bg-slate-50/40" : ""}`}>
                <Td className="whitespace-nowrap text-xs">
                  {date(a.created_at)} <span className="text-slate-400" suppressHydrationWarning>{new Date(a.created_at).toLocaleTimeString("vi-VN")}</span>
                </Td>
                <Td>{a.actor_name ?? "—"}</Td>
                <Td><span className={`rounded-md px-2 py-0.5 text-xs font-medium ${actionClass(a.action)}`}>{a.action}</span></Td>
                <Td className="text-xs">{a.document_type}{a.document_id ? ` #${a.document_id}` : ""}</Td>
                <Td className="text-xs text-slate-500">
                  {a.field ? <b>{a.field}: </b> : null}
                  {a.old_value ? <span className="text-slate-400 line-through">{a.old_value}</span> : null}
                  {a.old_value && a.new_value ? " → " : ""}
                  {a.new_value ?? ""}
                </Td>
                <Td className="text-right">
                  <button
                    onClick={() => removeOne(a)}
                    disabled={busy}
                    title="Xóa dòng này"
                    className="text-rose-400 transition hover:text-rose-600 disabled:opacity-40"
                  >
                    ✕
                  </button>
                </Td>
              </tr>
            ))}
            {rows.length === 0 && <tr><Td className="text-slate-400" colSpan={6}>Chưa có nhật ký.</Td></tr>}
          </tbody>
        </table>
      </div>

      {/* ⚠️ TẠM (demo) — Khu vực nguy hiểm: reset toàn bộ chứng từ. Bỏ khi hết cần demo. */}
      <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-rose-700">⚠️ Khu vực nguy hiểm · reset demo</h4>
            <p className="mt-0.5 text-xs text-rose-600/80">
              Xóa TOÀN BỘ chứng từ (PR/PO/Nhận hàng/Hóa đơn/Thanh toán/Lịch sử/Bình luận/Nhật ký).
              Giữ tài khoản + danh mục. Dùng để làm lại demo từ đầu — <b>không hoàn tác được</b>.
            </p>
          </div>
          <button
            onClick={clearHistory}
            disabled={busy}
            className="shrink-0 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
          >
            {busy ? "Đang xóa…" : "Xóa toàn bộ lịch sử"}
          </button>
        </div>
      </div>
    </Card>
  );
}
