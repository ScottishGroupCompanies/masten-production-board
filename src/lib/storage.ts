import fs from "fs/promises";
import path from "path";

const root = path.join(process.cwd(), "data", "uploads");

function fullPath(storageKey: string): string {
  const resolved = path.resolve(root, storageKey);
  if (!resolved.startsWith(path.resolve(root) + path.sep) && resolved !== path.resolve(root)) {
    throw new Error("Invalid storage key");
  }
  return resolved;
}

function blobToken(): string {
  return process.env.BLOB_READ_WRITE_TOKEN?.trim() ?? "";
}

function requireBlobInProduction(): void {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PHASE !== "phase-production-build" &&
    !blobToken()
  ) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required in production so attachments are stored in Vercel Blob.");
  }
}

export async function saveUpload(storageKey: string, data: Buffer): Promise<void> {
  requireBlobInProduction();
  if (blobToken()) {
    const { put } = await import("@vercel/blob");
    await put(storageKey, data, {
      access: "public",
      token: blobToken(),
      allowOverwrite: true,
    });
  }
  try {
    const file = fullPath(storageKey);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data);
  } catch (error) {
    if (!blobToken()) throw error;
  }
}

export async function readUpload(storageKey: string): Promise<Buffer> {
  requireBlobInProduction();
  try {
    return await fs.readFile(fullPath(storageKey));
  } catch (error) {
    if (!blobToken()) throw error;
    const { list } = await import("@vercel/blob");
    const found = await list({ prefix: storageKey, token: blobToken() });
    const url = found.blobs.find((blob) => blob.pathname === storageKey)?.url;
    if (!url) throw error;
    const response = await fetch(url);
    if (!response.ok) throw error;
    return Buffer.from(await response.arrayBuffer());
  }
}

export async function removeUpload(storageKey: string): Promise<void> {
  const file = fullPath(storageKey);
  await fs.rm(file, { force: true });
  await fs.rmdir(path.dirname(file)).catch(() => undefined);
  if (blobToken()) {
    try {
      const { del, list } = await import("@vercel/blob");
      const found = await list({ prefix: storageKey, token: blobToken() });
      const url = found.blobs.find((blob) => blob.pathname === storageKey)?.url;
      if (url) await del(url, { token: blobToken() });
    } catch {
      // Local copy is the source of truth when Blob is not configured for this key.
    }
  }
}

export function safeFilename(name: string): string {
  const base = path.basename(name).replace(/[^\w.\- ()]+/g, "_").trim();
  return base.slice(0, 120) || "file";
}
