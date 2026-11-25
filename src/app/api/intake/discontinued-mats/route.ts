import { authorizeIntake, intakeError } from "@/lib/http";
import { deleteDiscontinuedMats, readDiscontinuedMats, writeDiscontinuedMats } from "@/lib/intake";
import { ensureDatabase } from "@/lib/seed";

async function guarded(request: Request, work: () => Promise<unknown>) {
  const denied = authorizeIntake(request);
  if (denied) return denied;
  try {
    await ensureDatabase();
    return Response.json(await work());
  } catch (error) {
    return intakeError(error);
  }
}

export function GET(request: Request) {
  return guarded(request, () => readDiscontinuedMats());
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);
  return guarded(request, () => writeDiscontinuedMats(body));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  return guarded(request, () => writeDiscontinuedMats(body));
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null);
  return guarded(request, () => deleteDiscontinuedMats(body));
}
