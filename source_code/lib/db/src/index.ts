import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";

/**
 * Database connection.
 *
 * DB_DRIVER=pglite   (default) — embedded PostgreSQL engine stored on disk in
 *                    PGLITE_DATA_DIR (default: <DATA_DIR>/pglite). No external
 *                    database server is needed — ideal for an internal server.
 * DB_DRIVER=postgres — connect to a real PostgreSQL server via DATABASE_URL.
 */
export type DbDriver = "pglite" | "postgres";

export const dbDriver: DbDriver =
  (process.env.DB_DRIVER ?? "pglite").toLowerCase() === "postgres" ? "postgres" : "pglite";

export function resolveDataDir(): string {
  return path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));
}

export function resolvePgliteDir(): string {
  return path.resolve(process.env.PGLITE_DATA_DIR || path.join(resolveDataDir(), "pglite"));
}

/** Minimal raw-SQL interface used by bootstrap / migrations / backups. */
export interface RawSql {
  /** Write a consistent snapshot of the embedded database (PGlite only). Returns the file path or null. */
  snapshot?(file: string): Promise<string | null>;
  exec(sql: string): Promise<void>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

function init() {
  if (dbDriver === "postgres") {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DB_DRIVER=postgres requires DATABASE_URL to be set.");
    // Timestamps are stored as UTC (drizzle writes Date.toISOString()); keep the DB session in UTC too.
    const pool = new pg.Pool({ connectionString: url, max: 10, options: "-c TimeZone=UTC" });
    const raw: RawSql = {
      async exec(sql) {
        await pool.query(sql);
      },
      async query(sql, params) {
        const r = await pool.query(sql, params as unknown[]);
        return r.rows;
      },
      async close() {
        await pool.end();
      },
    };
    return { db: drizzleNodePg(pool, { schema }), raw };
  }

  const dir = resolvePgliteDir();
  fs.mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  // Queued before any other statement: keep now()/defaults in UTC, matching what drizzle writes.
  void client.exec("SET TIME ZONE 'UTC'");
  const raw: RawSql = {
    async snapshot(file) {
      const blob = await client.dumpDataDir("gzip");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(await blob.arrayBuffer()));
      return file;
    },
    async exec(sql) {
      await client.exec(sql);
    },
    async query(sql, params) {
      const r = await client.query(sql, params as unknown[]);
      return r.rows as never[];
    },
    async close() {
      await client.close();
    },
  };
  return { db: drizzlePglite(client, { schema }), raw };
}

const initialized = init();

// Both drivers expose the same query-builder API; type it as the pglite flavour.
export const db = initialized.db as ReturnType<typeof drizzlePglite<typeof schema>>;
export const rawSql: RawSql = initialized.raw;

export * from "./schema";
