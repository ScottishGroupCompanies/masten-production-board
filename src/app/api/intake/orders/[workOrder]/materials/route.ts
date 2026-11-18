import { authorizeIntake, intakeError } from "@/lib/http";
import { stockOrder } from "@/lib/intake";
import { ensureDatabase } from "@/lib/seed";

async function update(request: Request, context: { params: Promise<{ workOrder: string }> }) {
  const denied = authorizeIntake(request);
  if (denied) return denied;
  try {
    await ensureDatabase();
    const { workOrder } = await context.params;
    const body = await request.json();
    return Response.json(await stockOrder(decodeURIComponent(workOrder), body));
  } catch (error) {
    return intakeError(error);
  }
}

export const POST = update;
export const PATCH = update;
