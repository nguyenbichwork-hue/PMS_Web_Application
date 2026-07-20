import "server-only";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Pool, types } from "pg";

// ---------------------------------------------------------------------
// Dual-mode database layer.
//   • DATABASE_URL set   -> real PostgreSQL (Supabase) via node-postgres.
//   • DATABASE_URL empty -> embedded PGlite (local, zero-config, persisted
//                           to ./.pglite). This is the original behaviour.
// The exported API — query()/queryOne()/exec()/withTransaction() — is
// IDENTICAL in both modes, so the rest of the app never changes. SQL uses
// $1..$n placeholders, which both engines accept unchanged.
//
// Demo seeding:
//   • PGlite mode  -> always seed (local demo, as before).
//   • Postgres mode -> seed ONLY when DB_SEED=true. So a real Supabase with
//                      real accounts is never polluted with demo/test data.
// ---------------------------------------------------------------------

type Row = Record<string, unknown>;

/** Minimal query surface used by seed()/MISA sync — satisfied by both engines. */
export interface QueryDb {
  query: <T = Row>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
}

export type Executor = <T = Row>(sql: string, params?: unknown[]) => Promise<T[]>;

const DATABASE_URL = process.env.DATABASE_URL;
const USE_PG = !!DATABASE_URL;
// ACCOUNTS_ONLY=true: Supabase chỉ giữ tài khoản (users); toàn bộ nghiệp vụ
// (PR/PO…) vẫn chạy PGlite local. Xem src/lib/accounts.ts.
const ACCOUNTS_ONLY = process.env.ACCOUNTS_ONLY === "true";
const FULL_PG = USE_PG && !ACCOUNTS_ONLY; // toàn bộ DB chạy trên Postgres/Supabase
const SHOULD_SEED = FULL_PG ? process.env.DB_SEED === "true" : true;

interface Driver {
  ready: Promise<void>;
  run: <T = Row>(sql: string, params?: unknown[]) => Promise<T[]>;
  execMulti: (sql: string) => Promise<void>;
  transaction: <T>(cb: (exec: Executor) => Promise<T>) => Promise<T>;
}

// Cached on the Node global so it survives Next.js dev hot-reloads and is
// reused across requests in production.
const g = globalThis as unknown as { __pms_driver?: Driver };

function readSql(file: string): string {
  return fs.readFileSync(path.join(process.cwd(), "src", "lib", file), "utf8");
}

// Shared one-time initialisation: schema + additive migrations (both
// idempotent), then (optionally) guarded demo seed, then best-effort MISA
// master-data sync. Runs against whichever engine is active.
async function initialize(
  db: QueryDb,
  execMulti: (sql: string) => Promise<void>
): Promise<void> {
  await execMulti(readSql("schema.sql"));
  await execMulti(readSql("migrations.sql"));

  if (SHOULD_SEED) {
    const { seed, seedMoreData } = await import("./seed");
    // seed() is guarded (no-op when data exists); wrap so a concurrent
    // cold-start race on a shared DB cannot crash initialisation.
    try {
      await seed(db);
    } catch (e) {
      console.warn("[db] seed bỏ qua:", e instanceof Error ? e.message : e);
    }
    try {
      await seedMoreData(db);
    } catch (e) {
      console.warn("[db] seedMoreData bỏ qua:", e instanceof Error ? e.message : e);
    }
  }

  // Chế độ ACCOUNTS_ONLY: kéo tài khoản từ Supabase (master) vào local để
  // đăng nhập & JOIN nghiệp vụ chạy được trên PGlite. Best-effort.
  if (ACCOUNTS_ONLY) {
    try {
      const { ensureRemoteUsers, pullUsersIntoLocal } = await import("./accounts");
      await ensureRemoteUsers();
      const runLocal = async (sql: string, params: unknown[] = []) =>
        (await db.query(sql, params)).rows as Record<string, unknown>[];
      const n = await pullUsersIntoLocal(runLocal);
      console.log(`[accounts] đồng bộ ${n} tài khoản từ Supabase vào local.`);
    } catch (e) {
      console.error("[accounts] đồng bộ khi khởi động thất bại (bỏ qua):", e);
    }
  }

  // MISA is the master-data source: upsert by code after seeding. Best-effort
  // — a MISA network error must never break startup. Disable with
  // MISA_AUTO_SYNC=false (recommended on Supabase to skip per-cold-start sync).
  if (process.env.MISA_AUTO_SYNC !== "false") {
    try {
      const { syncMisaMasterData } = await import("./misa/sync");
      const run = async (sql: string, params: unknown[] = []) =>
        (await db.query(sql, params)).rows as Record<string, unknown>[];
      const res = await syncMisaMasterData(run);
      console.log(`[MISA] đồng bộ master data (${res.mode}): ${res.total} bản ghi`, res.counts);
    } catch (err) {
      console.error("[MISA] đồng bộ khi khởi động thất bại (bỏ qua):", err);
    }
  }
}

