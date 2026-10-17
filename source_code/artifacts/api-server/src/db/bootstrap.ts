import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { rawSql, dbDriver, resolvePgliteDir, resolveDataDir } from "@workspace/db";
import { logger } from "../lib/logger";
import { hashPassword } from "../lib/auth";
// Bundled as text by esbuild (loader: { ".sql": "text" })
import baselineSql from "./baseline.sql";

/**
 * Database bootstrap & versioned migrations.
 *
 * 1. Empty database  -> create the baseline schema, then either import the
 *    initial data file (database/initial-data.sql, a pg_dump export) or seed a
 *    minimal default dataset (settings + primary admin).
 * 2. Every start     -> apply any pending migrations listed in MIGRATIONS
 *    (tracked in the _migrations table). Migrations are idempotent.
 */

interface Migration {
  id: string;
  description: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    id: "001_security_hardening",
    description: "Account lockout columns, wipe plaintext reset passwords, invalidate legacy sessions",
    sql: `
      ALTER TABLE public.users ADD COLUMN IF NOT EXISTS failed_login_count integer NOT NULL DEFAULT 0;
      ALTER TABLE public.users ADD COLUMN IF NOT EXISTS locked_until timestamp without time zone;
      ALTER TABLE public.users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
      ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_changed_at timestamp without time zone;
      -- Reset passwords were previously stored in clear text — remove them.
      UPDATE public.password_reset_requests SET new_password = NULL WHERE new_password IS NOT NULL;
      -- Session tokens are now stored hashed (SHA-256); legacy raw tokens are invalid.
      DELETE FROM public.sessions;
    `,
  },
  {
    id: "002_performance_indexes",
    description: "Indexes for the most frequent lookups",
    sql: `
      CREATE INDEX IF NOT EXISTS bookings_hall_dates_idx ON public.bookings (hall_id, start_date, end_date);
      CREATE INDEX IF NOT EXISTS bookings_user_idx ON public.bookings (user_id);
      CREATE INDEX IF NOT EXISTS bookings_status_idx ON public.bookings (status);
      CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications (user_id, is_read);
      CREATE INDEX IF NOT EXISTS sessions_user_idx ON public.sessions (user_id);
      CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON public.audit_logs (created_at DESC);
      CREATE INDEX IF NOT EXISTS reviews_hall_idx ON public.reviews (hall_id);
      CREATE INDEX IF NOT EXISTS maintenance_hall_idx ON public.maintenance_notes (hall_id);
    `,
  },
  {
    id: "003_waitlist_unique",
    description: "Prevent duplicate waitlist entries",
    sql: `
      DELETE FROM public.waitlist a USING public.waitlist b
        WHERE a.id > b.id AND a.booking_id = b.booking_id AND a.user_id = b.user_id;
      CREATE UNIQUE INDEX IF NOT EXISTS waitlist_booking_user_uq ON public.waitlist (booking_id, user_id);
    `,
  },
  {
    id: "004_features_v2",
    description: "Advanced settings, booking requirements & slip codes, hall assets, maintenance blocking & schedules",
    sql: `
      ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS options jsonb NOT NULL DEFAULT '{}'::jsonb;

      ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS attendees integer;
      ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS requested_items text[] NOT NULL DEFAULT '{}';
      ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS seating_layout text;
      ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS public_code text;
      ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS reminder_sent_for text;
      UPDATE public.bookings SET public_code = substr(md5(random()::text || id::text || clock_timestamp()::text), 1, 12)
        WHERE public_code IS NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS bookings_public_code_uq ON public.bookings (public_code);

      ALTER TABLE public.maintenance_notes ADD COLUMN IF NOT EXISTS title text;
      ALTER TABLE public.maintenance_notes ADD COLUMN IF NOT EXISTS asset_id integer;
      ALTER TABLE public.maintenance_notes ADD COLUMN IF NOT EXISTS schedule_id integer;
      ALTER TABLE public.maintenance_notes ADD COLUMN IF NOT EXISTS blocks_hall boolean NOT NULL DEFAULT false;
      ALTER TABLE public.maintenance_notes ADD COLUMN IF NOT EXISTS block_start_date text;
      ALTER TABLE public.maintenance_notes ADD COLUMN IF NOT EXISTS block_end_date text;
      ALTER TABLE public.maintenance_notes ADD COLUMN IF NOT EXISTS block_start_time text;
      ALTER TABLE public.maintenance_notes ADD COLUMN IF NOT EXISTS block_end_time text;
      ALTER TABLE public.maintenance_notes ADD COLUMN IF NOT EXISTS hall_status_set boolean NOT NULL DEFAULT false;

      CREATE TABLE IF NOT EXISTS public.hall_assets (
        id serial PRIMARY KEY,
        hall_id integer NOT NULL REFERENCES public.halls(id),
        name text NOT NULL,
        category text NOT NULL DEFAULT 'other',
        inventory_no text,
        serial_no text,
        quantity integer NOT NULL DEFAULT 1,
        status text NOT NULL DEFAULT 'working',
        is_requestable boolean NOT NULL DEFAULT true,
        last_checked_at text,
        notes text,
        created_at timestamp without time zone NOT NULL DEFAULT now(),
        updated_at timestamp without time zone NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS hall_assets_hall_idx ON public.hall_assets (hall_id);

      CREATE TABLE IF NOT EXISTS public.maintenance_schedules (
        id serial PRIMARY KEY,
        hall_id integer NOT NULL REFERENCES public.halls(id),
        asset_id integer,
        title text NOT NULL,
        category text NOT NULL DEFAULT 'other',
        interval_days integer NOT NULL,
        next_due_date text NOT NULL,
        lead_days integer NOT NULL DEFAULT 7,
        blocks_hall boolean NOT NULL DEFAULT false,
        block_start_time text,
        block_end_time text,
        is_active boolean NOT NULL DEFAULT true,
        notes text,
        created_at timestamp without time zone NOT NULL DEFAULT now(),
        updated_at timestamp without time zone NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS maintenance_schedules_hall_idx ON public.maintenance_schedules (hall_id);
      CREATE INDEX IF NOT EXISTS maintenance_block_idx ON public.maintenance_notes (hall_id, blocks_hall, status);
    `,
  },
  {
    id: "005_password_policy_6",
    description: "Password policy: minimum 6 characters of any kind",
    sql: `
      ALTER TABLE public.platform_settings ALTER COLUMN password_min_length SET DEFAULT 6;
      UPDATE public.platform_settings SET password_min_length = 6 WHERE password_min_length > 6;
    `,
  },
  {
    id: "006_notification_batches",
    description: "Track manually sent notifications (sender, batch) for the sent-history view",
    sql: `
      ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS batch_id text;
      ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS sent_by integer;
      CREATE INDEX IF NOT EXISTS notifications_batch_idx ON public.notifications (batch_id) WHERE batch_id IS NOT NULL;
    `,
  },
  {
    id: "007_booking_archive",
    description: "Archive for finished/cancelled bookings and the post-booking review invitation flag",
    sql: `
      ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS archived_at timestamp;
      ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS archived_by integer;
      ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS review_prompted boolean NOT NULL DEFAULT false;
      UPDATE public.bookings SET review_prompted = true WHERE status = 'completed';
      CREATE INDEX IF NOT EXISTS bookings_archived_idx ON public.bookings (archived_at);
    `,
  },
];

