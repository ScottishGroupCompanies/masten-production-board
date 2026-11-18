export const BOT_NAME = "Masten Orders bot";
export const SESSION_COOKIE = "masten_session";

const DEV_SESSION_SECRET = "dev-only-masten-session-secret-change-before-deploy-1986";

export type AdminCredentials = {
  email: string;
  password: string;
  name: string;
};

export function adminCredentials(): AdminCredentials {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  const password = process.env.ADMIN_PASSWORD ?? "";
  const name = process.env.ADMIN_NAME?.trim() || "Shop admin";
  if (!email.includes("@")) {
    throw new Error("ADMIN_EMAIL is required. Set it to the shop admin login before starting the board.");
  }
  if (password.length < 8) {
    throw new Error("ADMIN_PASSWORD is required and must be at least 8 characters. It is stored only when the admin user is first created.");
  }
  return { email, password, name };
}

export function intakeApiKey(): string {
  const configured = process.env.INTAKE_API_KEY?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") return "";
  return "dev-masten-intake-key";
}

export function sessionSecret(): string {
  const configured = process.env.SESSION_SECRET?.trim() ?? "";
  if (process.env.NODE_ENV === "production") {
    if (configured.length < 32 || configured === DEV_SESSION_SECRET) {
      throw new Error("SESSION_SECRET must be a random string of at least 32 characters in production.");
    }
    return configured;
  }
  return configured || DEV_SESSION_SECRET;
}

export type D1Config = {
  accountId: string;
  databaseId: string;
  apiToken: string;
};

export function databaseUrl(): string {
  return process.env.DATABASE_URL?.trim() || "file:./data/masten.db";
}

export function databaseAuthToken(): string {
  return process.env.DATABASE_AUTH_TOKEN?.trim() || process.env.TURSO_AUTH_TOKEN?.trim() || "";
}

export function d1Config(): D1Config | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? "";
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID?.trim() ?? "";
  const apiToken = process.env.CLOUDFLARE_D1_API_TOKEN?.trim() ?? "";
  if (accountId && databaseId && apiToken) return { accountId, databaseId, apiToken };
  if (accountId || databaseId || apiToken) {
    throw new Error(
      "CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, and CLOUDFLARE_D1_API_TOKEN must all be set to use Cloudflare D1.",
    );
  }
  return null;
}

export function isD1Database(): boolean {
  return d1Config() !== null;
}

export function isLibsqlDatabase(url = databaseUrl()): boolean {
  if (isD1Database()) return false;
  return url.startsWith("libsql://") || url.startsWith("https://");
}

export function isRemoteDatabase(url = databaseUrl()): boolean {
  return isD1Database() || isLibsqlDatabase(url);
}

export function assertProductionConfig(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (!isD1Database() && isLibsqlDatabase()) {
    if (!databaseAuthToken()) {
      throw new Error("DATABASE_AUTH_TOKEN is required when DATABASE_URL is a Turso libsql:// or https:// URL.");
    }
  }
  if (!isD1Database() && !isLibsqlDatabase()) {
    throw new Error(
      "Set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, and CLOUDFLARE_D1_API_TOKEN for the production D1 database.",
    );
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required in production so attachments go to Vercel Blob.");
  }
  if (!process.env.INTAKE_API_KEY?.trim()) {
    throw new Error("INTAKE_API_KEY is required in production.");
  }
  sessionSecret();
  adminCredentials();
}
