import { authorizeIntake, intakeError } from "@/lib/http";
import { moveOrder } from "@/lib/intake";
import { ensureDatabase } from "@/lib/seed";

export async function POST(request: Request, context: { params: Promise<{ workOrder: string }> }) {
  const denied = authorizeIntake(request);
  if (denied) return denied;
  try {
    await ensureDatabase();
    const { workOrder } = await context.params;
    const body = await request.json();
    return Response.json(await moveOrder(decodeURIComponent(workOrder), body));
  } catch (error) {
    return intakeError(error);
  }
}
