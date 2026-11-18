"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, MoreHorizontal, Paperclip } from "lucide-react";
import { toast } from "sonner";
import {
  archiveCard,
  changeAssignee,
  changeCheck,
  changeField,
  changeLabel,
  changeMaterialStatus,
  createCheckItem,
  createMaterial,
  createNote,
  editMaterial,
  makeCover,
  moveCardTo,
  removeCardFile,
  removeMaterial,
  renameCardFile,
  saveCard,
  uploadCardFile,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MATERIAL_KINDS, STOCK_STATUSES, kindLabel, statusLabel } from "@/data/board-schema";
import type { BoardData, CardDetail, MaterialView } from "@/lib/board-types";
import { formatAdded, formatShopDate, formatStamp, initials } from "@/lib/format";

type Action = { ok: boolean; error?: string };

export function CardDetailView({ card, board }: { card: CardDetail; board: BoardData }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [itemText, setItemText] = useState("");
  const [kind, setKind] = useState("top_mat");
  const [itemCode, setItemCode] = useState("");
  const [vendor, setVendor] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  function act(work: () => Promise<Action>, message = "Saved") {
    startTransition(async () => {
      const result = await work();
      if (!result.ok) toast.error(result.error ?? "Could not save");
      else toast.success(message);
      router.refresh();
    });
  }

  const cover = card.attachments.find((file) => file.isCover && file.mimeType.startsWith("image/"));

  return (
    <div className="h-full overflow-y-auto bg-[#f6f3ec] text-zinc-900">
      <div className="relative flex h-52 items-start bg-[#e4e6e9]">
        <label className="absolute top-4 left-4 z-10">
          <span className="sr-only">Move to list</span>
          <select
            aria-label="List"
            value={card.listId}
            onChange={(event) => {
              const list = board.lists.find((item) => item.id === event.target.value);
              if (list && list.id !== card.listId) act(() => moveCardTo(card.id, list.name), `Moved to ${list.name}`);
            }}
            className="max-w-[240px] appearance-none rounded-md border border-zinc-300 bg-white px-3 py-1.5 pr-8 text-sm font-medium text-zinc-900 shadow-sm"
          >
            {board.lists.map((list) => (
              <option key={list.id} value={list.id}>{list.name}</option>
            ))}
          </select>
        </label>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/attachments/${cover.id}`} alt="" className="ml-auto h-full max-w-[58%] object-cover" />
        ) : null}
      </div>

      <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl leading-snug font-medium">{card.title}</h1>
          <div className="flex gap-2">
            {card.needsReview ? <span className="rounded-full bg-amber-500 px-2 py-1 text-xs font-semibold text-black">Needs review</span> : null}
            {card.overdue ? <span className="rounded-full bg-red-700 px-2 py-1 text-xs font-semibold">Overdue {formatShopDate(card.dueDate)}</span> : null}
          </div>
        </div>

        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-zinc-500 uppercase">Client</h2>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const workOrder = String(data.get("workOrder") ?? "").trim();
              act(() =>
                saveCard(card.id, {
                  customerName: String(data.get("customer") ?? ""),
                  phone: String(data.get("phone") ?? ""),
                  workOrderNumber: workOrder || null,
                  invoiceNumber: String(data.get("invoice") ?? ""),
                  pieceIndex: Number(data.get("piece") || 1),
                  pieceCount: Number(data.get("of") || 1),
                  size: String(data.get("size") ?? ""),
                  dueDate: String(data.get("due") ?? "") || null,
                  startDate: String(data.get("start") ?? "") || null,
                  sharedMats: String(data.get("sharedMats") ?? ""),
                  artDescription: String(data.get("artDescription") ?? ""),
                  artLocation: String(data.get("artLocation") ?? ""),
                  artCondition: String(data.get("artCondition") ?? ""),
                  connectedOrders: String(data.get("connectedOrders") ?? ""),
                  additionalContact: String(data.get("additionalContact") ?? ""),
                  customerRecordId: String(data.get("customerRecord") ?? "") || null,
                }),
              );
            }}
          >
            <DarkField name="customer" label="Customer" defaultValue={card.customerName} required className="sm:col-span-2" />
            <DarkField name="phone" label="Phone" defaultValue={card.phone} />
            <DarkField name="size" label="Size" defaultValue={card.size} />
            <DarkField name="workOrder" label="W.O. #" defaultValue={card.workOrderNumber ?? ""} />
            <DarkField name="invoice" label="Invoice #" defaultValue={card.invoiceNumber ?? ""} />
            <DarkField name="piece" label="Piece" defaultValue={String(card.pieceIndex ?? 1)} />
            <DarkField name="of" label="of" defaultValue={String(card.pieceCount ?? 1)} />
            <DarkField name="due" label="Due date" type="date" defaultValue={card.dueDate ?? ""} />
            <DarkField name="start" label="Start date" type="date" defaultValue={card.startDate ?? ""} />
            <DarkArea name="sharedMats" label="Shared Mats" defaultValue={card.sharedMats} />
            <DarkArea name="artDescription" label="Art Description" defaultValue={card.artDescription} />
            <DarkArea name="artLocation" label="Art Location" defaultValue={card.artLocation} />
            <DarkArea name="artCondition" label="Art Condition" defaultValue={card.artCondition} />
            <DarkArea name="connectedOrders" label="Connected Orders" defaultValue={card.connectedOrders} />
            <DarkArea name="additionalContact" label="Additional Contact Info" defaultValue={card.additionalContact} />
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="customerRecord" className="text-zinc-700">Customer record</Label>
              <select id="customerRecord" name="customerRecord" defaultValue={card.customerRecordId ?? ""} className="h-10 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm">
                <option value="">No linked customer card</option>
                {card.customerRecords.map((record) => (
                  <option key={record.id} value={record.id}>{record.name}</option>
                ))}
              </select>
              {card.customerRecordId ? (
                <Link href={`/cards/${card.customerRecordId}`} className="text-sm text-sky-800 underline">
                  Open {card.customerRecordName} on the Master Customer List
                </Link>
              ) : null}
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit">Save client info</Button>
              <Button type="button" variant="outline" className="border-zinc-300 bg-white text-zinc-900" onClick={() => act(() => archiveCard(card.id, !card.archived), card.archived ? "Restored" : "Archived")}>
                {card.archived ? "Unarchive" : "Archive"}
              </Button>
            </div>
          </form>
        </section>

        <section id="custom-fields">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-medium">
            <span className="text-zinc-500">#</span> Custom Fields
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {card.fields.map((field) => (
              <div key={field.id} className="space-y-1.5">
                <Label className="text-zinc-700">{field.name}</Label>
                {field.options.length === 0 ? (
                  <Input
                    type="number"
                    min={0}
                    defaultValue={field.value}
                    aria-label={field.name}
                    className="h-10 border-zinc-300 bg-white text-zinc-900"
                    onBlur={(event) => {
                      if (event.target.value !== field.value) act(() => changeField(card.id, field.id, event.target.value));
                    }}
                  />
                ) : (
                  <select
                    aria-label={field.name}
                    value={field.value}
                    onChange={(event) => act(() => changeField(card.id, field.id, event.target.value))}
                    className={`h-10 w-full rounded-md border px-2 text-sm ${toneClass(field.value)}`}
                  >
                    <option value="">Select...</option>
                    {field.options.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
        </section>

        <section id="attachments">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-medium">
              <Paperclip className="size-4 text-zinc-500" /> Attachments
            </h2>
            <form action={async (formData) => {
              const result = await uploadCardFile(card.id, formData);
              if (!result.ok) toast.error(result.error);
              else { toast.success("Attached"); router.refresh(); }
            }}>
              <label className="cursor-pointer rounded-md border border-zinc-600 px-3 py-1.5 text-sm hover:bg-white/5">
                Add
                <input name="file" type="file" accept="application/pdf,image/*" className="sr-only" onChange={(event) => event.currentTarget.form?.requestSubmit()} />
              </label>
            </form>
          </div>
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200">
            {card.attachments.length === 0 ? <li className="px-3 py-4 text-sm text-zinc-500">No files yet. The Lifesaver PDF is named with the invoice number.</li> : null}
            {card.attachments.map((file) => {
              const src = `/api/attachments/${file.id}`;
              const image = file.mimeType.startsWith("image/");
              return (
                <li key={file.id} className="flex items-center gap-3 px-3 py-2">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt="" className="size-12 rounded object-cover" />
                  ) : (
                    <span className="grid size-12 place-items-center rounded border border-zinc-200 bg-zinc-100 text-xs font-semibold text-zinc-800">PDF</span>
                  )}
                  <div className="min-w-0 flex-1">
                    {renameId === file.id ? (
                      <form
                        className="flex gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          act(() => renameCardFile(card.id, file.id, renameValue), "Renamed");
                          setRenameId(null);
                        }}
                      >
                        <Input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} className="h-8 border-zinc-300 bg-white" aria-label="New file name" />
                        <Button type="submit" size="sm">Save</Button>
                      </form>
                    ) : (
                      <p className="truncate font-medium">{file.filename}</p>
                    )}
                    <p className="text-xs text-zinc-500">
                      Added {formatAdded(file.createdAt)}
                      {file.isCover ? " · Cover" : ""}
                    </p>
                  </div>
                  <a href={src} target="_blank" rel="noreferrer" aria-label={`Open ${file.filename}`} className="rounded p-2 text-zinc-700 hover:bg-zinc-100">
                    <ExternalLink className="size-4" />
                  </a>
                  <DropdownMenu>
                    <DropdownMenuTrigger aria-label={`Actions for ${file.filename}`} className="rounded p-2 text-zinc-700 hover:bg-zinc-100">
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {image ? <DropdownMenuItem onClick={() => act(() => makeCover(card.id, file.id), "Cover updated")}>Make cover</DropdownMenuItem> : null}
                      <DropdownMenuItem onClick={() => { setRenameId(file.id); setRenameValue(file.filename); }}>Rename</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => act(() => removeCardFile(card.id, file.id), "Deleted")}>Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-medium">Materials</h2>
          <div className="space-y-2">
            {card.materials.map((line) => (
              <MaterialRow
                key={line.id}
                line={line}
                onChange={(status) => act(() => changeMaterialStatus(line.id, status, card.id))}
                onEdit={(input) => act(() => editMaterial(card.id, line.id, input))}
                onRemove={() => act(() => removeMaterial(card.id, line.id), "Removed")}
              />
            ))}
          </div>
          <form
            className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              if (!itemCode.trim()) return;
              act(() => createMaterial(card.id, { kind, itemCode, vendor }), "Material added");
              setItemCode("");
              setVendor("");
            }}
          >
            <select aria-label="Material kind" value={kind} onChange={(event) => setKind(event.target.value)} className="h-10 rounded-md border border-zinc-300 bg-white px-2 text-sm">
              {MATERIAL_KINDS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            <Input value={itemCode} onChange={(event) => setItemCode(event.target.value)} placeholder="Item code" className="h-10 border-zinc-300 bg-white" />
            <Input value={vendor} onChange={(event) => setVendor(event.target.value)} placeholder="Vendor" className="h-10 border-zinc-300 bg-white" />
            <Button type="submit">Add</Button>
          </form>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-medium">Labels and people</h2>
          <div className="flex flex-wrap gap-1.5">
            {board.labels.map((label) => {
              const on = card.labels.some((item) => item.id === label.id);
              return (
                <button key={label.id} type="button" onClick={() => act(() => changeLabel(card.id, label.id), on ? "Label removed" : "Label added")} className="rounded-full border px-2 py-1 text-xs" style={{ borderColor: label.color, background: on ? `${label.color}55` : "transparent" }}>
                  {label.name}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {board.users.map((user) => {
              const on = card.assignees.some((person) => person.id === user.id);
              return (
                <Button key={user.id} type="button" variant={on ? "default" : "outline"} className={on ? "" : "border-zinc-300 bg-white text-zinc-900"} onClick={() => act(() => changeAssignee(card.id, user.id))}>
                  {initials(user.name)} {user.name}
                </Button>
              );
            })}
          </div>
        </section>

        {card.checklists.map((list) => (
          <section key={list.id}>
            <h2 className="mb-3 text-lg font-medium">{list.title}</h2>
            <ul className="space-y-2">
              {list.items.map((item) => (
                <li key={item.id} className="flex items-start gap-2">
                  <Checkbox checked={item.checked} onCheckedChange={(checked) => act(() => changeCheck(card.id, item.id, Boolean(checked)))} />
                  <span className={item.checked ? "text-zinc-500 line-through" : ""}>{item.text}</span>
                </li>
              ))}
            </ul>
            <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); act(() => createCheckItem(card.id, itemText)); setItemText(""); }}>
              <Input value={itemText} onChange={(event) => setItemText(event.target.value)} placeholder="Add a step" className="h-10 border-zinc-300 bg-white" />
              <Button type="submit" variant="outline" className="border-zinc-300 bg-white text-zinc-900">Add</Button>
            </form>
          </section>
        ))}

        <section>
          <h2 className="mb-3 text-lg font-medium">Notes</h2>
          <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); act(() => createNote(card.id, note), "Note added"); setNote(""); }}>
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="What should the next person know?" className="border-zinc-300 bg-white" />
            <Button type="submit" disabled={!note.trim()}>Add note</Button>
          </form>
          <ul className="mt-4 space-y-3">
            {card.notes.length === 0 ? <li className="text-sm text-zinc-500">No notes yet.</li> : null}
            {card.notes.map((entry) => (
              <li key={entry.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
                <p className="text-xs text-zinc-500">{entry.authorName} · {formatStamp(entry.createdAt)}</p>
                <p className="mt-1 text-sm whitespace-pre-wrap">{entry.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-medium">Activity</h2>
          <ul className="space-y-2 text-sm">
            {card.activity.map((event) => (
              <li key={event.id}>
                <span className="text-zinc-500">{formatStamp(event.createdAt)}</span>
                <span> — {event.summary}</span>
              </li>
            ))}
          </ul>
        </section>

        {card.siblings.length ? (
          <section>
            <h2 className="mb-2 text-lg font-medium">Other pieces</h2>
            <ul className="space-y-1 text-sm">
              {card.siblings.map((sibling) => (
                <li key={sibling.id}><Link className="text-sky-800 underline" href={`/cards/${sibling.id}`}>{sibling.title}</Link> · {sibling.listName}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function toneClass(value: string) {
  const text = value.toLowerCase();
  if (!value) return "border-zinc-300 bg-white text-zinc-500";
  if (text.includes("b.o") || text.includes("backorder") || text.includes("back ordered")) return "border-red-300 bg-red-100 font-medium text-red-900";
  if (
    text.startsWith("here") ||
    ["joined", "stretched", "typeset done", "done", "cut & join", "in-stock chop & join"].includes(text)
  ) {
    return "border-emerald-300 bg-emerald-100 font-medium text-emerald-950";
  }
  if (text.includes("on order") || text.includes("spreadsheet") || text.includes("order placed") || text === "ordered" || text.includes("order after")) {
    return "border-amber-300 bg-amber-100 font-medium text-amber-950";
  }
  return "border-zinc-300 bg-zinc-50 text-zinc-900";
}

function DarkField({ name, label, defaultValue, required, type = "text", className }: { name: string; label: string; defaultValue: string; required?: boolean; type?: string; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={name} className="text-zinc-700">{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={defaultValue} required={required} className="h-10 border-zinc-300 bg-white text-zinc-900" />
    </div>
  );
}

function DarkArea({ name, label, defaultValue }: { name: string; label: string; defaultValue: string }) {
  return (
    <div className="space-y-1.5 sm:col-span-2">
      <Label htmlFor={name} className="text-zinc-700">{label}</Label>
      <Textarea id={name} name={name} defaultValue={defaultValue} className="border-zinc-300 bg-white text-zinc-900" />
    </div>
  );
}

function MaterialRow({ line, onChange, onEdit, onRemove }: { line: MaterialView; onChange: (status: string) => void; onEdit: (input: { itemCode: string; vendor: string; kind: string }) => void; onRemove: () => void }) {
  return (
    <div className="grid gap-2 rounded-lg border border-zinc-200 p-2 sm:grid-cols-[1.2fr_1fr_1fr_1fr_auto]">
      <select aria-label="Kind" defaultValue={line.kind} className="h-10 rounded-md border border-zinc-300 bg-white px-2 text-sm" onChange={(event) => onEdit({ kind: event.target.value, itemCode: line.itemCode, vendor: line.vendor })}>
        {MATERIAL_KINDS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
      <Input aria-label="Item code" defaultValue={line.itemCode} className="h-10 border-zinc-300 bg-white" onBlur={(event) => { if (event.target.value !== line.itemCode) onEdit({ kind: line.kind, itemCode: event.target.value, vendor: line.vendor }); }} />
      <Input aria-label="Vendor" defaultValue={line.vendor} placeholder="Vendor" className="h-10 border-zinc-300 bg-white" onBlur={(event) => { if (event.target.value !== line.vendor) onEdit({ kind: line.kind, itemCode: line.itemCode, vendor: event.target.value }); }} />
      <select aria-label={`${kindLabel(line.kind)} stock status`} value={line.stockStatus} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-md border border-zinc-300 bg-white px-2 text-sm">
        {STOCK_STATUSES.map((status) => <option key={status.id} value={status.id}>{statusLabel(status.id)}</option>)}
      </select>
      <Button type="button" variant="ghost" className="text-zinc-800" onClick={onRemove}>Remove</Button>
    </div>
  );
}
