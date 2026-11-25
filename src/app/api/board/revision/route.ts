import { requireUser } from "@/lib/auth";
import { get } from "@/lib/db";
import { ensureDatabase } from "@/lib/seed";

export async function GET() {
  await ensureDatabase();
  await requireUser();
  const [revisionRow, meta] = await Promise.all([
    get<{ revision: string | null; n: number | bigint }>("select max(updated_at) as revision, count(*) as n from cards"),
    get<{ value: string }>("select value from meta where key = ?", ["board_revision"]),
  ]);
  return Response.json({
    revision: `${revisionRow?.revision ?? ""}:${Number(revisionRow?.n ?? 0)}:${meta?.value ?? ""}`,
  });
}