async function tableExists(name: string): Promise<boolean> {
  const rows = await rawSql.query<{ exists: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1) AS "exists"`,
    [name],
  );
  return !!rows[0]?.exists;
}

/** Decode a value from pg_dump's COPY text format. */
function decodeCopyValue(v: string): string | null {
  if (v === "\\N") return null;
  if (!v.includes("\\")) return v;
  return v.replace(/\\(.)/g, (_m, c: string) => {
    switch (c) {
      case "n": return "\n";
      case "r": return "\r";
      case "t": return "\t";
      case "b": return "\b";
      case "f": return "\f";
      case "v": return "\v";
      case "\\": return "\\";
      default: return c;
    }
  });
}

/** Tables that must never be imported from an export (security). */
const SKIP_IMPORT_TABLES = new Set(["public.sessions", "public.password_reset_requests"]);

async function importDataFile(file: string): Promise<void> {
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  let table = "";
  let columns: string[] = [];
  let inCopy = false;
  let rows = 0;
  const counts: Record<string, number> = {};

  // Dump tables are in alphabetical order — defer FK checks while importing.
  await rawSql.exec("SET session_replication_role = replica");
  try {
    for (const line of lines) {
      if (!inCopy) {
        const m = line.match(/^COPY\s+([^\s(]+)\s*\(([^)]+)\)\s+FROM\s+stdin;/i);
        if (m) {
          inCopy = true;
          table = m[1];
          columns = m[2].split(",").map((c) => c.trim());
        }
        continue;
      }
      if (line === "\\.") {
        inCopy = false;
        continue;
      }
      if (!line.length || SKIP_IMPORT_TABLES.has(table)) continue;
      const values = line.split("\t").map(decodeCopyValue);
      const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
      await rawSql.query(
        `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
        values,
      );
      rows++;
      counts[table] = (counts[table] ?? 0) + 1;
    }
    // Align sequences with imported ids
    const seqs = await rawSql.query<{ table_name: string; seq: string }>(`
      SELECT c.table_name, pg_get_serial_sequence('public.' || c.table_name, 'id') AS seq
      FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.column_name = 'id'`);
    for (const s of seqs) {
      if (!s.seq) continue;
      await rawSql.query(
        `SELECT setval($1, COALESCE((SELECT MAX(id) FROM public.${s.table_name}), 0) + 1, false)`,
        [s.seq],
      );
    }
  } finally {
    await rawSql.exec("SET session_replication_role = DEFAULT");
  }
  logger.info({ rows, counts }, "Initial data imported");
}

