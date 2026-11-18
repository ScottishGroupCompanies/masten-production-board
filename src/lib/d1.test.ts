import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { assertProductionConfig, d1Config, isD1Database, isRemoteDatabase } from "./config";
import { migrationStatements } from "./db";
import {
  D1_MAX_BOUND_PARAMETERS,
  D1_MAX_SQL_BYTES,
  createD1Client,
  d1Endpoint,
  d1RequestBody,
  parseD1Response,
  splitSqlScript,
} from "./d1";

const ENV_KEYS = [
  "NODE_ENV",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_D1_DATABASE_ID",
  "CLOUDFLARE_D1_API_TOKEN",
  "DATABASE_URL",
  "DATABASE_AUTH_TOKEN",
  "TURSO_AUTH_TOKEN",
  "BLOB_READ_WRITE_TOKEN",
  "INTAKE_API_KEY",
  "SESSION_SECRET",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
  "ADMIN_NAME",
] as const;

const env = process.env as Record<string, string | undefined>;
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
});

function clearDatabaseEnv() {
  for (const key of ENV_KEYS) delete env[key];
}

function productionSecrets() {
  env.NODE_ENV = "production";
  env.BLOB_READ_WRITE_TOKEN = "blob-token";
  env.INTAKE_API_KEY = "intake-key";
  env.SESSION_SECRET = "s".repeat(32);
  env.ADMIN_EMAIL = "admin@masten.test";
  env.ADMIN_PASSWORD = "test-password";
}

type Call = { url: string; body: unknown; authorization: string | null };

function recordedFetch() {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    const raw = typeof init?.body === "string" ? init.body : "";
    calls.push({
      url: String(input),
      body: raw ? (JSON.parse(raw) as unknown) : null,
      authorization: headers.get("authorization"),
    });
    const url = String(input);
    const payload = url.endsWith("/query")
      ? {
          success: true,
          errors: [],
          messages: [],
          result: [{ success: true, results: [{ id: "row-1", n: 2 }], meta: { changes: 0 } }],
        }
      : {
          success: true,
          errors: [],
          messages: [],
          result: [{ success: true, results: { columns: [], rows: [] }, meta: { changes: 1 } }],
        };
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  return { calls, fetchImpl };
}

function client(fetchImpl: typeof fetch) {
  return createD1Client({
    accountId: "account",
    databaseId: "database",
    apiToken: "secret-token",
    fetch: fetchImpl,
  });
}

