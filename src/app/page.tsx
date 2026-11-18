import { AppShell } from "@/components/app-shell";
import { BoardView } from "@/components/board-view";
import { requireUser } from "@/lib/auth";
import { getBoard } from "@/lib/queries";
import { ensureDatabase } from "@/lib/seed";

export default async function BoardPage() {
  await ensureDatabase();
  const user = await requireUser();
  const data = await getBoard();
  return (
    <AppShell user={user} active="board">
      <BoardView data={data} />
    </AppShell>
  );
}
