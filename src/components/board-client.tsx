"use client";

import dynamic from "next/dynamic";
import type { BoardData } from "@/lib/board-types";

const BoardView = dynamic(() => import("@/components/board-view").then((mod) => mod.BoardView), {
  ssr: false,
});

export function BoardClient({ data, userId, initialCardId = null }: { data: BoardData; userId: string; initialCardId?: string | null }) {
  return <BoardView data={data} userId={userId} initialCardId={initialCardId} />;
}