describe("D1 HTTP adapter", () => {
  test("builds the query and raw URLs", () => {
    assert.equal(
      d1Endpoint("acc/id", "db id", "query"),
      "https://api.cloudflare.com/client/v4/accounts/acc%2Fid/d1/database/db%20id/query",
    );
    assert.equal(
      d1Endpoint("account", "database", "raw"),
      "https://api.cloudflare.com/client/v4/accounts/account/d1/database/database/raw",
    );
  });

  test("sends one statement as an object and several as a batch array", () => {
    assert.deepEqual(d1RequestBody([{ sql: "select ?", params: [1] }]), { sql: "select ?", params: [1] });
    assert.deepEqual(
      d1RequestBody([
        { sql: "insert into t values (?)", params: ["a"] },
        { sql: "update t set n = ?", params: [2] },
      ]),
      {
        batch: [
          { sql: "insert into t values (?)", params: ["a"] },
          { sql: "update t set n = ?", params: [2] },
        ],
      },
    );
  });

  test("splits a script on semicolons and keeps semicolons inside quotes", () => {
    assert.deepEqual(splitSqlScript("select 1; select 'a;b'; select \"c;d\"; select 'it''s';"), [
      "select 1",
      "select 'a;b'",
      'select "c;d"',
      "select 'it''s'",
    ]);
  });

  test("parses query rows, raw rows, and SQL errors", () => {
    const queried = parseD1Response(
      { success: true, errors: [], messages: [], result: [{ success: true, results: [{ n: 25 }], meta: {} }] },
      200,
    );
    assert.equal(queried[0]?.rows[0]?.n, 25);

    const raw = parseD1Response(
      {
        success: true,
        errors: [],
        messages: [],
        result: [{ success: true, results: { columns: ["n"], rows: [[25]] }, meta: {} }],
      },
      200,
    );
    assert.equal(raw[0]?.rows[0]?.n, 25);

    assert.throws(
      () =>
        parseD1Response(
          {
            success: false,
            errors: [{ code: 7500, message: "UNIQUE constraint failed: cards.work_order_number, cards.piece_index" }],
            messages: [],
            result: null,
          },
          400,
        ),
      /UNIQUE constraint failed/,
    );
  });

  test("posts reads to /query and writes to /raw with the bearer token", async () => {
    const recorded = recordedFetch();
    const db = client(recorded.fetchImpl);
    const rows = await db.all<{ id: string }>("select id from lists where id = ?", ["row-1"]);
    await db.run("insert into lists (id) values (?)", ["list-1"]);
    assert.equal(rows[0]?.id, "row-1");
    assert.equal(recorded.calls.length, 2);
    assert.equal(recorded.calls[0]?.authorization, "Bearer secret-token");
    assert.match(recorded.calls[0]?.url ?? "", /\/query$/);
    assert.deepEqual(recorded.calls[0]?.body, { sql: "select id from lists where id = ?", params: ["row-1"] });
    assert.match(recorded.calls[1]?.url ?? "", /\/raw$/);
    assert.deepEqual(recorded.calls[1]?.body, { sql: "insert into lists (id) values (?)", params: ["list-1"] });
  });

  test("sends a migration script as one raw batch", async () => {
    const recorded = recordedFetch();
    await client(recorded.fetchImpl).execScript("create table a (id text); create table b (id text);");
    assert.equal(recorded.calls.length, 1);
    assert.match(recorded.calls[0]?.url ?? "", /\/raw$/);
    assert.deepEqual(recorded.calls[0]?.body, {
      batch: [{ sql: "create table a (id text)", params: [] }, { sql: "create table b (id text)", params: [] }],
    });
  });

  test("commits transaction writes as one batch and skips the call when the callback throws", async () => {
    const recorded = recordedFetch();
    const db = client(recorded.fetchImpl);
    const value = await db.transaction(async (tx) => {
      await tx.run("insert into t values (?)", [1]);
      await tx.run("insert into t values (?)", [2]);
      await tx.run("update t set n = ?", [3]);
      return "ok";
    });
    assert.equal(value, "ok");
    assert.equal(recorded.calls.length, 1);
    assert.match(recorded.calls[0]?.url ?? "", /\/raw$/);
    const body = recorded.calls[0]?.body as { batch: { sql: string; params: number[] }[] };
    assert.deepEqual(
      body.batch.map((statement) => statement.sql),
      ["insert into t values (?)", "insert into t values (?)", "update t set n = ?"],
    );
    assert.deepEqual(body.batch[0]?.params, [1]);

    const failed = recordedFetch();
    await assert.rejects(
      () =>
        client(failed.fetchImpl).transaction(async (tx) => {
          await tx.run("insert into t values (?)", ["a"]);
          throw new Error("stop");
        }),
      /stop/,
    );
    assert.equal(failed.calls.length, 0);
  });

  test("runs reads before the write batch, and flushes pending writes before a later read", async () => {
    const first = recordedFetch();
    await client(first.fetchImpl).transaction(async (tx) => {
      await tx.all("select id from lists");
      await tx.run("insert into cards (id) values (?)", ["card-1"]);
      await tx.run("insert into notes (id) values (?)", ["note-1"]);
    });
    assert.deepEqual(
      first.calls.map((call) => call.url.split("/").pop()),
      ["query", "raw"],
    );
    const writeBody = first.calls[1]?.body as { batch: unknown[] };
    assert.equal(writeBody.batch.length, 2);

    const second = recordedFetch();
    await client(second.fetchImpl).transaction(async (tx) => {
      await tx.run("insert into t values (?)", [1]);
      await tx.all("select * from t");
      await tx.run("update t set n = ?", [2]);
    });
    assert.deepEqual(
      second.calls.map((call) => call.url.split("/").pop()),
      ["raw", "query", "raw"],
    );
  });

  test("refuses statements over the D1 parameter and SQL size limits before fetch", async () => {
    const recorded = recordedFetch();
    const db = client(recorded.fetchImpl);
    const params = Array.from({ length: D1_MAX_BOUND_PARAMETERS + 1 }, (_, index) => index);
    await assert.rejects(() => db.run(`select ${params.map(() => "?").join(", ")}`, params), /100 bound parameters/);
    await assert.rejects(() => db.run("select 1".padEnd(D1_MAX_SQL_BYTES + 1, " "), []), /bytes of SQL/);
    assert.equal(recorded.calls.length, 0);
  });

  test("returns the D1 error text and leaves the API token out of it", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          success: false,
          errors: [{ code: 7500, message: "UNIQUE constraint failed: cards.work_order_number" }],
          messages: [],
          result: null,
        }),
        { status: 400 },
      );
    await assert.rejects(() => client(fetchImpl).run("insert into cards (id) values (?)", ["x"]), (error: unknown) => {
      const message = String(error);
      assert.match(message, /UNIQUE constraint failed/);
      assert.equal(message.includes("secret-token"), false);
      return true;
    });
  });

  test("splits the startup schema into statements inside D1 limits", () => {
    const statements = migrationStatements();
    assert.ok(statements.length >= 15);
    assert.ok(statements.some((statement) => statement.includes("CREATE TABLE IF NOT EXISTS lists")));
    assert.ok(statements.some((statement) => statement.includes("CREATE TABLE IF NOT EXISTS cards")));
    const partial = statements.find((statement) => statement.includes("cards_wo_piece"));
    assert.ok(partial?.includes("WHERE work_order_number IS NOT NULL"));
    assert.equal(partial?.includes(";"), false);
    for (const statement of statements) {
      assert.ok(new TextEncoder().encode(statement).length <= D1_MAX_SQL_BYTES);
      const placeholders = statement.match(/\?/g)?.length ?? 0;
      assert.ok(placeholders <= D1_MAX_BOUND_PARAMETERS);
    }
  });
});

