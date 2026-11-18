"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Archive, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { archiveCard, createCard, saveOrder } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { statusShort } from "@/data/board-schema";
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
  const [source, setSource] = useState(data.cards);
  if (source !== data.cards) {
    setSource(data.cards);
    setCards(data.cards);
  }
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [draftList, setDraftList] = useState<BoardData["lists"][number] | null>(null);
  const filtered = filters.q || filters.label || filters.assignee || filters.due || filters.material || filters.archived;
  const visible = useMemo(() => cards.filter((card) => matches(card, filters, data.today)), [cards, filters, data.today]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const active = cards.find((card) => card.id === activeId) ?? null;

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    if (filtered) return;
    const overId = event.over ? String(event.over.id) : "";
    const activeCard = cards.find((card) => card.id === String(event.active.id));
    if (!overId || !activeCard || activeCard.archived) return;
    const destListId = overId.startsWith("list:") ? overId.slice(5) : cards.find((card) => card.id === overId)?.listId;
    if (!destListId) return;
    const openIn = (listId: string) =>
      cards.filter((card) => card.listId === listId && !card.archived).sort((a, b) => a.position - b.position);
    const source = openIn(activeCard.listId).filter((card) => card.id !== activeCard.id);
    const base = activeCard.listId === destListId ? source : openIn(destListId);
    let index = base.length;
    if (!overId.startsWith("list:")) {
      const overIndex = base.findIndex((card) => card.id === overId);
      if (overIndex >= 0) index = overIndex;
    }
    const dest = [...base];
    dest.splice(index, 0, { ...activeCard, listId: destListId });
    const groups = [{ listId: destListId, cardIds: dest.map((card) => card.id) }];
    if (activeCard.listId !== destListId) groups.push({ listId: activeCard.listId, cardIds: source.map((card) => card.id) });
    setCards((current) => {
      const untouched = current.filter((card) => card.archived || !groups.some((group) => group.listId === card.listId || card.id === activeCard.id));
      const placed = groups.flatMap((group) =>
        group.cardIds.map((id, position) => {
          const card = current.find((item) => item.id === id) ?? activeCard;
          return { ...card, listId: group.listId, position: position * 1000 };
        }),
      );
      return [...untouched, ...placed];
    });
    startTransition(async () => {
      const result = await saveOrder(groups);
      if (!result.ok) toast.error(result.error);
      router.refresh();
    });
  }

  return (
    <div className="flex h-full flex-col">
      <FilterBar data={data} filters={filters} setFilters={setFilters} count={visible.length} total={cards.filter((card) => !card.archived).length} filtered={Boolean(filtered)} />
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={(event: DragStartEvent) => setActiveId(String(event.active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-3 py-3 sm:px-4">
          {data.lists.map((list) => {
            const columnCards = visible.filter((card) => card.listId === list.id).sort((a, b) => a.position - b.position);
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
        <DragOverlay>{active ? <CardFace card={active} overlay /> : null}</DragOverlay>
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
      className="min-h-10 max-w-[180px] rounded-lg border bg-card px-2 text-sm"
    >
      {options.map((option) => (
        <option key={option.value || "any"} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function Column({
  list,
  cards,
  openCount,
  archivedCount,
  dragEnabled,
  onAdd,
  onArchive,
}: {
  list: BoardData["lists"][number];
  cards: BoardCard[];
  openCount: number;
  archivedCount: number;
  dragEnabled: boolean;
  onAdd: () => void;
  onArchive: (card: BoardCard) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `list:${list.id}`, disabled: !dragEnabled });
  return (
    <section className="flex h-full w-[292px] shrink-0 flex-col rounded-xl bg-[#e7e1d6]">
      <header className="flex items-start gap-2 px-3 pt-3 pb-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm leading-tight font-semibold">{list.name}</h2>
          <p className="text-xs text-muted-foreground">
            {openCount} {openCount === 1 ? "card" : "cards"}
            {archivedCount ? ` · ${archivedCount} archived` : ""}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label={`Add a card to ${list.name}`} onClick={onAdd}>
          <Plus />
        </Button>
      </header>
      <div ref={setNodeRef} className={`min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-3 ${isOver ? "bg-[#ddd6c8]" : ""}`}>
        <SortableContext items={cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <SortableCard key={card.id} card={card} dragEnabled={dragEnabled} onArchive={onArchive} />
          ))}
        </SortableContext>
        {cards.length === 0 ? <p className="px-1 py-6 text-center text-xs text-muted-foreground">{dragEnabled ? "Nothing here" : "No match"}</p> : null}
      </div>
    </section>
  );
}

function SortableCard({ card, dragEnabled, onArchive }: { card: BoardCard; dragEnabled: boolean; onArchive: (card: BoardCard) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id, disabled: !dragEnabled });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}
      {...attributes}
      {...listeners}
    >
      <CardFace card={card} dragProps={{ ...attributes, ...listeners }} onArchive={() => onArchive(card)} />
    </div>
  );
}

function CardFace({
  card,
  dragProps,
  onArchive,
  overlay = false,
}: {
  card: BoardCard;
  dragProps?: Record<string, unknown>;
  onArchive?: () => void;
  overlay?: boolean;
}) {
  const problems = summarize(card);
  return (
    <article
      {...(overlay ? {} : dragProps)}
      onPointerDown={(event) => {
        const handler = dragProps?.onPointerDown as ((event: React.PointerEvent<HTMLElement>) => void) | undefined;
        handler?.(event);
      }}
      className={`rounded-lg border bg-card p-2.5 shadow-sm touch-none ${overlay ? "w-[276px] rotate-1 shadow-lg" : "cursor-grab active:cursor-grabbing"} ${card.needsReview ? "border-amber-500" : ""} ${card.archived ? "opacity-70" : ""}`}
    >
      {card.needsReview ? <p className="mb-1 text-[11px] font-semibold tracking-wide text-amber-800 uppercase">Needs review</p> : null}
      {overlay ? (
        <p className="text-left text-[13px] leading-snug font-semibold">{card.title}</p>
      ) : (
        <Link href={`/cards/${card.id}`} onPointerDown={(event) => event.stopPropagation()} className="block text-left text-[13px] leading-snug font-semibold">
          {card.title}
        </Link>
      )}
      {card.labels.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {card.labels.slice(0, 4).map((label) => (
            <span key={label.id} className="rounded-full border px-1.5 py-0.5 text-[10px] font-medium" style={{ borderColor: label.color, backgroundColor: `${label.color}22` }}>
              {label.name}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {card.dueDate ? (
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${card.overdue ? "bg-red-700 text-white" : "bg-amber-100 text-amber-950"}`}>
            {card.overdue ? "Overdue" : "Due"} {formatShopDate(card.dueDate)}
          </span>
        ) : null}
        {problems.map((problem) => (
          <span key={problem} className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${badgeClass(problem)}`}>
            {problem}
          </span>
        ))}
        {card.materials.length > 0 && problems.length === 0 && !card.needsReview ? <span className="text-[10px] font-medium text-emerald-800">In house</span> : null}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex -space-x-1">
          {card.assignees.map((person) => (
            <span key={person.id} title={person.name} className="grid size-6 place-items-center rounded-full border border-zinc-300 bg-white text-[10px] font-semibold text-zinc-800">
              {initials(person.name)}
            </span>
          ))}
        </div>
        {onArchive ? (
          <button type="button" aria-label={card.archived ? "Unarchive card" : "Archive card"} className="rounded p-1 text-muted-foreground hover:bg-muted" onPointerDown={(event) => event.stopPropagation()} onClick={onArchive}>
            <Archive className="size-3.5" />
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
