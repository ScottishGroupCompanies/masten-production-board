"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useTransition, type RefObject } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  closestCorners,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Archive, FileText, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { archiveCard, createCard, saveOrder } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { statusShort } from "@/data/board-schema";
import { applyOrder, indicatorIndex, openCards, orderAgrees, planCardMove, sameOrder, type MovePlan, type OrderGroup } from "@/lib/board-drag";
import type { BoardCard, BoardData } from "@/lib/board-types";
import { formatShopDate, initials } from "@/lib/format";

type Filters = {
  q: string;
  label: string;
  assignee: string;
  due: string;
  material: string;
  archived: boolean;
};

const emptyFilters: Filters = { q: "", label: "", assignee: "", due: "", material: "", archived: false };

const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length > 0) {
    const cardHits = hits.filter((hit) => !String(hit.id).startsWith("list:"));
    if (cardHits.length > 0) {
      const ids = new Set(cardHits.map((hit) => hit.id));
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter((container) => ids.has(container.id)),
      });
    }
    return hits;
  }
  return closestCorners(args);
};

type DropPreview = { listId: string; index: number };

function pointerFromEvent(event: { activatorEvent: Event; delta?: { x: number; y: number } }) {
  const activator = event.activatorEvent;
  if (!("clientX" in activator) || !("clientY" in activator)) return null;
  if (typeof activator.clientX !== "number" || typeof activator.clientY !== "number") return null;
  return {
    x: activator.clientX + (event.delta?.x ?? 0),
    y: activator.clientY + (event.delta?.y ?? 0),
  };
}

function cardMidpoint(id: string) {
  if (typeof document === "undefined") return null;
  const element = document.querySelector(`[data-card-id="${CSS.escape(id)}"]`);
  if (!(element instanceof HTMLElement)) return null;
  const rect = element.getBoundingClientRect();
  if (rect.height <= 0) return null;
  return rect.top + rect.height / 2;
}

function targetUnderPointer(x: number, y: number) {
  const elements = document.elementsFromPoint(x, y);
  for (const element of elements) {
    if (!(element instanceof Element)) continue;
    const card = element.closest("[data-card-id]");
    if (card instanceof HTMLElement) {
      const id = card.dataset.cardId;
      if (id) return id;
    }
    const list = element.closest("[data-list-id]");
    if (list instanceof HTMLElement && list.dataset.listId) return `list:${list.dataset.listId}`;
  }
  return "";
}

function previewFor(cards: BoardCard[], activeId: string, overId: string, pointerY: number | null): (DropPreview & { plan: MovePlan }) | null {
  if (!overId) return null;
  const plan = planCardMove({ cards, activeId, overId, pointerY, midY: cardMidpoint });
  if (!plan) return null;
  const rendered = openCards(cards, plan.destListId).map((card) => card.id);
  return { listId: plan.destListId, index: indicatorIndex(rendered, activeId, plan.index), plan };
}

function matches(card: BoardCard, filters: Filters, today: string) {
  if (card.archived !== filters.archived) return false;
  const haystack = [card.customerName, card.workOrderNumber, card.invoiceNumber, card.phone, card.size, card.title]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (filters.q && !haystack.includes(filters.q.trim().toLowerCase())) return false;
  if (filters.label && !card.labels.some((label) => label.id === filters.label)) return false;
  if (filters.assignee === "none" && card.assignees.length) return false;
  if (filters.assignee && filters.assignee !== "none" && !card.assignees.some((person) => person.id === filters.assignee)) return false;
  if (filters.due === "overdue" && !card.overdue) return false;
  if (filters.due === "week" && !(card.dueDate && card.dueDate >= today && card.dueDate <= addDays(today, 7))) return false;
  if (filters.due === "none" && card.dueDate) return false;
  if (filters.material === "needs_review" && !card.needsReview) return false;
  if (filters.material && filters.material !== "needs_review" && !card.materials.some((line) => line.stockStatus === filters.material)) {
    return false;
  }
  return true;
}

