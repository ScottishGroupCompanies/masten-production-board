import { authorizeIntake, intakeError } from "@/lib/http";
import { readOrder } from "@/lib/intake";
import { ensureDatabase } from "@/lib/seed";

export async function GET(request: Request, context: { params: Promise<{ workOrder: string }> }) {
  const denied = authorizeIntake(request);
  if (denied) return denied;
  try {
    await ensureDatabase();
    const { workOrder } = await context.params;
    return Response.json(await readOrder(decodeURIComponent(workOrder)));
  } catch (error) {
    return intakeError(error);
  }
}
