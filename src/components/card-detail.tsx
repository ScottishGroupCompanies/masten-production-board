"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, ExternalLink, MoreHorizontal, Upload } from "lucide-react";
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
  const [uploading, setUploading] = useState<"pdf" | "photo" | null>(null);

  function act(work: () => Promise<Action>, message = "Saved") {
    startTransition(async () => {
      const result = await work();
      if (!result.ok) toast.error(result.error ?? "Could not save");
      else toast.success(message);
      router.refresh();
    });
  }

  const cover = card.attachments.find((file) => file.isCover && file.mimeType.startsWith("image/"));
  const pdfs = card.attachments.filter(isPdfAttachment);
  const photos = card.attachments.filter((file) => !isPdfAttachment(file));

  async function upload(kind: "pdf" | "photo", file: File | undefined) {
    if (!file || uploading) return;
    if (kind === "pdf" && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Choose a PDF file.");
      return;
    }
    setUploading(kind);
    const formData = new FormData();
    formData.set("file", file);
    formData.set("kind", kind);
    const result = await uploadCardFile(card.id, formData);
    setUploading(null);
    if (!result.ok) toast.error(result.error ?? "Could not upload");
    else {
      toast.success(kind === "pdf" ? "PDF uploaded" : "Photo added");
      router.refresh();
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-[#f6f3ec] text-zinc-900">
      <div className={`relative flex items-start bg-[#e4e6e9] ${cover ? "h-52" : "h-16"}`}>
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
          <h1 className="text-2xl leading-snug font-semibold">{card.title}</h1>
          <div className="flex gap-2">
            {card.needsReview ? <span className="rounded-full bg-amber-500 px-2 py-1 text-xs font-semibold text-black">Needs review</span> : null}
            {card.overdue ? <span className="rounded-full bg-red-700 px-2 py-1 text-xs font-semibold">Overdue {formatShopDate(card.dueDate)}</span> : null}
          </div>
        </div>

        <section id="order-pdf" aria-labelledby="order-pdf-heading" className="rounded-xl border border-zinc-300 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 id="order-pdf-heading" className="text-lg font-semibold leading-snug">Order PDF</h2>
              <p className="text-sm text-zinc-600">Upload the Lifesaver work order. PDF files only.</p>
            </div>
            <UploadControl
              label={uploading === "pdf" ? "Uploading…" : "Upload PDF"}
              accept=".pdf,application/pdf"
              disabled={uploading !== null}
              tone="primary"
              onFile={(file) => upload("pdf", file)}
            />
          </div>
          <ul className="mt-4 divide-y divide-zinc-200 rounded-lg border border-zinc-200">
            {pdfs.length === 0 ? <li className="px-3 py-4 text-sm text-zinc-600">No order PDF on this card yet.</li> : null}
            {pdfs.map((file) => (
              <AttachmentRow
                key={file.id}
                file={file}
                renaming={renameId === file.id}
                renameValue={renameValue}
                onRenameValue={setRenameValue}
                onStartRename={() => { setRenameId(file.id); setRenameValue(file.filename); }}
                onRename={() => { act(() => renameCardFile(card.id, file.id, renameValue), "Renamed"); setRenameId(null); }}
                onRemove={() => {
                  if (window.confirm(`Remove ${file.filename} from this card?`)) act(() => removeCardFile(card.id, file.id), "Removed");
                }}
              />
            ))}
          </ul>
          <div className="mt-4 flex flex-col gap-3 border-t border-zinc-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-base font-semibold text-zinc-800">Photos</h3>
            <UploadControl
              label={uploading === "photo" ? "Uploading…" : "Add photo"}
              accept="image/*"
              disabled={uploading !== null}
              tone="outline"
              onFile={(file) => upload("photo", file)}
            />
          </div>
          {photos.length ? (
            <ul className="mt-3 divide-y divide-zinc-200 rounded-lg border border-zinc-200">
              {photos.map((file) => (
                <AttachmentRow
                  key={file.id}
                  file={file}
                  renaming={renameId === file.id}
                  renameValue={renameValue}
                  onRenameValue={setRenameValue}
                  onStartRename={() => { setRenameId(file.id); setRenameValue(file.filename); }}
                  onRename={() => { act(() => renameCardFile(card.id, file.id, renameValue), "Renamed"); setRenameId(null); }}
                  onCover={file.mimeType.startsWith("image/") ? () => act(() => makeCover(card.id, file.id), "Cover updated") : undefined}
                  onRemove={() => {
                    if (window.confirm(`Remove ${file.filename} from this card?`)) act(() => removeCardFile(card.id, file.id), "Removed");
                  }}
                />
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">No photos. A photo can be the card cover.</p>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-zinc-700">Client</h2>
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
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold leading-snug">
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

        <section>
          <h2 className="mb-3 text-lg font-semibold leading-snug">Materials</h2>
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
          <h2 className="mb-3 text-lg font-semibold leading-snug">Labels and people</h2>
          <div className="flex flex-wrap gap-1.5">
            {board.labels.map((label) => {
              const on = card.labels.some((item) => item.id === label.id);
              return (
                <button key={label.id} type="button" onClick={() => act(() => changeLabel(card.id, label.id), on ? "Label removed" : "Label added")} className="rounded-full border px-2.5 py-1 text-sm leading-snug" style={{ borderColor: label.color, background: on ? `${label.color}55` : "transparent" }}>
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
            <h2 className="mb-3 text-lg font-semibold leading-snug">{list.title}</h2>
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
          <h2 className="mb-3 text-lg font-semibold leading-snug">Notes</h2>
          <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); act(() => createNote(card.id, note), "Note added"); setNote(""); }}>
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="What should the next person know?" className="border-zinc-300 bg-white" />
            <Button type="submit" disabled={!note.trim()}>Add note</Button>
          </form>
          <ul className="mt-4 space-y-3">
            {card.notes.length === 0 ? <li className="text-sm text-zinc-500">No notes yet.</li> : null}
            {card.notes.map((entry) => (
              <li key={entry.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
                <p className="text-sm leading-snug text-zinc-600">{entry.authorName} · {formatStamp(entry.createdAt)}</p>
                <p className="mt-1 text-sm whitespace-pre-wrap">{entry.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold leading-snug">Activity</h2>
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
            <h2 className="mb-2 text-lg font-semibold leading-snug">Other pieces</h2>
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

type AttachmentFile = CardDetail["attachments"][number];

function isPdfAttachment(file: AttachmentFile) {
  return file.mimeType === "application/pdf" || file.filename.toLowerCase().endsWith(".pdf");
}

function UploadControl({
  label,
  accept,
  disabled,
  tone,
  onFile,
}: {
  label: string;
  accept: string;
  disabled: boolean;
  tone: "primary" | "outline";
  onFile: (file: File) => void;
}) {
  const primary = tone === "primary";
  return (
    <label
      className={`inline-flex h-11 min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium sm:w-auto ${
        disabled ? "pointer-events-none opacity-50" : ""
      } ${primary ? "bg-primary text-primary-foreground" : "border border-zinc-300 bg-white text-zinc-900"}`}
    >
      <Upload className="size-4" aria-hidden />
      {label}
      <input
        type="file"
        accept={accept}
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          const input = event.currentTarget;
          const file = input.files?.[0];
          input.value = "";
          if (file) onFile(file);
        }}
      />
    </label>
  );
}

function AttachmentRow({
  file,
  renaming,
  renameValue,
  onRenameValue,
  onStartRename,
  onRename,
  onCover,
  onRemove,
}: {
  file: AttachmentFile;
  renaming: boolean;
  renameValue: string;
  onRenameValue: (value: string) => void;
  onStartRename: () => void;
  onRename: () => void;
  onCover?: () => void;
  onRemove: () => void;
}) {
  const src = `/api/attachments/${file.id}`;
  const image = file.mimeType.startsWith("image/");
  const action = "inline-flex h-11 min-h-11 min-w-[7.5rem] flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-900 hover:bg-zinc-50 sm:flex-none";
  return (
    <li className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="size-12 shrink-0 rounded object-cover" />
        ) : (
          <span className="grid size-12 shrink-0 place-items-center rounded border border-zinc-200 bg-zinc-100 text-xs font-semibold text-zinc-800">PDF</span>
        )}
        <div className="min-w-0 flex-1">
          {renaming ? (
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                onRename();
              }}
            >
              <Input value={renameValue} onChange={(event) => onRenameValue(event.target.value)} className="h-11 border-zinc-300 bg-white" aria-label="New file name" />
              <Button type="submit" className="h-11 min-h-11 px-3">Save</Button>
            </form>
          ) : (
            <p className="truncate font-medium">{file.filename}</p>
          )}
          <p className="text-sm leading-snug text-zinc-600">
            Added {formatAdded(file.createdAt)}
            {file.isCover ? " · Cover" : ""}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 sm:shrink-0">
        <a href={src} target="_blank" rel="noreferrer" aria-label={`Open ${file.filename}`} className={action}>
          <ExternalLink className="size-4" aria-hidden />
          Open
        </a>
        <a href={`${src}?download=1`} download={file.filename} aria-label={`Download ${file.filename}`} className={action}>
          <Download className="size-4" aria-hidden />
          Download
        </a>
        <button type="button" aria-label={`Remove ${file.filename}`} className={`${action} text-red-800`} onClick={onRemove}>
          Remove
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger aria-label={`More actions for ${file.filename}`} className="inline-flex h-11 min-h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50">
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onCover ? <DropdownMenuItem onClick={onCover}>Make cover</DropdownMenuItem> : null}
            <DropdownMenuItem onClick={onStartRename}>Rename</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
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
