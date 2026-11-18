import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CardDetailView } from "@/components/card-detail";
import { requireUser } from "@/lib/auth";
import { getBoard, getCard } from "@/lib/queries";
import { ensureDatabase } from "@/lib/seed";

export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  await ensureDatabase();
  const { id } = await params;
  const user = await requireUser();
  const [card, board] = await Promise.all([getCard(id), getBoard()]);
  if (!card) notFound();
  return (
    <AppShell user={user} active="card">
      <CardDetailView card={card} board={board} />
    </AppShell>
  );
}
