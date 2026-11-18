import { authorizeIntake, intakeError } from "@/lib/http";
import { upsertOrder } from "@/lib/intake";
import { ensureDatabase } from "@/lib/seed";

async function upsert(request: Request) {
  const denied = authorizeIntake(request);
  if (denied) return denied;
  try {
    await ensureDatabase();
    const body = await request.json();
    const result = await upsertOrder(body);
    return Response.json(result);
  } catch (error) {
    return intakeError(error);
  }
}

export const PUT = upsert;
export const POST = upsert;
