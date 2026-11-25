import { AppShell } from "@/components/app-shell";
import { DiscontinuedManager } from "@/components/discontinued-manager";
import { requireAdmin } from "@/lib/auth";
import { listDiscontinued } from "@/lib/discontinued";
import { ensureDatabase } from "@/lib/seed";

export const metadata = { title: "Discontinued mats · Masten Production Board" };

export default async function DiscontinuedPage() {
  await ensureDatabase();
  const user = await requireAdmin();
  const codes = await listDiscontinued();
  return (
    <AppShell user={user} active="discontinued">
      <div className="h-full overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
          <div>
            <h1 className="text-3xl font-semibold leading-snug">Discontinued mats</h1>
            <p className="mt-1 max-w-2xl text-base leading-relaxed text-muted-foreground">
              These mat codes can only be used from stock already on hand. A code matches with or without the trailing D.
              If it is not in stock, the card is flagged and it never appears in To order.
            </p>
          </div>
          <DiscontinuedManager codes={codes} />
        </div>
      </div>
    </AppShell>
  );
}
