import { authorizeIntake, intakeError } from "@/lib/http";
import { attachOrder } from "@/lib/intake";
import { safeFilename } from "@/lib/storage";
import { ensureDatabase } from "@/lib/seed";

export async function POST(request: Request, context: { params: Promise<{ workOrder: string }> }) {
  const denied = authorizeIntake(request);
  if (denied) return denied;
  try {
    await ensureDatabase();
    const { workOrder } = await context.params;
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Attach a file in the file field." }, { status: 400 });
    }
    const pieceRaw = form.get("pieceIndex");
    const pieceIndex = typeof pieceRaw === "string" && pieceRaw ? Number(pieceRaw) : undefined;
    const named = form.get("filename");
    const filename = safeFilename(typeof named === "string" && named ? named : file.name);
    const result = await attachOrder(decodeURIComponent(workOrder), Number.isFinite(pieceIndex) ? pieceIndex : undefined, {
      filename,
      mimeType: file.type || "application/octet-stream",
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    return Response.json(result);
  } catch (error) {
    return intakeError(error);
  }
}
