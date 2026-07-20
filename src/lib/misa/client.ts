import "server-only";
import { mockDictionary } from "./fixtures";

// ---------------------------------------------------------------------
// Client Open API MISA AMIS Kế toán.
//   - Xác thực:  POST {base}/api/oauth/actopen/connect  -> access_token (hiệu lực ~12h)
//   - Lấy danh mục: POST {base}/apir/sync/actopen/get_dictionary  (header X-MISA-AccessToken)
// Cấu hình qua biến môi trường (.env.local):
//   MISA_BASE_URL         (mặc định https://actapp.misa.vn)
//   MISA_APP_ID
//   MISA_ACCESS_CODE      (client secret / access code do MISA cấp)
//   MISA_ORG_COMPANY_CODE (mã đơn vị)
// Khi CHƯA cấu hình đủ -> chạy ở chế độ MOCK (dùng fixtures) để app vẫn hoạt
// động; toàn bộ đường đi code y hệt production, chỉ khác ranh giới fetch.
// ---------------------------------------------------------------------

export const MISA_DATA_TYPES = {
  ACCOUNT_OBJECT: 1, // Đối tượng: khách hàng / nhà cung cấp
  INVENTORY_ITEM: 2, // Vật tư / hàng hóa
  STOCK: 3,          // Kho
  UNIT: 4,           // Đơn vị tính
  BANK_ACCOUNT: 5,   // Tài khoản ngân hàng
  ORG_UNIT: 6,       // Cơ cấu tổ chức
} as const;

export type MisaDataType = (typeof MISA_DATA_TYPES)[keyof typeof MISA_DATA_TYPES];

export type MisaRecord = Record<string, unknown>;

interface MisaResponse<T = MisaRecord> {
  Success: boolean;
  ErrorMessage?: string;
  Data?: T[];
}

interface MisaConfig {
  baseUrl: string;
  appId: string;
  accessCode: string;
  orgCompanyCode: string;
}

/** Đọc cấu hình MISA từ env; trả về null nếu chưa đủ (=> chế độ mock). */
export function misaConfig(): MisaConfig | null {
  const appId = process.env.MISA_APP_ID?.trim();
  const accessCode = process.env.MISA_ACCESS_CODE?.trim();
  const orgCompanyCode = process.env.MISA_ORG_COMPANY_CODE?.trim();
  if (!appId || !accessCode || !orgCompanyCode) return null;
  return {
    baseUrl: (process.env.MISA_BASE_URL?.trim() || "https://actapp.misa.vn").replace(/\/+$/, ""),
    appId,
    accessCode,
    orgCompanyCode,
  };
}

export function isMisaConfigured(): boolean {
  return misaConfig() !== null;
}

/** true = đang dùng dữ liệu MISA thật; false = fixtures mock. */
export function misaMode(): "live" | "mock" {
  return isMisaConfigured() ? "live" : "mock";
}

// ---- Token cache (sống qua hot-reload nhờ gắn vào global) ----
interface TokenCache {
  token: string;
  expiresAt: number; // epoch ms
}
const g = globalThis as unknown as { __misa_token?: TokenCache };

async function accessToken(cfg: MisaConfig): Promise<string> {
  const cached = g.__misa_token;
  // (Date.now dùng ở runtime request — không phải trong workflow script.)
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;

  const res = await fetch(`${cfg.baseUrl}/api/oauth/actopen/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: cfg.appId,
      access_code: cfg.accessCode,
      org_company_code: cfg.orgCompanyCode,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`MISA connect HTTP ${res.status}`);
  const json = (await res.json()) as MisaResponse<{ access_token: string; expired_time?: string }>;
  if (!json.Success || !json.Data?.[0]?.access_token) {
    throw new Error(`MISA connect thất bại: ${json.ErrorMessage || "no token"}`);
  }
  const token = json.Data[0].access_token;
  const expMs = json.Data[0].expired_time
    ? Date.parse(json.Data[0].expired_time)
    : Date.now() + 11 * 60 * 60 * 1000; // fallback ~11h
  g.__misa_token = { token, expiresAt: Number.isFinite(expMs) ? expMs : Date.now() + 11 * 3600_000 };
  return token;
}

const PAGE = 1000;

/**
 * Lấy TOÀN BỘ bản ghi của một loại danh mục (tự phân trang skip/take).
 * @param lastSyncTime ISO string — chỉ lấy bản ghi thay đổi từ mốc này (đồng bộ tăng dần).
 */
export async function fetchDictionary(
  dataType: MisaDataType,
  lastSyncTime?: string | null
): Promise<MisaRecord[]> {
  const cfg = misaConfig();
  if (!cfg) return mockDictionary(dataType); // chế độ mock

  const token = await accessToken(cfg);
  const out: MisaRecord[] = [];
  for (let skip = 0; ; skip += PAGE) {
    const res = await fetch(`${cfg.baseUrl}/apir/sync/actopen/get_dictionary`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-MISA-AccessToken": token,
      },
      body: JSON.stringify({
        data_type: dataType,
        skip,
        take: PAGE,
        app_id: cfg.appId,
        ...(lastSyncTime ? { last_sync_time: lastSyncTime } : {}),
      }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`MISA get_dictionary(${dataType}) HTTP ${res.status}`);
    const json = (await res.json()) as MisaResponse;
    if (!json.Success) throw new Error(`MISA get_dictionary(${dataType}): ${json.ErrorMessage || "lỗi"}`);
    const batch = json.Data ?? [];
    out.push(...batch);
    if (batch.length < PAGE) break; // hết trang
  }
  return out;
}
