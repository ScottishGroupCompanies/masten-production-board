"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
  editMaterial,
  makeCover,
  moveCardTo,
  removeCardFile,
  removeMaterial,
  renameCardFile,
  saveCard,
  saveWorkingNotes,
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
import { CUSTOM_FIELD_KIND, MATERIAL_KINDS, STOCK_STATUSES, kindLabel, statusLabel } from "@/data/board-schema";
import { tidyContact } from "@/lib/contact";
import type { BoardData, CardDetail, MaterialView } from "@/lib/board-types";
import { formatAdded, formatShopDate, formatStamp, initials } from "@/lib/format";

type Action = { ok: boolean; error?: string };

export function CardDetailView({
  card,
  board,
  onOpenCard,
}: {
  card: CardDetail;
  board: BoardData;
  onOpenCard?: (id: string) => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
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
            {card.overdue ? <span className="rounded-full bg-red-700 px-2 py-1 text-xs font-semibold text-white">Overdue {formatShopDate(card.dueDate)}</span> : null}
          </div>
        </div>
        <p className="text-sm text-zinc-600">
          {card.phone ? <span>{card.phone}</span> : null}
          {card.email ? (
            <>
              {card.phone ? " · " : null}
              <a className="text-sky-800 underline" href={`mailto:${card.email}`}>{card.email}</a>
            </>
          ) : null}
        </p>

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
                  email: String(data.get("email") ?? ""),
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
            <DarkField name="email" label="Email" type="email" defaultValue={card.email} />
            <DarkField name="size" label="Dimensions" defaultValue={card.size} />
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
            <div className="space-y-2 sm:col-span-2">
              <h3 className="text-sm font-medium text-zinc-700">Connected orders</h3>
              {card.invoiceMates.length ? (
                <ul className="space-y-1 text-sm">
                  {card.invoiceMates.map((mate) => (
                    <li key={mate.id}>
                      <CardLink id={mate.id} onOpenCard={onOpenCard}>{mate.workOrderNumber ? `W.O. ${mate.workOrderNumber}` : mate.title}</CardLink>
                      <span className="text-zinc-500"> · {mate.listName}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-500">No other work orders share this invoice.</p>
              )}
            </div>
            <DarkArea name="connectedOrders" label="Connected order notes" defaultValue={card.connectedOrders} />
            <DarkArea name="additionalContact" label="Additional Contact Info" defaultValue={tidyContact(card.additionalContact, card.phone, card.email).additional} />
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="customerRecord" className="text-zinc-700">Customer record</Label>
              <select id="customerRecord" name="customerRecord" defaultValue={card.customerRecordId ?? ""} className="h-10 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm">
                <option value="">No linked customer card</option>
                {card.customerRecords.map((record) => (
                  <option key={record.id} value={record.id}>{record.name}</option>
                ))}
              </select>
              {card.customerRecordId ? (
                <CardLink id={card.customerRecordId} onOpenCard={onOpenCard}>
                  Open {card.customerRecordName} on the Master Customer List
                </CardLink>
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

        <section id="materials">
          <h2 className="mb-3 text-lg font-semibold leading-snug">Materials</h2>
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            {card.fields.filter((field) => CUSTOM_FIELD_KIND[field.name] === "art" || CUSTOM_FIELD_KIND[field.name] === "quantity").map((field) => (
              <FieldControl key={field.id} field={field} onChange={(value) => act(() => changeField(card.id, field.id, value))} />
            ))}
          </div>
          <div className="space-y-2">
            {card.materials.map((line) => {
              const field = card.fields.find((item) => CUSTOM_FIELD_KIND[item.name] === line.kind);
              return (
                <MaterialRow
                  key={line.id}
                  line={line}
                  field={field}
                  onChange={(status) => act(() => changeMaterialStatus(line.id, status, card.id))}
                  onEdit={(input) => act(() => editMaterial(card.id, line.id, input))}
                  onField={(value) => {
                    if (!field) return;
                    act(() => changeField(card.id, field.id, value));
                  }}
                  onRemove={() => act(() => removeMaterial(card.id, line.id), "Removed")}
                />
              );
            })}
          </div>
          {card.fields.filter((field) => {
            const kind = CUSTOM_FIELD_KIND[field.name];
            if (!kind || kind === "art" || kind === "quantity") return false;
            return !card.materials.some((line) => line.kind === kind);
          }).length ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {card.fields.filter((field) => {
                const kind = CUSTOM_FIELD_KIND[field.name];
                if (!kind || kind === "art" || kind === "quantity") return false;
                return !card.materials.some((line) => line.kind === kind);
              }).map((field) => (
                <FieldControl key={field.id} field={field} onChange={(value) => act(() => changeField(card.id, field.id, value))} />
              ))}
            </div>
          ) : null}
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
          <LabelPicker
            labels={board.labels}
            selected={card.labels}
            onToggle={(labelId, on) => act(() => changeLabel(card.id, labelId), on ? "Label removed" : "Label added")}
          />
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
          <WorkingNotes cardId={card.id} value={card.workingNotes} />
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
                <li key={sibling.id}><CardLink id={sibling.id} onOpenCard={onOpenCard}>{sibling.title}</CardLink> · {sibling.listName}</li>
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

function MaterialRow({
  line,
  field,
  onChange,
  onEdit,
  onField,
  onRemove,
}: {
  line: MaterialView;
  field?: CardDetail["fields"][number];
  onChange: (status: string) => void;
  onEdit: (input: { itemCode: string; vendor: string; kind: string }) => void;
  onField: (value: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid gap-2 rounded-lg border border-zinc-200 p-2 sm:grid-cols-2">
      <select aria-label="Kind" defaultValue={line.kind} className="h-10 rounded-md border border-zinc-300 bg-white px-2 text-sm" onChange={(event) => onEdit({ kind: event.target.value, itemCode: line.itemCode, vendor: line.vendor })}>
        {MATERIAL_KINDS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
      <Input aria-label="Item code" defaultValue={line.itemCode} className="h-10 border-zinc-300 bg-white" onBlur={(event) => { if (event.target.value !== line.itemCode) onEdit({ kind: line.kind, itemCode: event.target.value, vendor: line.vendor }); }} />
      <Input aria-label="Vendor" defaultValue={line.vendor} placeholder="Vendor" className="h-10 border-zinc-300 bg-white" onBlur={(event) => { if (event.target.value !== line.vendor) onEdit({ kind: line.kind, itemCode: line.itemCode, vendor: event.target.value }); }} />
      <select aria-label={`${kindLabel(line.kind)} stock status`} value={line.stockStatus} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-md border border-zinc-300 bg-white px-2 text-sm">
        {STOCK_STATUSES.map((status) => <option key={status.id} value={status.id}>{statusLabel(status.id)}</option>)}
      </select>
      {field && field.options.length ? (
        <select aria-label={`${field.name} shop status`} value={field.value} onChange={(event) => onField(event.target.value)} className={`h-10 rounded-md border px-2 text-sm sm:col-span-2 ${toneClass(field.value)}`}>
          <option value="">Shop status…</option>
          {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : null}
      <Button type="button" variant="ghost" className="text-zinc-800 sm:col-span-2 sm:justify-self-start" onClick={onRemove}>Remove</Button>
    </div>
  );
}

function FieldControl({ field, onChange }: { field: CardDetail["fields"][number]; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-zinc-700">{field.name}</Label>
      {field.options.length === 0 ? (
        <Input
          type="number"
          min={0}
          defaultValue={field.value}
          aria-label={field.name}
          className="h-10 border-zinc-300 bg-white text-zinc-900"
          onBlur={(event) => {
            if (event.target.value !== field.value) onChange(event.target.value);
          }}
        />
      ) : (
        <select aria-label={field.name} value={field.value} onChange={(event) => onChange(event.target.value)} className={`h-10 w-full rounded-md border px-2 text-sm ${toneClass(field.value)}`}>
          <option value="">Select...</option>
          {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      )}
    </div>
  );
}

function CardLink({ id, onOpenCard, children }: { id: string; onOpenCard?: (id: string) => void; children: React.ReactNode }) {
  if (onOpenCard) {
    return (
      <button type="button" className="text-left text-sm text-sky-800 underline" onClick={() => onOpenCard(id)}>
        {children}
      </button>
    );
  }
  return <Link href={`/cards/${id}`} className="text-sm text-sky-800 underline">{children}</Link>;
}

function LabelPicker({
  labels,
  selected,
  onToggle,
}: {
  labels: BoardData["labels"];
  selected: BoardData["labels"];
  onToggle: (id: string, on: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const selectedIds = new Set(selected.map((label) => label.id));
  const needle = query.trim().toLowerCase();
  const matches = needle ? labels.filter((label) => !selectedIds.has(label.id) && label.name.toLowerCase().includes(needle)) : [];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {selected.map((label) => (
          <button key={label.id} type="button" onClick={() => onToggle(label.id, true)} className="rounded-full border px-2.5 py-1 text-sm leading-snug" style={{ borderColor: label.color, background: `${label.color}55` }}>
            {label.name}
          </button>
        ))}
        {selected.length === 0 ? <p className="text-sm text-zinc-500">No labels yet.</p> : null}
      </div>
      <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search labels" aria-label="Search labels" className="h-10 border-zinc-300 bg-white" />
      {needle ? (
        <div className="flex flex-wrap gap-1.5">
          {matches.length === 0 ? <p className="text-sm text-zinc-500">No label matches.</p> : null}
          {matches.map((label) => (
            <button key={label.id} type="button" onClick={() => { onToggle(label.id, false); setQuery(""); }} className="rounded-full border px-2.5 py-1 text-sm leading-snug" style={{ borderColor: label.color }}>
              {label.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function WorkingNotes({ cardId, value }: { cardId: string; value: string }) {
  const [text, setText] = useState(value);
  const [state, setState] = useState<"saved" | "saving">("saved");
  const saved = useRef(value);
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current && value !== saved.current) {
      saved.current = value;
      setText(value);
    }
  }, [value]);
  useEffect(() => {
    if (text === saved.current) return;
    dirty.current = true;
    setState("saving");
    const handle = window.setTimeout(() => {
      void saveWorkingNotes(cardId, text).then((result) => {
        if (result.ok) {
          saved.current = text;
          dirty.current = false;
          setState("saved");
        }
      });
    }, 700);
    return () => window.clearTimeout(handle);
  }, [text, cardId]);
  return (
    <div className="space-y-1">
      <Textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="What should the next person know?" aria-label="Notes" className="border-zinc-300 bg-white" />
      <p className="text-xs text-zinc-500">{state === "saving" ? "Saving…" : "Saved"}</p>
    </div>
  );
}
