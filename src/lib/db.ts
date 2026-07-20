import "server-only";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------
// Embedded PostgreSQL (PGlite). A single instance is cached on the Node
// global so it survives Next.js dev hot-reloads. Data is persisted to the
// ./.pglite directory, so demo data outlives a server restart.
// To move to real Supabase/Postgres later, swap this module for a `pg`
// Pool — the query() signature below is intentionally driver-agnostic.
// ---------------------------------------------------------------------

type Row = Record<string, unknown>;

interface DbHandle {
  pg: PGlite;
  ready: Promise<void>;
}

const g = globalThis as unknown as { __pms_db?: DbHandle };

function bootstrap(): DbHandle {
  const pg = new PGlite(path.join(process.cwd(), ".pglite"));
  const ready = (async () => {
    const schema = fs.readFileSync(
      path.join(process.cwd(), "src", "lib", "schema.sql"),
      "utf8"
    );
    await pg.exec(schema);
    // Additive migrations (idempotent) — runs on every startup, before seed.
    const migrations = fs.readFileSync(
      path.join(process.cwd(), "src", "lib", "migrations.sql"),
      "utf8"
    );
    await pg.exec(migrations);
    // Seed only once (guarded inside seed()).
    const { seed, seedMoreData } = await import("./seed");
    await seed(pg);
    // Dữ liệu bổ sung (nhiều NCC/thiết bị/chuỗi mua sắm) — idempotent, thêm 1 lần.
    // Bọc try/catch để một sự cố seed (vd chạy chồng) không làm sập khởi tạo DB.
    try {
      await seedMoreData(pg);
    } catch (e) {
      console.warn("[db] seedMoreData bỏ qua:", e instanceof Error ? e.message : e);
    }
    // MISA là NGUỒN master data: sau seed, đồng bộ (upsert theo mã) để MISA
    // "tiếp quản" danh mục. Best-effort — lỗi mạng MISA không được làm hỏng
    // khởi động. Tắt bằng MISA_AUTO_SYNC=false. Dùng pg.query trực tiếp vì
    // ready chưa resolve (query() sẽ tự chờ ready -> deadlock).
    if (process.env.MISA_AUTO_SYNC !== "false") {
      try {
        const { syncMisaMasterData } = await import("./misa/sync");
        const run = async (sql: string, params: unknown[] = []) =>
          (await pg.query(sql, params)).rows as Record<string, unknown>[];
        const res = await syncMisaMasterData(run);
        console.log(`[MISA] đồng bộ master data (${res.mode}): ${res.total} bản ghi`, res.counts);
      } catch (err) {
        console.error("[MISA] đồng bộ khi khởi động thất bại (bỏ qua):", err);
      }
    }
  })();
  return { pg, ready };
}

function handle(): DbHandle {
  if (!g.__pms_db) g.__pms_db = bootstrap();
  return g.__pms_db;
}

/** Run a parameterized query and return typed rows. */
export async function query<T = Row>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const h = handle();
  await h.ready;
  const res = await h.pg.query<T>(sql, params);
  return res.rows;
}

/** Run a query and return the first row (or null). */
export async function queryOne<T = Row>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** Execute raw SQL (no params) — for multi-statement scripts. */
export async function exec(sql: string): Promise<void> {
  const h = handle();
  await h.ready;
  await h.pg.exec(sql);
}

// ---------------------------------------------------------------------
// Transactions. A driver-agnostic executor is passed to the callback so
// business helpers can run either inside a transaction or standalone.
// ---------------------------------------------------------------------
export type Executor = <T = Row>(sql: string, params?: unknown[]) => Promise<T[]>;

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
  const h = handle();
  await h.ready;
  return h.pg.transaction(async (tx) => {
    const exec: Executor = async (sql, params = []) => (await tx.query(sql, params)).rows as never;
    return cb(exec);
  }) as Promise<T>;
}
