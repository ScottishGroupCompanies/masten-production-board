import { getSession } from "@/lib/session";
import { getAttachment } from "@/lib/queries";
import { readUpload } from "@/lib/storage";
import { ensureDatabase } from "@/lib/seed";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await ensureDatabase();
  const { id } = await context.params;
  const file = await getAttachment(id);
  if (!file) return Response.json({ error: "Not found" }, { status: 404 });
  const bytes = await readUpload(file.storage_key);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": file.mime_type,
      "Content-Disposition": `inline; filename="${file.filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