function addDays(iso: string, days: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function BoardView({ data }: { data: BoardData }) {
  const router = useRouter();
  const [cards, setCards] = useState(data.cards);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [preview, setPreview] = useState<DropPreview | null>(null);
  const [pending, startTransition] = useTransition();
  const [draftList, setDraftList] = useState<BoardData["lists"][number] | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const savesInFlight = useRef(0);
  const dragEpoch = useRef(0);
  const expectedOrder = useRef<OrderGroup[] | null>(null);

  useEffect(() => {
    if (savesInFlight.current > 0) return;
    if (expectedOrder.current && !orderAgrees(data.cards, expectedOrder.current)) return;
    expectedOrder.current = null;
    setCards(data.cards);
  }, [data.cards]);
  const filtered = filters.q || filters.label || filters.assignee || filters.due || filters.material || filters.archived;
  const visible = useMemo(() => cards.filter((card) => matches(card, filters, data.today)), [cards, filters, data.today]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const active = cards.find((card) => card.id === activeId) ?? null;

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, []);

  useEffect(() => {
    if (!activeId) return;
    let frame = 0;
    const tick = () => {
      const board = boardRef.current;
      const pointer = pointerRef.current;
      if (board && pointer) {
        scrollBoard(board, pointer.x);
        scrollColumn(pointer.x, pointer.y);
        const overId = targetUnderPointer(pointer.x, pointer.y);
        const next = previewFor(cards, activeId, overId, pointer.y);
        setPreview((current) => (current?.listId === next?.listId && current?.index === next?.index ? current : next));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [activeId, cards]);

  function onDragStart(event: DragStartEvent) {
    suppressClick.current = true;
    setActiveId(String(event.active.id));
  }

  function finishDrag(event: DragEndEvent) {
    const activeCardId = String(event.active.id);
    const pointer = pointerRef.current ?? pointerFromEvent(event);
    setActiveId(null);
    setPreview(null);
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    if (filtered) return;
    const overId = (pointer && targetUnderPointer(pointer.x, pointer.y)) || (event.over ? String(event.over.id) : "");
    const plan = planCardMove({
      cards,
      activeId: activeCardId,
      overId,
      pointerY: pointer?.y ?? null,
      midY: cardMidpoint,
    });
    if (!plan || sameOrder(cards, plan.groups)) return;
    const snapshot = cards;
    const epoch = ++dragEpoch.current;
    expectedOrder.current = plan.groups;
    setCards(applyOrder(cards, plan.groups));
    savesInFlight.current += 1;
    startTransition(async () => {
      const result = await saveOrder(plan.groups);
      savesInFlight.current -= 1;
      if (!result.ok) {
        if (dragEpoch.current === epoch) {
          expectedOrder.current = null;
          setCards(snapshot);
        }
        toast.error(result.error);
      }
      if (savesInFlight.current === 0) router.refresh();
    });
  }

  return (
    <div className="flex h-full flex-col">
      <FilterBar data={data} filters={filters} setFilters={setFilters} count={visible.length} total={cards.filter((card) => !card.archived).length} filtered={Boolean(filtered)} />
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        autoScroll={false}
        onDragStart={onDragStart}
        onDragEnd={finishDrag}
        onDragCancel={() => {
          setActiveId(null);
          setPreview(null);
          window.setTimeout(() => {
            suppressClick.current = false;
          }, 0);
        }}
      >
        <div ref={boardRef} data-board-scroll="true" className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-3 py-3 sm:px-4">
          {data.lists.map((list) => {
            const columnCards = visible
              .filter((card) => card.listId === list.id)
              .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
            const openCount = cards.filter((card) => card.listId === list.id && !card.archived).length;
            const archivedCount = cards.filter((card) => card.listId === list.id && card.archived).length;
            return (
              <Column
                key={list.id}
                list={list}
                cards={columnCards}
                openCount={openCount}
                archivedCount={archivedCount}
                dragEnabled={!filtered}
                dropIndex={preview?.listId === list.id ? preview.index : null}
                suppressClick={suppressClick}
                onAdd={() => setDraftList(list)}
                onArchive={(card) => {
                  startTransition(async () => {
                    const result = await archiveCard(card.id, !card.archived);
                    if (!result.ok) toast.error(result.error);
                    else setCards((current) => current.map((item) => (item.id === card.id ? { ...item, archived: !card.archived } : item)));
                    router.refresh();
                  });
                }}
              />
            );
          })}
        </div>
        <DragOverlay dropAnimation={null} zIndex={40} className="pointer-events-none" style={{ pointerEvents: "none" }}>
          {active ? <CardFace card={active} overlay /> : null}
        </DragOverlay>
      </DndContext>
      {pending ? <p className="sr-only">Saving</p> : null}
      <NewCardDialog
        list={draftList}
        onClose={() => setDraftList(null)}
        onCreated={(id) => {
          setDraftList(null);
          router.push(`/cards/${id}`);
        }}
      />
    </div>
  );
}

function FilterBar({
  data,
  filters,
  setFilters,
  count,
  total,
  filtered,
}: {
  data: BoardData;
  filters: Filters;
  setFilters: (filters: Filters) => void;
  count: number;
  total: number;
  filtered: boolean;
}) {
  return (
    <div className="shrink-0 border-b bg-[#f7f3ea] px-3 py-2 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            value={filters.q}
            onChange={(event) => setFilters({ ...filters, q: event.target.value })}
            placeholder="Customer, W.O., invoice"
            className="min-h-10 pl-8"
            aria-label="Search cards"
          />
        </div>
        <FilterSelect label="Label" value={filters.label} onChange={(label) => setFilters({ ...filters, label })} options={[{ value: "", label: "Any label" }, ...data.labels.map((label) => ({ value: label.id, label: label.name }))]} />
        <FilterSelect label="Assignee" value={filters.assignee} onChange={(assignee) => setFilters({ ...filters, assignee })} options={[{ value: "", label: "Anyone" }, { value: "none", label: "Unassigned" }, ...data.users.map((user) => ({ value: user.id, label: user.name }))]} />
        <FilterSelect label="Due" value={filters.due} onChange={(due) => setFilters({ ...filters, due })} options={[{ value: "", label: "Any due date" }, { value: "overdue", label: "Overdue" }, { value: "week", label: "Due in 7 days" }, { value: "none", label: "No due date" }]} />
        <FilterSelect label="Materials" value={filters.material} onChange={(material) => setFilters({ ...filters, material })} options={[{ value: "", label: "Any material status" }, { value: "needs_review", label: "Needs review" }, { value: "not_in_stock", label: "Not in stock" }, { value: "ordered", label: "Ordered" }, { value: "needs_human_check", label: "Needs human check" }, { value: "in_stock", label: "In stock" }, { value: "here", label: "Here" }]} />
        <Label className="flex min-h-10 items-center gap-2 rounded-lg border bg-card px-2.5 text-sm font-normal">
          <Switch checked={filters.archived} onCheckedChange={(archived) => setFilters({ ...filters, archived })} />
          Archived
        </Label>
        {filtered ? (
          <Button variant="ghost" onClick={() => setFilters(emptyFilters)}>
            Clear
          </Button>
        ) : null}
        <p className="ml-auto text-sm text-muted-foreground">
          {count} shown · {total} open
          {filtered ? " · drag paused" : ""}
        </p>
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="min-h-10 max-w-[180px] rounded-lg border bg-card px-2 text-base"
    >
      {options.map((option) => (
        <option key={option.value || "any"} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function scrollBoard(board: HTMLElement, pointerX: number) {
  const rect = board.getBoundingClientRect();
  const edge = 112;
  const maxSpeed = 8;
  const leftGap = pointerX - rect.left;
  const rightGap = rect.right - pointerX;
  if (leftGap < edge) {
    const speed = Math.round(maxSpeed * (1 - Math.max(leftGap, 0) / edge) ** 2);
    if (speed) board.scrollLeft -= speed;
  } else if (rightGap < edge) {
    const speed = Math.round(maxSpeed * (1 - Math.max(rightGap, 0) / edge) ** 2);
    if (speed) board.scrollLeft += speed;
  }
}

function scrollColumn(pointerX: number, pointerY: number) {
  const hit = document.elementFromPoint(pointerX, pointerY);
  const column = hit?.closest("[data-column-scroll]");
  if (!(column instanceof HTMLElement)) return;
  const rect = column.getBoundingClientRect();
  const edge = 72;
  const maxSpeed = 16;
  const topGap = pointerY - rect.top;
  const bottomGap = rect.bottom - pointerY;
  if (topGap < edge) {
    const speed = Math.round(maxSpeed * (1 - Math.max(topGap, 0) / edge) ** 2);
    if (speed) column.scrollTop -= speed;
  } else if (bottomGap < edge) {
    const speed = Math.round(maxSpeed * (1 - Math.max(bottomGap, 0) / edge) ** 2);
    if (speed) column.scrollTop += speed;
  }
}

function Column({
  list,
  cards,
  openCount,
  archivedCount,
  dragEnabled,
  dropIndex,
  suppressClick,
  onAdd,
  onArchive,
}: {
  list: BoardData["lists"][number];
  cards: BoardCard[];
  openCount: number;
  archivedCount: number;
  dragEnabled: boolean;
  dropIndex: number | null;
  suppressClick: RefObject<boolean>;
  onAdd: () => void;
  onArchive: (card: BoardCard) => void;
}) {
  const { setNodeRef } = useDroppable({ id: `list:${list.id}`, disabled: !dragEnabled, data: { type: "list", listId: list.id } });
  const targeted = dropIndex != null;
  return (
    <section
      ref={setNodeRef}
      data-list-id={list.id}
      className={`flex h-full w-[292px] shrink-0 flex-col rounded-xl ${targeted ? "bg-[#d9d0c2] ring-2 ring-[#1c2b26]" : "bg-[#e7e1d6]"}`}
    >
      <header className="flex items-start gap-2 px-3 pt-3 pb-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] leading-snug font-semibold">{list.name}</h2>
          <p className="text-sm leading-snug text-zinc-600">
            {openCount} {openCount === 1 ? "card" : "cards"}
            {archivedCount ? ` · ${archivedCount} archived` : ""}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label={`Add a card to ${list.name}`} onClick={onAdd}>
          <Plus />
        </Button>
      </header>
      <div data-column-scroll="true" className="min-h-16 flex-1 space-y-2 overflow-y-auto px-2 pb-3">
        <SortableContext items={cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card, index) => (
            <Fragment key={card.id}>
              {dropIndex === index ? <DropLine /> : null}
              <SortableCard card={card} dragEnabled={dragEnabled} suppressClick={suppressClick} onArchive={onArchive} />
            </Fragment>
          ))}
        </SortableContext>
        {dropIndex === cards.length ? <DropLine /> : null}
        {cards.length === 0 ? <p className="px-1 py-6 text-center text-sm text-zinc-600">{dragEnabled ? "Nothing here" : "No match"}</p> : null}
      </div>
    </section>
  );
}

function DropLine() {
  return <div className="h-1.5 rounded-full bg-[#1c2b26]" aria-hidden />;
}

function SortableCard({
  card,
  dragEnabled,
  suppressClick,
  onArchive,
}: {
  card: BoardCard;
  dragEnabled: boolean;
  suppressClick: RefObject<boolean>;
  onArchive: (card: BoardCard) => void;
}) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: card.id,
    disabled: !dragEnabled,
    data: { type: "card", listId: card.listId },
    animateLayoutChanges: () => false,
  });
  return (
    <div
      ref={setNodeRef}
      data-card-id={card.id}
      className={isDragging ? "pointer-events-none opacity-40" : dragEnabled ? "cursor-grab touch-none active:cursor-grabbing" : undefined}
      {...attributes}
      {...(dragEnabled ? listeners : {})}
      onClick={(event) => {
        if (suppressClick.current) return;
        const target = event.target;
        if (!(target instanceof Element) || target.closest("a, button")) return;
        router.push(`/cards/${card.id}`);
      }}
    >
      <CardFace card={card} suppressClick={suppressClick} onArchive={() => onArchive(card)} />
    </div>
  );
}

function CardFace({
  card,
  suppressClick,
  onArchive,
  overlay = false,
}: {
  card: BoardCard;
  suppressClick?: RefObject<boolean>;
  onArchive?: () => void;
  overlay?: boolean;
}) {
  const problems = summarize(card);
  return (
    <article
      className={`rounded-lg border bg-card p-3 shadow-sm select-none ${overlay ? "w-[276px] rotate-1 shadow-2xl ring-2 ring-[#1c2b26]/20" : ""} ${card.needsReview ? "border-amber-500" : ""} ${card.archived ? "opacity-70" : ""}`}
    >
      {card.needsReview ? <p className="mb-1 text-xs font-semibold text-amber-900">Needs review</p> : null}
      {overlay ? (
        <p className="text-left text-base leading-snug font-semibold">{card.title}</p>
      ) : (
        <Link
          href={`/cards/${card.id}`}
          draggable={false}
          onClick={(event) => {
            if (suppressClick?.current) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
          className="block text-left text-base leading-snug font-semibold"
        >
          {card.title}
        </Link>
      )}
      {card.labels.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {card.labels.slice(0, 4).map((label) => (
            <span key={label.id} className="rounded-full border px-2 py-0.5 text-xs font-medium" style={{ borderColor: label.color, backgroundColor: `${label.color}22` }}>
              {label.name}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {card.dueDate ? (
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${card.overdue ? "bg-red-700 text-white" : "bg-amber-100 text-amber-950"}`}>
            {card.overdue ? "Overdue" : "Due"} {formatShopDate(card.dueDate)}
          </span>
        ) : null}
        {problems.map((problem) => (
          <span key={problem} className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass(problem)}`}>
            {problem}
          </span>
        ))}
        {card.materials.length > 0 && problems.length === 0 && !card.needsReview ? <span className="text-xs font-medium text-emerald-800">In house</span> : null}
        {card.hasPdf ? (
          <span title="Order PDF attached" className="inline-flex items-center gap-1 rounded-full bg-zinc-900 px-2 py-0.5 text-xs font-semibold text-white">
            <FileText className="size-3" aria-hidden />
            PDF
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex -space-x-1">
          {card.assignees.map((person) => (
            <span key={person.id} title={person.name} className="grid size-7 place-items-center rounded-full border border-zinc-300 bg-white text-xs font-semibold text-zinc-800">
              {initials(person.name)}
            </span>
          ))}
        </div>
        {onArchive ? (
          <button type="button" aria-label={card.archived ? "Unarchive card" : "Archive card"} className="rounded p-1 text-muted-foreground hover:bg-muted" onPointerDown={(event) => event.stopPropagation()} onClick={onArchive}>
            <Archive className="size-4" />
          </button>
        ) : null}
      </div>
    </article>
  );
}

function summarize(card: BoardCard) {
  const counts = new Map<string, number>();
  for (const line of card.materials) {
    if (line.stockStatus === "in_stock" || line.stockStatus === "here") continue;
    counts.set(line.stockStatus, (counts.get(line.stockStatus) ?? 0) + 1);
  }
  return [...counts.entries()].slice(0, 3).map(([status, count]) => `${statusShort(status)}${count > 1 ? ` · ${count}` : ""}`);
}

function badgeClass(text: string) {
  if (text.startsWith("Not")) return "bg-red-100 text-red-900";
  if (text.startsWith("Ordered")) return "bg-sky-100 text-sky-950";
  return "bg-amber-100 text-amber-950";
}

function NewCardDialog({ list, onClose, onCreated }: { list: BoardData["lists"][number] | null; onClose: () => void; onCreated: (id: string) => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={Boolean(list)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New card in {list?.name}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!list) return;
            const data = new FormData(event.currentTarget);
            const workOrder = String(data.get("workOrder") ?? "").trim();
            startTransition(async () => {
              const result = await createCard({
                listId: list.id,
                customerName: String(data.get("customer") ?? ""),
                phone: String(data.get("phone") ?? ""),
                workOrderNumber: workOrder || null,
                invoiceNumber: String(data.get("invoice") ?? ""),
                pieceIndex: Number(data.get("piece") || 1),
                pieceCount: Number(data.get("of") || 1),
                size: String(data.get("size") ?? ""),
                dueDate: String(data.get("due") ?? "") || null,
                ensureDefaults: list.kind === "production",
              });
              if (!result.ok || !result.id) toast.error(result.ok ? "The card could not be created." : result.error);
              else onCreated(result.id);
            });
          }}
        >
          <Field name="customer" label="Customer" required className="sm:col-span-2" />
          <Field name="phone" label="Phone" />
          <Field name="size" label="Size" placeholder="16x20" />
          <Field name="workOrder" label="W.O. #" />
          <Field name="invoice" label="Invoice #" />
          <Field name="piece" label="Piece" defaultValue="1" />
          <Field name="of" label="of" defaultValue="1" />
          <div className="space-y-1.5">
            <Label htmlFor="due">Due date</Label>
            <Input id="due" name="due" type="date" className="min-h-10" />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Create card"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ name, label, required, className, placeholder, defaultValue }: { name: string; label: string; required?: boolean; className?: string; placeholder?: string; defaultValue?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} required={required} placeholder={placeholder} defaultValue={defaultValue} className="min-h-10" />
    </div>
  );
}
