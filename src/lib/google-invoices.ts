import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import { parseInvoiceRows, type SheetInvoice } from "./google-sheet-parse";

// =====================================================================
// Kết nối Google Sheet của app thu gom hóa đơn (bạn Kiệt dựng).
// Đọc 2 tab: "Hóa đơn" (header) + "Chi tiết hàng hóa" (dòng hàng) → SheetInvoice[]
// (ghép theo Invoice_ID). Dữ liệu dòng có sẵn trong Sheet nên KHÔNG cần tải XML.
//
// Xác thực SERVICE ACCOUNT (tự ký JWT RS256, không cần cài googleapis). Cấu hình:
//   GOOGLE_SERVICE_ACCOUNT_JSON  — nội dung JSON khóa (khuyên dùng trên Vercel), HOẶC
//   GOOGLE_SA_KEY_PATH           — đường dẫn file .json (local)
//   INVOICE_SHEET_ID             — id spreadsheet
//   INVOICE_SHEET_TAB_HEADER     — tên tab header (mặc định 'Hóa đơn')
//   INVOICE_SHEET_TAB_DETAIL     — tên tab chi tiết (mặc định 'Chi tiết hàng hóa')
// =====================================================================

interface ServiceAccount { client_email: string; private_key: string; token_uri?: string }

function loadServiceAccount(): ServiceAccount {
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const p = process.env.GOOGLE_SA_KEY_PATH;
  let raw: string | null = null;
  if (inline && inline.trim().startsWith("{")) raw = inline;
  else if (p && fs.existsSync(p)) raw = fs.readFileSync(p, "utf8");
  if (!raw)
    throw new Error("Chưa cấu hình khóa Google (GOOGLE_SERVICE_ACCOUNT_JSON hoặc GOOGLE_SA_KEY_PATH).");
  const sa = JSON.parse(raw) as ServiceAccount;
  if (!sa.client_email || !sa.private_key) throw new Error("File khóa Google thiếu client_email/private_key.");
  return sa;
}

const b64url = (b: Buffer | string) =>
  Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const g = globalThis as unknown as { __g_inv_token?: { token: string; exp: number } };

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (g.__g_inv_token && g.__g_inv_token.exp - 60 > now) return g.__g_inv_token.token;
  const sa = loadServiceAccount();
  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const scope = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
  ].join(" ");
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope, aud: tokenUri, iat: now, exp: now + 3600 }));
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const assertion = `${header}.${claim}.${b64url(signer.sign(sa.private_key))}`;
  const res = await fetchRetry(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!res.ok) throw new Error(`Lấy access_token Google thất bại (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  g.__g_inv_token = { token: json.access_token, exp: now + json.expires_in };
  return json.access_token;
}

/** fetch có retry nhẹ (mạng chập chờn / lỗi tạm 5xx). */
async function fetchRetry(url: string, init?: RequestInit, tries = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, init);
      if (res.status >= 500 && i < tries - 1) { await sleep(800 * (i + 1)); continue; }
      return res;
    } catch (e) {
      lastErr = e;
      if (i < tries - 1) await sleep(800 * (i + 1));
    }
  }
  throw lastErr;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function readTab(sheetId: string, token: string, tab: string): Promise<string[][]> {
  const range = encodeURIComponent(`${tab}!A1:BZ`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${range}?majorDimension=ROWS`;
  const res = await fetchRetry(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Đọc tab "${tab}" thất bại (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { values?: string[][] };
  return json.values ?? [];
}

/** Kéo toàn bộ hóa đơn MUA VÀO (kèm dòng hàng) từ Google Sheet. */
export async function fetchPurchaseInvoices(): Promise<SheetInvoice[]> {
  const sheetId = process.env.INVOICE_SHEET_ID;
  if (!sheetId) throw new Error("Chưa đặt INVOICE_SHEET_ID.");
  const tabHeader = process.env.INVOICE_SHEET_TAB_HEADER || "Hóa đơn";
  const tabDetail = process.env.INVOICE_SHEET_TAB_DETAIL || "Chi tiết hàng hóa";
  const token = await getAccessToken();
  const [headerValues, detailValues] = await Promise.all([
    readTab(sheetId, token, tabHeader),
    readTab(sheetId, token, tabDetail),
  ]);
  // COMPANY_TAX_ID = MST công ty mình → chỉ lấy hóa đơn MÌNH là bên mua (Sheet gom
  // hóa đơn của nhiều pháp nhân). Bỏ trống = lấy tất cả HĐ Mua vào (không khuyến nghị).
  const ownTaxId = process.env.COMPANY_TAX_ID || null;
  return parseInvoiceRows(headerValues, detailValues, { onlyPurchase: true, ownTaxId });
}

/** Tải nội dung file XML gốc từ Drive (chỉ khi folder/file đã share cho service
 *  account — hiện có thể chưa). Dùng để đính kèm/lưu vết, KHÔNG bắt buộc cho sync. */
export async function downloadXml(fileId: string): Promise<string> {
  const token = await getAccessToken();
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;
  const res = await fetchRetry(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Tải XML từ Drive thất bại (${res.status}) cho file ${fileId}.`);
  return res.text();
}

/** Đã cấu hình Google chưa? (để UI ẩn/hiện chức năng đồng bộ.) */
export function googleSyncConfigured(): boolean {
  const hasKey =
    (process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim().startsWith("{") ?? false) ||
    (!!process.env.GOOGLE_SA_KEY_PATH && fs.existsSync(process.env.GOOGLE_SA_KEY_PATH));
  return hasKey && !!process.env.INVOICE_SHEET_ID;
}
