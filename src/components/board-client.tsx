"use client";

import dynamic from "next/dynamic";
import type { BoardData } from "@/lib/board-types";

const BoardView = dynamic(() => import("@/components/board-view").then((mod) => mod.BoardView), {
  ssr: false,
});

export function BoardClient({ data }: { data: BoardData }) {
  return <BoardView data={data} />;
}