describe("production database selection", () => {
  test("uses D1 when the three Cloudflare variables are set and does not require DATABASE_URL", () => {
    clearDatabaseEnv();
    productionSecrets();
    process.env.CLOUDFLARE_ACCOUNT_ID = "account";
    process.env.CLOUDFLARE_D1_DATABASE_ID = "database";
    process.env.CLOUDFLARE_D1_API_TOKEN = "token";
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_AUTH_TOKEN;
    assert.deepEqual(d1Config(), { accountId: "account", databaseId: "database", apiToken: "token" });
    assert.equal(isD1Database(), true);
    assert.equal(isRemoteDatabase(), true);
    assert.doesNotThrow(() => assertProductionConfig());
  });

  test("keeps D1 when a local or Turso DATABASE_URL is also present", () => {
    clearDatabaseEnv();
    productionSecrets();
    process.env.CLOUDFLARE_ACCOUNT_ID = "account";
    process.env.CLOUDFLARE_D1_DATABASE_ID = "database";
    process.env.CLOUDFLARE_D1_API_TOKEN = "token";
    process.env.DATABASE_URL = "libsql://example.turso.io";
    delete process.env.DATABASE_AUTH_TOKEN;
    assert.equal(isD1Database(), true);
    assert.doesNotThrow(() => assertProductionConfig());
  });

  test("rejects a partial D1 configuration", () => {
    clearDatabaseEnv();
    process.env.CLOUDFLARE_ACCOUNT_ID = "account";
    assert.throws(() => d1Config(), /CLOUDFLARE_D1_DATABASE_ID/);
  });

  test("still accepts Turso when the D1 variables are unset", () => {
    clearDatabaseEnv();
    productionSecrets();
    process.env.DATABASE_URL = "libsql://example.turso.io";
    assert.throws(() => assertProductionConfig(), /DATABASE_AUTH_TOKEN/);
    process.env.DATABASE_AUTH_TOKEN = "turso-token";
    assert.equal(isD1Database(), false);
    assert.equal(isRemoteDatabase(), true);
    assert.doesNotThrow(() => assertProductionConfig());
  });

  test("requires D1 for a file database in production", () => {
    clearDatabaseEnv();
    productionSecrets();
    process.env.DATABASE_URL = "file:./data/masten.db";
    assert.equal(isRemoteDatabase(), false);
    assert.throws(
      () => assertProductionConfig(),
      /CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, and CLOUDFLARE_D1_API_TOKEN/,
    );
  });
});
