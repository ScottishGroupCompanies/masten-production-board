import { authorizeIntake, intakeError } from "@/lib/http";
import { syncStock } from "@/lib/intake";
import { ensureDatabase } from "@/lib/seed";

async function update(request: Request) {
  const denied = authorizeIntake(request);
  if (denied) return denied;
  try {
    await ensureDatabase();
    const body = await request.json();
    return Response.json(await syncStock(body));
  } catch (error) {
    return intakeError(error);
  }
}

export const POST = update;
export const PUT = update;
