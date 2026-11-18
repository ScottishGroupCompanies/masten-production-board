import fs from "fs";
import path from "path";
import { createClient, type Client, type InValue, type Transaction } from "@libsql/client";
import { databaseUrl, isRemoteDatabase } from "./config";

export type SqlArg = string | number | null;
type Row = Record<string, unknown>;

type Statement = {
  all(...args: SqlArg[]): Row[];
  run(...args: SqlArg[]): unknown;
};

type LocalDatabase = {
  exec(sql: string): void;
  prepare(sql: string): Statement;
};

export type Tx = {
  all<T extends Row = Row>(sql: string, args?: SqlArg[]): Promise<T[]>;
  run(sql: string, args?: SqlArg[]): Promise<void>;
};

let remote: Client | null = null;
let local: LocalDatabase | null = null;
let ready: Promise<void> | null = null;

function localPath(): string {
  const url = databaseUrl();
  const file = url.startsWith("file:") ? url.slice("file:".length) : url;
  return path.isAbsolute(file) ? file : path.join(process.cwd(), file);
}

async function openLocal(): Promise<LocalDatabase> {
  const file = localPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const imported = (await import("node:sqlite")) as {
    DatabaseSync: new (filename: string) => LocalDatabase;
  };
  const db = new imported.DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

function remoteClient(): Client {
  if (!remote) {
    remote = createClient({
      url: databaseUrl(),
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return remote;
}

async function database(): Promise<{ remote: Client | null; local: LocalDatabase | null }> {
  if (isRemoteDatabase()) return { remote: remoteClient(), local: null };
  if (!local) local = await openLocal();
  return { remote: null, local };
}

function argsOf(args?: SqlArg[]): InValue[] {
  return (args ?? []) as InValue[];
}

function plainRows<T extends Row>(rows: T[]): T[] {
  return rows.map((row) => ({ ...row }));
}

export async function all<T extends Row = Row>(sql: string, args: SqlArg[] = []): Promise<T[]> {
  const db = await database();
  if (db.remote) {
    const result = await db.remote.execute({ sql, args: argsOf(args) });
    return plainRows(result.rows as unknown as T[]);
  }
  return plainRows(db.local!.prepare(sql).all(...args) as T[]);
}

export async function get<T extends Row = Row>(sql: string, args: SqlArg[] = []): Promise<T | undefined> {
  const rows = await all<T>(sql, args);
  return rows[0];
}

export async function run(sql: string, args: SqlArg[] = []): Promise<void> {
  const db = await database();
  if (db.remote) {
    await db.remote.execute({ sql, args: argsOf(args) });
    return;
  }
  db.local!.prepare(sql).run(...args);
}

export async function execScript(sql: string): Promise<void> {
  const db = await database();
  if (db.remote) {
    await db.remote.executeMultiple(sql);
    return;
  }
  db.local!.exec(sql);
}

export async function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const db = await database();
  if (db.remote) {
    const tx: Transaction = await db.remote.transaction("write");
    const wrapped: Tx = {
      async all<T extends Row = Row>(sql: string, args: SqlArg[] = []) {
        const result = await tx.execute({ sql, args: argsOf(args) });
        return plainRows(result.rows as unknown as T[]);
      },
      async run(sql, args = []) {
        await tx.execute({ sql, args: argsOf(args) });
      },
    };
    try {
      const value = await fn(wrapped);
      await tx.commit();
      return value;
    } catch (error) {
      if (!tx.closed) await tx.rollback();
      throw error;
    }
  }

  const handle = db.local!;
  handle.exec("BEGIN");
  const wrapped: Tx = {
    async all<T extends Row = Row>(sql: string, args: SqlArg[] = []) {
      return plainRows(handle.prepare(sql).all(...args) as T[]);
    },
    async run(sql, args = []) {
      handle.prepare(sql).run(...args);
    },
  };
  try {
    const value = await fn(wrapped);
    handle.exec("COMMIT");
    return value;
  } catch (error) {
    handle.exec("ROLLBACK");
    throw error;
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  position INTEGER NOT NULL,
  kind TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS labels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS custom_fields (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS custom_field_options (
  id TEXT PRIMARY KEY,
  field_id TEXT NOT NULL,
  label TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  work_order_number TEXT,
  invoice_number TEXT,
  piece_index INTEGER,
  piece_count INTEGER,
  size TEXT NOT NULL DEFAULT '',
  due_date TEXT,
  start_date TEXT,
  shared_mats TEXT NOT NULL DEFAULT '',
  art_description TEXT NOT NULL DEFAULT '',
  art_location TEXT NOT NULL DEFAULT '',
  art_condition TEXT NOT NULL DEFAULT '',
  connected_orders TEXT NOT NULL DEFAULT '',
  additional_contact TEXT NOT NULL DEFAULT '',
  customer_record_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS cards_wo_piece
  ON cards(work_order_number, piece_index)
  WHERE work_order_number IS NOT NULL;
CREATE TABLE IF NOT EXISTS card_labels (
  card_id TEXT NOT NULL,
  label_id TEXT NOT NULL,
  PRIMARY KEY (card_id, label_id)
);
CREATE TABLE IF NOT EXISTS card_assignees (
  card_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (card_id, user_id)
);
CREATE TABLE IF NOT EXISTS card_field_values (
  card_id TEXT NOT NULL,
  field_id TEXT NOT NULL,
  option_label TEXT NOT NULL,
  PRIMARY KEY (card_id, field_id)
);
CREATE TABLE IF NOT EXISTS material_lines (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  kind TEXT NOT NULL,
  item_code TEXT NOT NULL,
  vendor TEXT NOT NULL DEFAULT '',
  stock_status TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_user_id TEXT,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS checklists (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  title TEXT NOT NULL,
  position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS checklist_items (
  id TEXT PRIMARY KEY,
  checklist_id TEXT NOT NULL,
  text TEXT NOT NULL,
  checked INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  storage_key TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS activity (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  actor_user_id TEXT,
  kind TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cards_list ON cards(list_id, position);
CREATE INDEX IF NOT EXISTS materials_card ON material_lines(card_id, position);
CREATE INDEX IF NOT EXISTS materials_status ON material_lines(stock_status);
CREATE INDEX IF NOT EXISTS activity_card ON activity(card_id, created_at);
CREATE INDEX IF NOT EXISTS notes_card ON notes(card_id, created_at);
`;

export async function migrate(): Promise<void> {
  await execScript(SCHEMA);
}

export function ensureReady(task: () => Promise<void>): Promise<void> {
  if (!ready) {
    ready = task().catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

export function localDatabaseFile(): string {
  return localPath();
}
