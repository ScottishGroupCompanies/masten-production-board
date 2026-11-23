import assert from "node:assert/strict";
import test from "node:test";
import { applyOrder, indicatorIndex, orderAgrees, planCardMove, sameOrder, type DragCard } from "./board-drag";

function card(id: string, listId: string, position: number, archived = false): DragCard {
  return { id, listId, position, archived };
}

const mids: Record<string, number> = { a: 10, b: 30, c: 50, d: 20, e: 40 };

function midY(id: string) {
  return mids[id] ?? null;
}

test("dragging down inserts after the card whose midpoint the pointer has passed", () => {
  const cards = [card("a", "cut", 0), card("b", "cut", 1000), card("c", "cut", 2000)];
  const plan = planCardMove({ cards, activeId: "a", overId: "b", pointerY: 35, midY });
  assert.ok(plan);
  assert.deepEqual(plan.groups, [{ listId: "cut", cardIds: ["b", "a", "c"] }]);
  assert.equal(sameOrder(cards, plan.groups), false);
});

test("dragging up inserts before the card under the pointer", () => {
  const cards = [card("a", "cut", 0), card("b", "cut", 1000), card("c", "cut", 2000)];
  const plan = planCardMove({ cards, activeId: "c", overId: "a", pointerY: 8, midY });
  assert.ok(plan);
  assert.deepEqual(plan.groups[0].cardIds, ["c", "a", "b"]);
});

test("a pointer in the lower half of a column appends, including onto an empty column", () => {
  const cards = [card("a", "cut", 0), card("d", "join", 0)];
  const ontoCards = planCardMove({ cards, activeId: "a", overId: "list:join", pointerY: 80, midY });
  assert.ok(ontoCards);
  assert.deepEqual(ontoCards.groups[0], { listId: "join", cardIds: ["d", "a"] });
  assert.deepEqual(ontoCards.groups[1], { listId: "cut", cardIds: [] });

  const empty = planCardMove({ cards, activeId: "a", overId: "list:fit", pointerY: 10, midY });
  assert.ok(empty);
  assert.deepEqual(empty.groups[0], { listId: "fit", cardIds: ["a"] });
});

test("dropping above the first card of another column inserts at the top", () => {
  const cards = [card("a", "cut", 0), card("d", "join", 0), card("e", "join", 1000)];
  const plan = planCardMove({ cards, activeId: "a", overId: "e", pointerY: 15, midY });
  assert.ok(plan);
  assert.deepEqual(plan.groups[0].cardIds, ["a", "d", "e"]);
});

test("releasing in the same gap does not count as a change", () => {
  const cards = [card("a", "cut", 0), card("b", "cut", 1000)];
  const plan = planCardMove({ cards, activeId: "a", overId: "list:cut", pointerY: 12, midY });
  assert.ok(plan);
  assert.equal(sameOrder(cards, plan.groups), true);
});

test("archived cards stay out of the saved order and keep their place", () => {
  const cards = [card("a", "cut", 0), card("old", "cut", 500, true), card("b", "join", 0)];
  const plan = planCardMove({ cards, activeId: "a", overId: "b", pointerY: 10, midY });
  assert.ok(plan);
  assert.deepEqual(plan.groups[0].cardIds, ["a", "b"]);
  const next = applyOrder(cards, plan.groups);
  const archived = next.find((item) => item.id === "old");
  assert.equal(archived?.listId, "cut");
  assert.equal(archived?.position, 500);
  assert.deepEqual(
    next.filter((item) => item.listId === "join" && !item.archived).sort((a, b) => a.position - b.position).map((item) => item.id),
    ["a", "b"],
  );
});

test("the drop line accounts for the dragged card still sitting in the column", () => {
  assert.equal(indicatorIndex(["a", "b", "c"], "a", 1), 2);
  assert.equal(indicatorIndex(["a", "b", "c"], "a", 0), 1);
  assert.equal(indicatorIndex(["d", "e"], "a", 0), 0);
  assert.equal(indicatorIndex(["d", "e"], "a", 2), 2);
});

test("server data agrees when the saved order is intact, and not when it is stale", () => {
  const saved = [{ listId: "join", cardIds: ["d", "a"] }, { listId: "cut", cardIds: ["b"] }];
  const fresh = [card("b", "cut", 0), card("d", "join", 0), card("a", "join", 1000), card("new", "join", 2000)];
  const stale = [card("a", "cut", 0), card("b", "cut", 1000), card("d", "join", 0)];
  assert.equal(orderAgrees(fresh, saved), true);
  assert.equal(orderAgrees(stale, saved), false);
});

test("keyboard movement downward inserts after the card it crosses", () => {
  const cards = [card("a", "cut", 0), card("b", "cut", 1000), card("c", "cut", 2000)];
  const plan = planCardMove({ cards, activeId: "a", overId: "b", pointerY: null, midY });
  assert.ok(plan);
  assert.deepEqual(plan.groups[0].cardIds, ["b", "a", "c"]);
});
