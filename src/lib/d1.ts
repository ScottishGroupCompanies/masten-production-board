// Cloudflare D1 over the HTTP API. There is no interactive transaction session.
// Statements that must commit or roll back together are sent as one batch.
// https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/

export type SqlArg = string | number | null;
export type Row = Record<string, unknown>;

export type Tx = {
  all<T extends Row = Row>(sql: string, args?: SqlArg[]): Promise<T[]>;
  run(sql: string, args?: SqlArg[]): Promise<void>;
};

export type D1Statement = {
  sql: string;
  params?: SqlArg[];
};

export const D1_MAX_BOUND_PARAMETERS = 100;
export const D1_MAX_SQL_BYTES = 100_000;

export type D1ParsedStatement = {
  rows: Row[];
  meta?: {
    changes?: number;
    rows_read?: number;
    rows_written?: number;
  };
};

type D1Endpoint = "query" | "raw";

type D1Envelope = {
  success?: boolean;
  errors?: { message?: string }[];
  messages?: { message?: string }[];
  result?: unknown;
};

export function assertD1Limits(sql: string, params: readonly SqlArg[]): void {
  if (params.length > D1_MAX_BOUND_PARAMETERS) {
    throw new Error(
      `D1 allows at most ${D1_MAX_BOUND_PARAMETERS} bound parameters per statement (got ${params.length}).`,
    );
  }
  const bytes = new TextEncoder().encode(sql).length;
  if (bytes > D1_MAX_SQL_BYTES) {
    throw new Error(`D1 allows at most ${D1_MAX_SQL_BYTES} bytes of SQL per statement (got ${bytes}).`);
  }
}

export function d1Endpoint(accountId: string, databaseId: string, endpoint: D1Endpoint): string {
  return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/d1/database/${encodeURIComponent(databaseId)}/${endpoint}`;
}

export function d1RequestBody(statements: D1Statement[]): { sql: string; params: SqlArg[] } | { batch: { sql: string; params: SqlArg[] }[] } {
  const normalized = statements.map((statement) => ({
    sql: statement.sql,
    params: statement.params ?? [],
  }));
  if (normalized.length === 1) return normalized[0];
  return { batch: normalized };
}

export function splitSqlScript(script: string): string[] {
  const statements: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < script.length; index += 1) {
    const char = script[index];
    if (quote) {
      current += char;
      if (char === quote) {
        if (script[index + 1] === quote) {
          current += script[index + 1];
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === ";") {
      const statement = current.trim();
      if (statement) statements.push(statement);
      current = "";
      continue;
    }
    current += char;
  }
  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

export function parseD1Response(payload: unknown, status: number): D1ParsedStatement[] {
  if (!payload || typeof payload !== "object") {
    throw new Error(`D1 query failed (${status}).`);
  }
  const body = payload as D1Envelope;
  if (body.success === false || status >= 400) {
    throw new Error(d1ErrorMessage(body, status));
  }
  const entries = Array.isArray(body.result)
    ? body.result
    : body.result && typeof body.result === "object"
      ? [body.result]
      : [];
  return entries.map((entry) => parseStatement(entry));
}

function d1ErrorMessage(body: D1Envelope, status: number): string {
  const messages = [...(body.errors ?? []), ...(body.messages ?? [])]
    .map((item) => item?.message?.trim())
    .filter((message): message is string => Boolean(message));
  if (messages.length) return messages.join("; ");
  return `D1 query failed (${status}).`;
}

function parseStatement(entry: unknown): D1ParsedStatement {
  if (!entry || typeof entry !== "object") return { rows: [] };
  const item = entry as { success?: boolean; error?: string; results?: unknown; meta?: D1ParsedStatement["meta"] };
  if (item.success === false) {
    throw new Error(item.error || "D1 statement failed.");
  }
  return { rows: rowsOf(item.results), meta: item.meta };
}

function rowsOf(results: unknown): Row[] {
  if (Array.isArray(results)) {
    return results.filter((row): row is Row => Boolean(row) && typeof row === "object").map((row) => ({ ...row }));
  }
  if (!results || typeof results !== "object") return [];
  const raw = results as { columns?: unknown; rows?: unknown };
  if (!Array.isArray(raw.rows)) return [];
  const columns = Array.isArray(raw.columns) ? raw.columns.map((column) => String(column)) : [];
  return raw.rows.map((row) => {
    const values = Array.isArray(row) ? row : [];
    const record: Row = {};
    columns.forEach((column, index) => {
      record[column] = (values[index] ?? null) as Row[string];
    });
    return record;
  });
}

export type D1ClientOptions = {
  accountId: string;
  databaseId: string;
  apiToken: string;
  fetch?: typeof fetch;
};

export type D1Client = {
  all<T extends Row = Row>(sql: string, args?: SqlArg[]): Promise<T[]>;
  run(sql: string, args?: SqlArg[]): Promise<void>;
  execScript(sql: string): Promise<void>;
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
};

export function createD1Client(options: D1ClientOptions): D1Client {
  const fetchImpl = options.fetch ?? fetch;

  async function execute(statements: D1Statement[], endpoint: D1Endpoint): Promise<D1ParsedStatement[]> {
    if (statements.length === 0) return [];
    for (const statement of statements) assertD1Limits(statement.sql, statement.params ?? []);
    const response = await fetchImpl(d1Endpoint(options.accountId, options.databaseId, endpoint), {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${options.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(d1RequestBody(statements)),
    });
    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        throw new Error(`D1 query failed (${response.status}).`);
      }
    }
    return parseD1Response(payload, response.status);
  }

  return {
    async all<T extends Row = Row>(sql: string, args: SqlArg[] = []): Promise<T[]> {
      const [result] = await execute([{ sql, params: args }], "query");
      return (result?.rows ?? []) as T[];
    },
    async run(sql: string, args: SqlArg[] = []): Promise<void> {
      await execute([{ sql, params: args }], "raw");
    },
    async execScript(sql: string): Promise<void> {
      const statements = splitSqlScript(sql).map((statement) => ({ sql: statement }));
      await execute(statements, "raw");
    },
    transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
      return runBatchedTransaction(execute, fn);
    },
  };
}

async function runBatchedTransaction<T>(
  execute: (statements: D1Statement[], endpoint: D1Endpoint) => Promise<D1ParsedStatement[]>,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const pending: D1Statement[] = [];

  async function flush(): Promise<void> {
    if (pending.length === 0) return;
    const batch = pending.splice(0, pending.length);
    await execute(batch, "raw");
  }

  const tx: Tx = {
    async all<T extends Row = Row>(sql: string, args: SqlArg[] = []): Promise<T[]> {
      // A read has to see earlier writes in this transaction. Flushing commits
      // that batch; callers keep reads before writes so the final flush is the
      // only commit.
      await flush();
      const [result] = await execute([{ sql, params: args }], "query");
      return (result?.rows ?? []) as T[];
    },
    async run(sql: string, args: SqlArg[] = []): Promise<void> {
      assertD1Limits(sql, args);
      pending.push({ sql, params: args });
    },
  };

  try {
    const value = await fn(tx);
    await flush();
    return value;
  } catch (error) {
    pending.length = 0;
    throw error;
  }
}