// ---------------------------------------------------------------------
// PostgreSQL (Supabase) driver — node-postgres connection pool.
// ---------------------------------------------------------------------
function bootstrapPg(): Driver {
  // Return int8 (BIGINT) and numeric as JS numbers so row shapes match the
  // PGlite path the app was written against (ids/money are used as numbers).
  types.setTypeParser(20, (v) => (v === null ? null : Number(v))); // int8
  types.setTypeParser(1700, (v) => (v === null ? null : Number(v))); // numeric

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // Supabase requires TLS
    max: Number(process.env.DB_POOL_MAX ?? 5),
  });

  const run: Driver["run"] = async (sql, params = []) =>
    (await pool.query(sql, params as unknown[])).rows as never;

  const execMulti = async (sql: string) => {
    await pool.query(sql); // simple-query protocol runs multi-statement scripts
  };

  const db = { query: (sql: string, params?: unknown[]) => pool.query(sql, params as unknown[]) } as unknown as QueryDb;
  const ready = initialize(db, execMulti);

  const transaction: Driver["transaction"] = async (cb) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const exec: Executor = async (sql, params = []) =>
        (await client.query(sql, params as unknown[])).rows as never;
      const result = await cb(exec);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  };

  return { ready, run, execMulti, transaction };
}

// ---------------------------------------------------------------------
// PGlite driver — embedded Postgres persisted to ./.pglite (local dev).
// ---------------------------------------------------------------------
function bootstrapPglite(): Driver {
  const pg = new PGlite(path.join(process.cwd(), ".pglite"));

  const run: Driver["run"] = async (sql, params = []) =>
    (await pg.query(sql, params as unknown[])).rows as never;

  const execMulti = (sql: string) => pg.exec(sql).then(() => undefined);

  const ready = initialize(pg as unknown as QueryDb, execMulti);

  const transaction: Driver["transaction"] = (cb) =>
    pg.transaction(async (tx) => {
      const exec: Executor = async (sql, params = []) => (await tx.query(sql, params)).rows as never;
      return cb(exec);
    }) as never;

  return { ready, run, execMulti, transaction };
}

function driver(): Driver {
  if (!g.__pms_driver) g.__pms_driver = FULL_PG ? bootstrapPg() : bootstrapPglite();
  return g.__pms_driver;
}

// ---------------------------------------------------------------------
// Public API (unchanged signatures).
// ---------------------------------------------------------------------

/** Run a parameterized query and return typed rows. */
export async function query<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const d = driver();
  await d.ready;
  return d.run<T>(sql, params);
}

/** Run a query and return the first row (or null). */
export async function queryOne<T = Row>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** Execute raw SQL (no params) — for multi-statement scripts. */
export async function exec(sql: string): Promise<void> {
  const d = driver();
  await d.ready;
  await d.execMulti(sql);
}

/** The default (non-transactional) executor. */
export const dbExec: Executor = (sql, params = []) => query(sql, params);

/** First row helper for any executor. */
export async function firstRow<T = Row>(
  exec: Executor,
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await exec<T>(sql, params);
  return rows[0] ?? null;
}

/** Run a callback inside a DB transaction; auto-commit on success, rollback on throw. */
export async function withTransaction<T>(cb: (exec: Executor) => Promise<T>): Promise<T> {
  const d = driver();
  await d.ready;
  return d.transaction(cb);
}
