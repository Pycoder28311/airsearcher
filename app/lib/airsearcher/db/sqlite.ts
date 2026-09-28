/**
 * The local SQLite file that holds what localStorage used to. Server-only.
 *
 * One key–value table mirrors localStorage exactly: the same keys and the same
 * JSON strings, so nothing that reads them had to change. better-sqlite3 is
 * synchronous, which makes every call here a plain function with no
 * interleaving to reason about.
 */

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { STORAGE_DEFAULT_DB_PATH } from "@/lib/airsearcher/config/storage";
import { STORAGE_KEYS, type StorageKey, type StorageValues } from "@/lib/airsearcher/db/keys";

if (typeof window !== "undefined") {
  throw new Error("sqlite.ts is server-only.");
}

type Db = Database.Database;

const SCHEMA_VERSION = 1;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS kv (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS meta (
    name  TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

export function dbPath(): string {
  return path.resolve(process.cwd(), process.env.AIRSEARCH_DB_PATH || STORAGE_DEFAULT_DB_PATH);
}

/** Opens (and if needed creates) a database file with the app's settings. */
export function openDb(file: string): Db {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  // WAL + a busy timeout let the dev server and the check scripts share the
  // file; NORMAL is safe with WAL and only risks the last write on power loss.
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");
  if ((db.pragma("user_version", { simple: true }) as number) < SCHEMA_VERSION) {
    db.exec(SCHEMA);
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  }
  return db;
}

// Kept on globalThis so a dev-server hot reload reuses the one connection.
const globalDb = globalThis as typeof globalThis & { __airsearcherDb?: Db };

function db(): Db {
  return (globalDb.__airsearcherDb ??= openDb(dbPath()));
}

/* ── Operations — each takes the database, so the checks can use a temp one ── */

export function getValues(database: Db = db()): StorageValues {
  const rows = database.prepare("SELECT key, value FROM kv").all() as { key: string; value: string }[];
  const found = new Map(rows.map((row) => [row.key, row.value]));
  return Object.fromEntries(STORAGE_KEYS.map((key) => [key, found.get(key) ?? null])) as StorageValues;
}

/** Saves a value, or removes the key when `value` is null. */
export function setValue(key: StorageKey, value: string | null, database: Db = db()): void {
  if (value === null) {
    database.prepare("DELETE FROM kv WHERE key = ?").run(key);
    return;
  }
  database
    .prepare(
      `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, value, new Date().toISOString());
}

export function isImported(database: Db = db()): boolean {
  return database.prepare("SELECT 1 FROM meta WHERE name = 'imported'").get() !== undefined;
}

/**
 * Copies the browser's old localStorage values in, once: only into a database
 * that has never imported and holds nothing yet, all in one transaction.
 * Returns whether it imported.
 */
export function importOnce(values: Partial<Record<StorageKey, string>>, database: Db = db()): boolean {
  const run = database.transaction(() => {
    if (isImported(database)) return false;
    const count = database.prepare("SELECT COUNT(*) AS n FROM kv").get() as { n: number };
    if (count.n > 0) return false;
    for (const key of STORAGE_KEYS) {
      const value = values[key];
      if (typeof value === "string") setValue(key, value, database);
    }
    database
      .prepare("INSERT INTO meta (name, value) VALUES ('imported', ?)")
      .run(new Date().toISOString());
    return true;
  });
  return run();
}