async function seedDefaults(): Promise<void> {
  await rawSql.query(
    `INSERT INTO public.platform_settings (company_name, company_name_ar, default_language) VALUES ($1, $2, 'ar')`,
    ["Hall Booking Platform", "منصة حجز القاعات"],
  );
  const initialPassword = process.env.INITIAL_ADMIN_PASSWORD || crypto.randomBytes(9).toString("base64url");
  await rawSql.query(
    `INSERT INTO public.users (username, password_hash, role, department_name, is_primary, is_active, must_change_password)
     VALUES ('admin', $1, 'admin', 'إدارة النظام', true, true, true)`,
    [hashPassword(initialPassword)],
  );
  const credsFile = path.join(resolveDataDir(), "INITIAL_ADMIN_PASSWORD.txt");
  try {
    fs.mkdirSync(path.dirname(credsFile), { recursive: true });
    fs.writeFileSync(
      credsFile,
      `Username: admin\r\nTemporary password: ${initialPassword}\r\nYou will be asked to change it at the first login. Delete this file afterwards.\r\n`,
      "utf8",
    );
  } catch {
    /* ignore */
  }
  logger.warn({ file: credsFile }, "Default admin created — temporary password written to file");
}

export async function bootstrapDatabase(): Promise<void> {
  logger.info({ driver: dbDriver, dataDir: dbDriver === "pglite" ? resolvePgliteDir() : undefined }, "Initialising database");

  if (!(await tableExists("users"))) {
    logger.info("Empty database — creating baseline schema");
    const dataFile = path.resolve(process.env.INITIAL_DATA_FILE || path.join(process.cwd(), "database", "initial-data.sql"));
    // Everything in one transaction: a failed first start leaves the database empty, not half-built.
    await rawSql.exec("BEGIN");
    try {
      await rawSql.exec(baselineSql);
      await runMigrations(true); // before import so new columns get their defaults
      if (fs.existsSync(dataFile) && process.env.SKIP_INITIAL_DATA !== "1") {
        logger.info({ dataFile }, "Importing initial data");
        await importDataFile(dataFile);
        // Imported rows predate the slip-code column and the 6-character password policy.
        await rawSql.exec(`UPDATE public.platform_settings SET password_min_length = 6 WHERE password_min_length > 6`);
        await rawSql.exec(`UPDATE public.bookings SET public_code = substr(md5(random()::text || id::text || clock_timestamp()::text), 1, 12) WHERE public_code IS NULL`);
      } else {
        await seedDefaults();
      }
      await rawSql.exec("COMMIT");
    } catch (err) {
      await rawSql.exec("ROLLBACK");
      throw err;
    }
    return;
  }
  await runMigrations();
}

export async function runMigrations(inTransaction = false): Promise<void> {
  await rawSql.exec(`CREATE TABLE IF NOT EXISTS public._migrations (
    id text PRIMARY KEY,
    description text,
    applied_at timestamp without time zone NOT NULL DEFAULT now()
  )`);
  const applied = new Set(
    (await rawSql.query<{ id: string }>(`SELECT id FROM public._migrations`)).map((r) => r.id),
  );
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    logger.info({ migration: m.id }, m.description);
    if (!inTransaction) await rawSql.exec("BEGIN");
    try {
      await rawSql.exec(m.sql);
      await rawSql.query(`INSERT INTO public._migrations (id, description) VALUES ($1, $2)`, [m.id, m.description]);
      if (!inTransaction) await rawSql.exec("COMMIT");
    } catch (err) {
      if (!inTransaction) await rawSql.exec("ROLLBACK");
      throw err;
    }
  }
}
