"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveUserAction, saveApprovalRuleAction, deleteApprovalRuleAction, fetchAuditAction } from "@/actions/admin";
import { importExcelAction, type ImportResult } from "@/actions/import";
import { Card, Button, Field, inputCls, StatusBadge, Th, Td } from "@/components/ui";
import { AccentPicker } from "@/components/AccentPicker";
import { Icon } from "@/components/icons";
import { money, date } from "@/lib/format";

interface Rule { id: number; amount_min: number; amount_max: number | null; levels: string[] }
interface UserRow { id: number; name: string; email: string; department: string | null; role: string; company_id: number | null; company_name: string | null; status: string }
interface CompanyRow { id: number; company_code: string; company_name: string; tax_code: string | null; status: string }
interface AuditRow { id: number; actor_name: string | null; action: string; document_type: string; document_id: number | null; field: string | null; old_value: string | null; new_value: string | null; created_at: string }

const TABS = [
  { key: "rules", label: "Luồng duyệt", icon: "flow" },
  { key: "users", label: "Người dùng", icon: "users" },
  { key: "companies", label: "Công ty", icon: "company" },
  { key: "import", label: "Nhập Excel", icon: "import" },
  { key: "theme", label: "Giao diện", icon: "palette" },
  { key: "audit", label: "Nhật ký", icon: "log" },
] as const;

const ROLE_VI: Record<string, string> = { Employee: "Nhân viên", Purchasing: "Mua hàng", Manager: "Quản lý", Finance: "Kế toán", Admin: "Quản trị" };

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-lg font-semibold text-slate-800">{title}</h3>
        {children}
      </div>
    </div>
  );
}

type TabKey = (typeof TABS)[number]["key"];

export function SettingsTabs({ rules, users, companies, audit }: { rules: Rule[]; users: UserRow[]; companies: CompanyRow[]; audit: AuditRow[] }) {
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
              tab === t.key ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Icon name={t.icon} size={16} /> {t.label}
          </button>
        ))}
      </div>

      <div key={tab} className="animate-fade-up [animation-duration:.25s]">
        {tab === "rules" && <RulesPanel rules={rules} />}
        {tab === "users" && <UsersPanel users={users} companies={companies} />}
        {tab === "companies" && <CompaniesPanel companies={companies} />}
        {tab === "import" && <ImportPanel />}
        {tab === "theme" && <AccentPicker />}
        {tab === "audit" && <AuditPanel audit={audit} />}
      </div>
    </div>
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
          <thead><tr><Th>Từ</Th><Th>Đến</Th><Th>Chuỗi duyệt</Th><Th /></tr></thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id}>
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
                  <div className="flex gap-3">
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
        <Modal title={editing === "new" ? "Thêm ngưỡng duyệt" : "Sửa ngưỡng duyệt"} onClose={() => setEditing(null)}>
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

