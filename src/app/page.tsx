import { AppShell } from "@/components/app-shell";
import { BoardClient } from "@/components/board-client";
import { requireUser } from "@/lib/auth";
import { getBoard } from "@/lib/queries";
import { ensureDatabase } from "@/lib/seed";

export default async function BoardPage({ searchParams }: { searchParams: Promise<{ card?: string }> }) {
  await ensureDatabase();
  const [user, data, params] = await Promise.all([requireUser(), getBoard(), searchParams]);
  return (
    <AppShell user={user} active="board">
      <BoardClient data={data} userId={user.id} initialCardId={params.card ?? null} />
    </AppShell>
  );
}
