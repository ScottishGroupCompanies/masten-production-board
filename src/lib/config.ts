export const BOT_NAME = "Masten Orders bot";
export const SESSION_COOKIE = "masten_session";

export const DEMO_PASSWORD = process.env.ADMIN_PASSWORD || "FrameShop#1986";
export const DEMO_ADMIN_EMAIL = "avery.chen@masten.test";

export function intakeApiKey(): string {
  const configured = process.env.INTAKE_API_KEY?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") return "";
  return "dev-masten-intake-key";
}

export function sessionSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    "dev-only-masten-session-secret-change-before-deploy-1986"
  );
}

export function databaseUrl(): string {
  return process.env.DATABASE_URL?.trim() || "file:./data/masten.db";
}

export function isRemoteDatabase(url = databaseUrl()): boolean {
  return url.startsWith("libsql://") || url.startsWith("https://");
}
