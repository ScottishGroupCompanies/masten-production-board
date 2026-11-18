import { AppShell } from "@/components/app-shell";
import { ToOrderView } from "@/components/to-order-view";
import { requireUser } from "@/lib/auth";
import { getToOrder } from "@/lib/queries";
import { ensureDatabase } from "@/lib/seed";

export default async function ToOrderPage() {
  await ensureDatabase();
  const user = await requireUser();
  const data = await getToOrder();
  return (
    <AppShell user={user} active="order">
      <ToOrderView lines={data.lines} />
    </AppShell>
  );
}
