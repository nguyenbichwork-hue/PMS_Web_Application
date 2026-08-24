// Doi ngay hoa don DEMO sang nam 2026, giai deu qua 12 thang (cho Dashboard thue).
// - CHI dong toi cac hoa don co invoice_date KHONG thuoc 2026 (hoac NULL).
// - Giu thu tu theo id; thang = (thu tu % 12) + 1; ngay = ngay cu kep ve 1..28.
// - In tom tat TRUOC & SAU de kiem chung. Chay lai nhieu lan van an toan (idempotent:
//   sau lan dau moi hoa don da thanh 2026 nen khong con doi tuong de sua).
//
// Chay:  node scripts/redate-invoices-2026.mjs
// (Tuy chon xem thu, khong ghi:  node scripts/redate-invoices-2026.mjs --dry)
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

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

const DRY = process.argv.includes("--dry");
const url = process.env.BUSINESS_DATABASE_URL || process.env.DATABASE_URL;
if (!url) { console.error("✗ Thieu BUSINESS_DATABASE_URL trong .env.local"); process.exit(1); }

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function summary(label) {
  const { rows } = await client.query(
    `SELECT to_char(invoice_date,'YYYY') y, count(*)::int n
       FROM invoices GROUP BY 1 ORDER BY 1 DESC`
  );
  console.log(`\n== ${label}: hoa don theo nam ==`);
  if (rows.length === 0) console.log("  (khong co hoa don nao)");
  for (const r of rows) console.log(`  ${r.y ?? "NULL"}: ${r.n} hoa don`);
}

try {
  await client.connect();
  await summary("TRUOC");

  // Cac hoa don can doi = khong thuoc 2026.
  const { rows: todo } = await client.query(
    `SELECT count(*)::int n FROM invoices
      WHERE invoice_date IS NULL OR EXTRACT(YEAR FROM invoice_date) <> 2026`
  );
  console.log(`\n→ Se doi ${todo[0].n} hoa don sang nam 2026 (giai deu 12 thang).`);

  if (DRY) {
    console.log("\n(--dry) Khong ghi gi. Bo --dry de thuc thi.");
  } else if (todo[0].n > 0) {
    const res = await client.query(
      `WITH old AS (
         SELECT id,
                (row_number() OVER (ORDER BY id) - 1) AS rn,
                COALESCE(EXTRACT(DAY FROM invoice_date)::int, 1) AS d
           FROM invoices
          WHERE invoice_date IS NULL OR EXTRACT(YEAR FROM invoice_date) <> 2026
       )
       UPDATE invoices i
          SET invoice_date = make_date(2026, ((old.rn % 12)::int) + 1, LEAST(GREATEST(old.d, 1), 28))
         FROM old
        WHERE i.id = old.id`
    );
    console.log(`✓ Da cap nhat ${res.rowCount} hoa don.`);
  } else {
    console.log("✓ Khong co hoa don nao can doi (tat ca da la 2026).");
  }

  await summary("SAU");
} catch (e) {
  console.error("✗ Loi:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
