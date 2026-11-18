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

export function databaseUrl(): string {
  return process.env.DATABASE_URL?.trim() || "file:./data/masten.db";
}

export function databaseAuthToken(): string {
  return process.env.DATABASE_AUTH_TOKEN?.trim() || process.env.TURSO_AUTH_TOKEN?.trim() || "";
}

export function isRemoteDatabase(url = databaseUrl()): boolean {
  return url.startsWith("libsql://") || url.startsWith("https://");
}

export function assertProductionConfig(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (!isRemoteDatabase()) {
    throw new Error("DATABASE_URL must be a Turso libsql:// or https:// URL in production.");
  }
  if (!databaseAuthToken()) {
    throw new Error("DATABASE_AUTH_TOKEN is required in production.");
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
