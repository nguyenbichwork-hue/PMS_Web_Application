// Import master data (Nha cung cap + San pham) tu file Excel cua sep vao DB
// nghiep vu (Neon qua BUSINESS_DATABASE_URL, hoac DATABASE_URL). AN TOAN:
//   - Mac dinh DRY-RUN (chi doc + bao cao, KHONG ghi). Them --commit de ghi that.
//   - Idempotent: INSERT ... WHERE NOT EXISTS => chay lai khong nhan doi.
//   - Khu trung theo MST (NCC) va Ma model (san pham). supplier_code = MST
//     (dung quy uoc production hien co). Bo qua NCC khong co MST.
//
// Chay:
//   node scripts/import-master-data.mjs                # dry-run tat ca
//   node scripts/import-master-data.mjs --only=ncc     # chi NCC
//   node scripts/import-master-data.mjs --commit       # GHI THAT
//   node scripts/import-master-data.mjs --file="C:/duong-dan/khac.xlsx"
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import ExcelJS from "exceljs";

// ---- args ----
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (k, d) => { const a = args.find(x => x.startsWith(k + "=")); return a ? a.slice(k.length + 1) : d; };
const COMMIT = has("--commit");
const ONLY = val("--only", "all"); // all | ncc | products
const XLSX = val("--file", "C:/Users/84399/Downloads/master_data_ten_ma_model.xlsx");

// ---- env ----
function loadEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
loadEnvLocal();
const URL = process.env.BUSINESS_DATABASE_URL || process.env.DATABASE_URL;
if (!URL) { console.error("✗ Thieu BUSINESS_DATABASE_URL (hoac DATABASE_URL) trong .env.local"); process.exit(1); }

const norm = (s) => (s ?? "").toString().replace(/\s+/g, "").trim();
const cellText = (cell) => {
  const v = cell?.value;
  if (v == null) return "";
  if (typeof v === "object") return (v.text ?? v.result ?? cell.text ?? "").toString();
  return v.toString();
};

// ---- doc Excel ----
async function readExcel() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX);
  // NCC: Sheet1 [Ten NCC, Dia chi, MST/CCCD]
  const wsN = wb.getWorksheet("Sheet1");
  const ncc = [];
  wsN.eachRow((row, i) => {
    if (i === 1) return;
    const name = cellText(row.getCell(1)).trim();
    const addr = cellText(row.getCell(2)).trim();
    const tax = norm(cellText(row.getCell(3)));
    if (!name && !tax) return;
    ncc.push({ name, addr, tax });
  });
  // San pham: Master_Clean [Ten chuan de xuat, Ma model, (rong), BU]
  const wsP = wb.getWorksheet("Master_Clean");
  const prod = [];
  wsP.eachRow((row, i) => {
    if (i === 1) return;
    const name = cellText(row.getCell(1)).trim();
    const model = norm(cellText(row.getCell(2)));
    if (!name && !model) return;
    prod.push({ name, model });
  });
  return { ncc, prod };
}

async function main() {
  const { ncc, prod } = await readExcel();
  const client = new pg.Client({ connectionString: URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const report = [];
  const log = (s) => { console.log(s); report.push(s); };
  log(`Mode: ${COMMIT ? "*** COMMIT (GHI THAT) ***" : "DRY-RUN (chi doc)"} | only=${ONLY}`);
  log(`File: ${XLSX}`);
  log(`Host: ${(URL.match(/@([^/]+)/) || [])[1] || "?"}\n`);

  let insSup = 0, insProd = 0;
  try {
    if (COMMIT) await client.query("BEGIN");

    // ===== NCC =====
    if (ONLY === "all" || ONLY === "ncc") {
      const withTax = ncc.filter(x => x.tax);
      const noTax = ncc.filter(x => !x.tax);
      // dedup theo MST, giu dong dau tien
      const byTax = new Map();
      for (const r of withTax) if (!byTax.has(r.tax)) byTax.set(r.tax, r);

      const ex = await client.query("select supplier_code, tax_code from suppliers");
      const have = new Set();
      for (const r of ex.rows) { if (r.tax_code) have.add(norm(r.tax_code)); if (r.supplier_code) have.add(norm(r.supplier_code)); }

      const toInsert = [...byTax.values()].filter(r => !have.has(r.tax));
      log("===== NCC =====");
      log(`  File: ${ncc.length} dong | co MST ${withTax.length} | bo qua (khong MST) ${noTax.length}`);
      log(`  MST rieng biet: ${byTax.size} | da co ${byTax.size - toInsert.length} | MOI ${toInsert.length}`);

      for (const r of toInsert) {
        if (COMMIT) {
          const res = await client.query(
            `insert into suppliers (supplier_code, supplier_name, tax_code, address, currency, status, payment_term, source, debt, created_at)
             select $1,$2,$1,$3,'VND','Active','NET30','local',0, now()
             where not exists (select 1 from suppliers where supplier_code=$1 or tax_code=$1)`,
            [r.tax, r.name, r.addr || null]
          );
          insSup += res.rowCount;
        }
      }
      log(`  Vi du se them: ${toInsert.slice(0, 5).map(r => r.tax + " " + r.name.slice(0, 30)).join(" | ")}`);
      if (COMMIT) log(`  >> DA CHEN: ${insSup} NCC`);
      log("");
    }

    // ===== SAN PHAM =====
    if (ONLY === "all" || ONLY === "products") {
      const byModel = new Map();
      for (const r of prod) if (r.model && !byModel.has(r.model)) byModel.set(r.model, r);

      const ex = await client.query("select item_code from products");
      const have = new Set(ex.rows.map(r => norm(r.item_code)).filter(Boolean));
      const toInsert = [...byModel.values()].filter(r => !have.has(r.model));

      log("===== SAN PHAM =====");
      log(`  File: ${prod.length} dong | model rieng biet ${byModel.size} | da co ${byModel.size - toInsert.length} | MOI ${toInsert.length}`);
      for (const r of toInsert) {
        if (COMMIT) {
          const res = await client.query(
            `insert into products (item_code, item_name, unit, vat_rate, status, source, created_at)
             select $1,$2,'Cái',10,'Active','local', now()
             where not exists (select 1 from products where item_code=$1)`,
            [r.model, r.name]
          );
          insProd += res.rowCount;
        }
      }
      log(`  Vi du se them: ${toInsert.slice(0, 5).map(r => r.model + " " + r.name.slice(0, 30)).join(" | ")}`);
      if (COMMIT) log(`  >> DA CHEN: ${insProd} san pham`);
      log("");
    }

    if (COMMIT) { await client.query("COMMIT"); log(`✔ COMMIT xong. Tong: +${insSup} NCC, +${insProd} SP`); }
    else log("DRY-RUN — chua ghi gi. Them --commit de ghi that.");
  } catch (e) {
    if (COMMIT) await client.query("ROLLBACK").catch(() => {});
    console.error("✗ LOI (da ROLLBACK):", e.message);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}
main();
