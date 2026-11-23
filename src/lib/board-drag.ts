export type DragCard = {
  id: string;
  listId: string;
  archived: boolean;
  position: number;
};

export type OrderGroup = { listId: string; cardIds: string[] };

export type MovePlan = {
  destListId: string;
  index: number;
  groups: OrderGroup[];
};

export function openCards<T extends DragCard>(cards: T[], listId: string): T[] {
  return cards
    .filter((card) => card.listId === listId && !card.archived)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

export function listIdFromOver(overId: string, cards: DragCard[]): string | null {
  if (!overId) return null;
  if (overId.startsWith("list:")) {
    const listId = overId.slice(5);
    return listId || null;
  }
  return cards.find((card) => card.id === overId)?.listId ?? null;
}

/** Index among `ids` (the active card already removed) where the pointer should land. */
export function insertionIndex(ids: string[], pointerY: number, midY: (id: string) => number | null): number {
  for (let i = 0; i < ids.length; i++) {
    const mid = midY(ids[i]);
    if (mid == null) continue;
    if (pointerY < mid) return i;
  }
  return ids.length;
}

/** Map a logical insert index onto the rendered column, which may still show the dragged card. */
export function indicatorIndex(renderedIds: string[], activeId: string, logicalIndex: number): number {
  let seen = 0;
  for (let i = 0; i < renderedIds.length; i++) {
    if (renderedIds[i] === activeId) continue;
    if (seen === logicalIndex) return i;
    seen += 1;
  }
  return renderedIds.length;
}

export function planCardMove(args: {
  cards: DragCard[];
  activeId: string;
  overId: string;
  pointerY: number | null;
  midY: (id: string) => number | null;
}): MovePlan | null {
  const active = args.cards.find((card) => card.id === args.activeId);
  if (!active || active.archived) return null;
  const destListId = listIdFromOver(args.overId, args.cards);
  if (!destListId) return null;

  const sourceWithout = openCards(args.cards, active.listId).filter((card) => card.id !== active.id);
  const destBase = active.listId === destListId ? sourceWithout : openCards(args.cards, destListId);
  const destIds = destBase.map((card) => card.id);

  let index: number;
  if (args.pointerY == null) {
    if (args.overId.startsWith("list:") || args.overId === active.id) {
      index = destIds.length;
    } else {
      const overIndex = destIds.indexOf(args.overId);
      index = overIndex >= 0 ? overIndex : destIds.length;
      if (active.listId === destListId) {
        const original = openCards(args.cards, active.listId);
        const from = original.findIndex((card) => card.id === active.id);
        const overInOriginal = original.findIndex((card) => card.id === args.overId);
        if (from >= 0 && overInOriginal > from && overIndex >= 0) index = overIndex + 1;
      }
    }
  } else {
    index = insertionIndex(destIds, args.pointerY, args.midY);
  }

  const nextDest = [...destIds];
  nextDest.splice(index, 0, active.id);
  const groups: OrderGroup[] = [{ listId: destListId, cardIds: nextDest }];
  if (active.listId !== destListId) {
    groups.push({ listId: active.listId, cardIds: sourceWithout.map((card) => card.id) });
  }
  return { destListId, index, groups };
}

/** True when each saved id sequence still appears in that order, allowing cards the server added later. */
export function orderAgrees(cards: DragCard[], groups: OrderGroup[]): boolean {
  return groups.every((group) => {
    const current = openCards(cards, group.listId).map((card) => card.id);
    let index = 0;
    for (const id of current) {
      if (id === group.cardIds[index]) index += 1;
      if (index === group.cardIds.length) return true;
    }
    return index === group.cardIds.length;
  });
}

export function sameOrder(cards: DragCard[], groups: OrderGroup[]): boolean {
  return groups.every((group) => {
    const current = openCards(cards, group.listId).map((card) => card.id);
    return current.length === group.cardIds.length && current.every((id, index) => id === group.cardIds[index]);
  });
}

export function applyOrder<T extends DragCard>(cards: T[], groups: OrderGroup[]): T[] {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const placedIds = new Set<string>();
  const placed: T[] = [];
  for (const group of groups) {
    group.cardIds.forEach((id, position) => {
      const card = byId.get(id);
      if (!card) return;
      placedIds.add(id);
      placed.push({ ...card, listId: group.listId, position: position * 1000 });
    });
  }
  return [...cards.filter((card) => !placedIds.has(card.id)), ...placed];
}
