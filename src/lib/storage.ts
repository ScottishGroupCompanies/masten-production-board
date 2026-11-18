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

export async function saveUpload(storageKey: string, data: Buffer): Promise<void> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    await put(storageKey, data, {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      allowOverwrite: true,
    });
  }
  try {
    const file = fullPath(storageKey);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data);
  } catch (error) {
    if (!process.env.BLOB_READ_WRITE_TOKEN) throw error;
  }
}

export async function readUpload(storageKey: string): Promise<Buffer> {
  try {
    return await fs.readFile(fullPath(storageKey));
  } catch (error) {
    if (!process.env.BLOB_READ_WRITE_TOKEN) throw error;
    const { list } = await import("@vercel/blob");
    const found = await list({ prefix: storageKey, token: process.env.BLOB_READ_WRITE_TOKEN });
    const url = found.blobs.find((blob) => blob.pathname === storageKey)?.url;
    if (!url) throw error;
    const response = await fetch(url);
    if (!response.ok) throw error;
    return Buffer.from(await response.arrayBuffer());
  }
}

export async function removeUpload(storageKey: string): Promise<void> {
  await fs.rm(fullPath(storageKey), { force: true });
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { del, list } = await import("@vercel/blob");
      const found = await list({ prefix: storageKey, token: process.env.BLOB_READ_WRITE_TOKEN });
      const url = found.blobs.find((blob) => blob.pathname === storageKey)?.url;
      if (url) await del(url, { token: process.env.BLOB_READ_WRITE_TOKEN });
    } catch {
      // Local copy is the source of truth when Blob is not configured for this key.
    }
  }
}

export function safeFilename(name: string): string {
  const base = path.basename(name).replace(/[^\w.\- ()]+/g, "_").trim();
  return base.slice(0, 120) || "file";
}