// ---------------- Người dùng ----------------
function UsersPanel({ users, companies }: { users: UserRow[]; companies: CompanyRow[] }) {
  const [editing, setEditing] = useState<UserRow | "new" | null>(null);
  const router = useRouter();

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Người dùng & phân quyền</h3>
        <Button onClick={() => setEditing("new")}>+ Thêm người dùng</Button>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full">
          <thead><tr><Th>Tên</Th><Th>Email</Th><Th>Phòng ban</Th><Th>Vai trò</Th><Th>Công ty</Th><Th>Trạng thái</Th><Th /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <Td className="font-medium">{u.name}</Td>
                <Td className="text-xs">{u.email}</Td>
                <Td>{u.department ?? "—"}</Td>
                <Td><span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{ROLE_VI[u.role] ?? u.role}</span></Td>
                <Td>{u.company_name ?? "—"}</Td>
                <Td><StatusBadge status={u.status} /></Td>
                <Td><button className="text-sm text-brand-600 hover:underline" onClick={() => setEditing(u)}>Sửa</button></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={editing === "new" ? "Thêm người dùng" : "Sửa người dùng"} onClose={() => setEditing(null)}>
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
              <input name="password" type="text" className={inputCls} placeholder="••••••" />
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

// ---------------- Công ty ----------------
function CompaniesPanel({ companies }: { companies: CompanyRow[] }) {
  return (
    <Card className="p-5">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">Pháp nhân (Companies)</h3>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full">
          <thead><tr><Th>Mã</Th><Th>Tên công ty</Th><Th>Mã số thuế</Th><Th>Trạng thái</Th></tr></thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id}>
                <Td className="font-medium">{c.company_code}</Td>
                <Td>{c.company_name}</Td>
                <Td>{c.tax_code ?? "—"}</Td>
                <Td><StatusBadge status={c.status} /></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------------- Nhập Excel ----------------
const ENTITY_LABELS: { key: keyof ImportResult; label: string }[] = [
  { key: "companies", label: "Công ty" },
  { key: "business_units", label: "Phòng ban" },
  { key: "users", label: "Người dùng" },
  { key: "suppliers", label: "Nhà cung cấp" },
  { key: "products", label: "Hàng hóa" },
  { key: "rules", label: "Hạn mức duyệt" },
];

function ImportPanel() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const submit = () => {
    const f = inputRef.current?.files?.[0];
    if (!f) { setResult({ ok: false, error: "Chưa chọn file Excel." }); return; }
    const fd = new FormData();
    fd.append("file", f);
    setResult(null);
    start(async () => {
      const res = await importExcelAction(fd);
      setResult(res);
      if (res.ok) router.refresh();
    });
  };

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-slate-700">Nhập dữ liệu từ file Excel</h3>
      <p className="mt-1 text-xs text-slate-500">
        Chọn file theo mẫu <b>08_Du_Lieu_Can_Chuan_Bi.xlsx</b> (6 sheet: Công ty, Phòng ban, Người dùng,
        Nhà cung cấp, Hàng hóa, Hạn mức duyệt). Trùng mã/email sẽ được <b>cập nhật</b>, không xóa dữ liệu cũ.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
          📎 Chọn file .xlsx
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
          />
        </label>
        {fileName && <span className="max-w-[220px] truncate text-sm text-slate-500">{fileName}</span>}
        <Button onClick={submit} disabled={pending}>
          {pending ? "Đang nhập…" : "Nhập dữ liệu"}
        </Button>
      </div>

      {result && !result.ok && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          ✕ {result.error}
        </div>
      )}

      {result && result.ok && (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            ✓ Nhập thành công. Sheet đọc được: {result.sheetsFound?.join(", ") || "—"}
          </div>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full">
              <thead><tr><Th>Nhóm dữ liệu</Th><Th className="text-right">Thêm mới</Th><Th className="text-right">Cập nhật</Th><Th className="text-right">Bỏ qua</Th></tr></thead>
              <tbody>
                {ENTITY_LABELS.map(({ key, label }) => {
                  const e = result[key] as { added: number; updated: number; skipped: number } | undefined;
                  if (!e) return null;
                  return (
                    <tr key={key} className="hover:bg-slate-50">
                      <Td className="font-medium">{label}</Td>
                      <Td className="text-right text-emerald-700">{e.added}</Td>
                      <Td className="text-right text-indigo-700">{e.updated}</Td>
                      <Td className="text-right text-slate-400">{e.skipped}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {result.warnings && result.warnings.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <div className="mb-1 font-semibold">Ghi chú ({result.warnings.length}):</div>
              <ul className="list-disc space-y-0.5 pl-4">
                {result.warnings.slice(0, 20).map((w, i) => <li key={i}>{w}</li>)}
                {result.warnings.length > 20 && <li>… và {result.warnings.length - 20} dòng khác</li>}
              </ul>
            </div>
          )}
        </div>
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
        </div>
      </div>
      <div className="overflow-auto rounded-lg border border-slate-200">
        <table className="w-full">
          <thead><tr><Th>Thời gian</Th><Th>Người</Th><Th>Hành động</Th><Th>Chứng từ</Th><Th>Thay đổi</Th></tr></thead>
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
              </tr>
            ))}
            {rows.length === 0 && <tr><Td className="text-slate-400" /><Td>Chưa có nhật ký.</Td><Td /><Td /><Td /></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
