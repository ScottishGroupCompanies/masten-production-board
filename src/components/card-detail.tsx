"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  moveCardTo,
  removeCardFile,
  removeMaterial,
  saveCard,
  uploadCardFile,
} from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MATERIAL_KINDS, STOCK_STATUSES, kindLabel, statusLabel } from "@/data/board-schema";
import type { BoardData, CardDetail, MaterialView } from "@/lib/board-types";
import { formatShopDate, formatStamp, initials } from "@/lib/format";

export function CardDetailView({ card, board }: { card: CardDetail; board: BoardData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [itemText, setItemText] = useState("");
  const [kind, setKind] = useState("top_mat");
  const [itemCode, setItemCode] = useState("");
  const [vendor, setVendor] = useState("");

  function act(work: () => Promise<{ ok: boolean; error?: string }>, message = "Saved") {
    startTransition(async () => {
      const result = await work();
      if (!result.ok) toast.error(result.error ?? "Could not save");
      else toast.success(message);
      router.refresh();
    });
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid max-w-[1400px] gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-4">
          <div>
            <p className="text-xs tracking-wide text-muted-foreground uppercase">{card.listName}</p>
            <h1 className="font-display mt-1 text-3xl leading-tight">{card.title}</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              {card.needsReview ? <Badge className="bg-amber-700 text-white">Needs review</Badge> : null}
              {card.overdue ? <Badge className="bg-red-700 text-white">Overdue {formatShopDate(card.dueDate)}</Badge> : null}
              {card.archived ? <Badge variant="outline">Archived</Badge> : null}
            </div>
          </div>

          <Section title="Job">
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
                    forceList: true,
                    listId: String(data.get("listId") ?? card.listId),
                  }),
                );
              }}
            >
              <TextField name="customer" label="Customer" defaultValue={card.customerName} required className="sm:col-span-2" />
              <TextField name="phone" label="Phone" defaultValue={card.phone} />
              <TextField name="size" label="Size" defaultValue={card.size} />
              <TextField name="workOrder" label="W.O. #" defaultValue={card.workOrderNumber ?? ""} />
              <TextField name="invoice" label="Invoice #" defaultValue={card.invoiceNumber ?? ""} />
              <TextField name="piece" label="Piece" defaultValue={String(card.pieceIndex ?? 1)} />
              <TextField name="of" label="of" defaultValue={String(card.pieceCount ?? 1)} />
              <TextField name="due" label="Due date" type="date" defaultValue={card.dueDate ?? ""} />
              <TextField name="start" label="Start date" type="date" defaultValue={card.startDate ?? ""} />
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="listId">List</Label>
                <select id="listId" name="listId" defaultValue={card.listId} className="min-h-10 w-full rounded-lg border bg-card px-2 text-sm">
                  {board.lists.map((list) => (
                    <option key={list.id} value={list.id}>{list.name}</option>
                  ))}
                </select>
              </div>
              <Area name="sharedMats" label="Shared Mats" defaultValue={card.sharedMats} />
              <Area name="artDescription" label="Art Description" defaultValue={card.artDescription} />
              <Area name="artLocation" label="Art Location" defaultValue={card.artLocation} />
              <Area name="artCondition" label="Art Condition" defaultValue={card.artCondition} />
              <Area name="connectedOrders" label="Connected Orders" defaultValue={card.connectedOrders} />
              <Area name="additionalContact" label="Additional Contact Info" defaultValue={card.additionalContact} />
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="customerRecord">Customer record</Label>
                <select id="customerRecord" name="customerRecord" defaultValue={card.customerRecordId ?? ""} className="min-h-10 w-full rounded-lg border bg-card px-2 text-sm">
                  <option value="">No linked customer card</option>
                  {card.customerRecords.map((record) => (
                    <option key={record.id} value={record.id}>{record.name}</option>
                  ))}
                </select>
                {card.customerRecordId ? (
                  <Link href={`/cards/${card.customerRecordId}`} className="text-sm underline">
                    Open {card.customerRecordName}
                  </Link>
                ) : null}
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={pending}>Save job</Button>
              </div>
            </form>
          </Section>

          <Section title="Custom fields">
            <div className="grid gap-3 sm:grid-cols-2">
              {card.fields.map((field) => (
                <div key={field.id} className="space-y-1.5">
                  <Label>{field.name}</Label>
                  {field.options.length === 0 ? (
                    <Input
                      type="number"
                      min={0}
                      defaultValue={field.value}
                      className="min-h-10"
                      onBlur={(event) => {
                        if (event.target.value !== field.value) act(() => changeField(card.id, field.id, event.target.value));
                      }}
                    />
                  ) : (
                    <Select value={field.value || "none"} onValueChange={(value) => act(() => changeField(card.id, field.id, !value || value === "none" ? "" : value))}>
                      <SelectTrigger className="w-full min-h-10">
                        <SelectValue placeholder="Choose" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {field.options.map((option) => (
                          <SelectItem key={option} value={option}>{option}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ))}
            </div>
          </Section>

          <Section title="Materials">
            <div className="space-y-2">
              {card.materials.map((line) => (
                <MaterialRow key={line.id} line={line} cardId={card.id} onChange={(status) => act(() => changeMaterialStatus(line.id, status, card.id))} onEdit={(input) => act(() => editMaterial(card.id, line.id, input))} onRemove={() => act(() => removeMaterial(card.id, line.id), "Removed")} />
              ))}
              {card.materials.length === 0 ? <p className="text-sm text-muted-foreground">No material lines yet.</p> : null}
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
              <select aria-label="Material kind" value={kind} onChange={(event) => setKind(event.target.value)} className="min-h-10 rounded-lg border bg-card px-2 text-sm">
                {MATERIAL_KINDS.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
              <Input value={itemCode} onChange={(event) => setItemCode(event.target.value)} placeholder="Item code" className="min-h-10" />
              <Input value={vendor} onChange={(event) => setVendor(event.target.value)} placeholder="Vendor" className="min-h-10" />
              <Button type="submit">Add</Button>
            </form>
          </Section>

          <Section title="Labels and people">
            <div className="flex flex-wrap gap-1.5">
              {board.labels.map((label) => {
                const on = card.labels.some((item) => item.id === label.id);
                return (
                  <button key={label.id} type="button" onClick={() => act(() => changeLabel(card.id, label.id), on ? "Label removed" : "Label added")} className="rounded-full border px-2 py-1 text-xs" style={{ borderColor: label.color, background: on ? `${label.color}33` : "transparent" }}>
                    {label.name}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {board.users.map((user) => {
                const on = card.assignees.some((person) => person.id === user.id);
                return (
                  <Button key={user.id} type="button" variant={on ? "default" : "outline"} onClick={() => act(() => changeAssignee(card.id, user.id))}>
                    {initials(user.name)} {user.name}
                  </Button>
                );
              })}
            </div>
          </Section>

          {card.checklists.map((list) => (
            <Section key={list.id} title={list.title}>
              <ul className="space-y-2">
                {list.items.map((item) => (
                  <li key={item.id} className="flex items-start gap-2">
                    <Checkbox checked={item.checked} onCheckedChange={(checked) => act(() => changeCheck(card.id, item.id, Boolean(checked)))} />
                    <span className={item.checked ? "text-muted-foreground line-through" : ""}>{item.text}</span>
                  </li>
                ))}
              </ul>
              <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); act(() => createCheckItem(card.id, itemText)); setItemText(""); }}>
                <Input value={itemText} onChange={(event) => setItemText(event.target.value)} placeholder="Add a step" className="min-h-10" />
                <Button type="submit" variant="outline">Add</Button>
              </form>
            </Section>
          ))}

          <Section title="Notes">
            <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); act(() => createNote(card.id, note), "Note added"); setNote(""); }}>
              <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="What should the next person know?" />
              <Button type="submit" disabled={!note.trim()}>Add note</Button>
            </form>
            <ul className="mt-4 space-y-3">
              {card.notes.length === 0 ? <li className="text-sm text-muted-foreground">No notes yet.</li> : null}
              {card.notes.map((entry) => (
                <li key={entry.id} className="rounded-lg bg-muted/70 px-3 py-2">
                  <p className="text-xs text-muted-foreground">{entry.authorName} · {formatStamp(entry.createdAt)}</p>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{entry.body}</p>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Activity">
            <ul className="space-y-2">
              {card.activity.length === 0 ? <li className="text-sm text-muted-foreground">No activity yet.</li> : null}
              {card.activity.map((event) => (
                <li key={event.id} className="text-sm">
                  <span className="text-muted-foreground">{formatStamp(event.createdAt)}</span>
                  <span> — {event.summary}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Section title="Files">
            <FilePreview card={card} />
            <form className="mt-3 flex items-center gap-2" action={async (formData) => { const result = await uploadCardFile(card.id, formData); if (!result.ok) toast.error(result.error); else { toast.success("Attached"); router.refresh(); } }}>
              <Input name="file" type="file" accept="application/pdf,image/*" className="min-h-10" />
              <Button type="submit">Upload</Button>
            </form>
            <div className="mt-3 flex gap-2">
              <Button type="button" variant="outline" onClick={() => act(() => archiveCard(card.id, !card.archived), card.archived ? "Restored" : "Archived")}>
                {card.archived ? "Unarchive" : "Archive"}
              </Button>
              <Button type="button" variant="outline" onClick={() => act(() => moveCardTo(card.id, "Ready to be Archived"))}>
                Ready to archive
              </Button>
            </div>
          </Section>
          {card.siblings.length ? (
            <Section title="Other pieces">
              <ul className="space-y-2 text-sm">
                {card.siblings.map((sibling) => (
                  <li key={sibling.id}>
                    <Link href={`/cards/${sibling.id}`} className="underline">{sibling.title}</Link>
                    <span className="text-muted-foreground"> · {sibling.listName}</span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
          {card.linkedOrders.length ? (
            <Section title="Orders for this customer">
              <ul className="space-y-2 text-sm">
                {card.linkedOrders.map((order) => (
                  <li key={order.id}>
                    <Link href={`/cards/${order.id}`} className="underline">{order.title}</Link>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="font-display mb-3 text-xl">{title}</h2>
      {children}
    </section>
  );
}

function TextField({ name, label, defaultValue, required, type = "text", className }: { name: string; label: string; defaultValue: string; required?: boolean; type?: string; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={defaultValue} required={required} className="min-h-10" />
    </div>
  );
}

function Area({ name, label, defaultValue }: { name: string; label: string; defaultValue: string }) {
  return (
    <div className="space-y-1.5 sm:col-span-2">
      <Label htmlFor={name}>{label}</Label>
      <Textarea id={name} name={name} defaultValue={defaultValue} />
    </div>
  );
}

function MaterialRow({ line, onChange, onEdit, onRemove }: { line: MaterialView; cardId: string; onChange: (status: string) => void; onEdit: (input: { itemCode: string; vendor: string; kind: string }) => void; onRemove: () => void }) {
  return (
    <div className="grid gap-2 rounded-lg border p-2 sm:grid-cols-[1.2fr_1fr_1fr_1fr_auto]">
      <select aria-label="Kind" defaultValue={line.kind} className="min-h-10 rounded-lg border px-2 text-sm" onChange={(event) => onEdit({ kind: event.target.value, itemCode: line.itemCode, vendor: line.vendor })}>
        {MATERIAL_KINDS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
      <Input aria-label="Item code" defaultValue={line.itemCode} className="min-h-10" onBlur={(event) => { if (event.target.value !== line.itemCode) onEdit({ kind: line.kind, itemCode: event.target.value, vendor: line.vendor }); }} />
      <Input aria-label="Vendor" defaultValue={line.vendor} placeholder="Vendor" className="min-h-10" onBlur={(event) => { if (event.target.value !== line.vendor) onEdit({ kind: line.kind, itemCode: line.itemCode, vendor: event.target.value }); }} />
      <select aria-label={`${kindLabel(line.kind)} stock status`} value={line.stockStatus} onChange={(event) => onChange(event.target.value)} className="min-h-10 rounded-lg border px-2 text-sm">
        {STOCK_STATUSES.map((status) => <option key={status.id} value={status.id}>{statusLabel(status.id)}</option>)}
      </select>
      <Button type="button" variant="ghost" onClick={onRemove}>Remove</Button>
    </div>
  );
}

function FilePreview({ card }: { card: CardDetail }) {
  const router = useRouter();
  const [active, setActive] = useState(card.attachments.find((file) => file.mimeType === "application/pdf")?.id ?? card.attachments[0]?.id ?? "");
  const file = card.attachments.find((item) => item.id === active);
  if (!file) {
    return <p className="text-sm text-muted-foreground">No Lifesaver PDF yet. Order PDFs are named with the invoice number, like {card.invoiceNumber ? `${card.invoiceNumber}.pdf` : "20418.pdf"}.</p>;
  }
  const src = `/api/attachments/${file.id}`;
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1">
        {card.attachments.map((item) => (
          <button key={item.id} type="button" onClick={() => setActive(item.id)} className={`rounded-full border px-2 py-1 text-xs ${item.id === file.id ? "bg-primary text-primary-foreground" : ""}`}>
            {item.filename}
          </button>
        ))}
      </div>
      {file.mimeType === "application/pdf" ? (
        <iframe title={file.filename} src={src} className="h-[480px] w-full rounded-lg border bg-white" />
      ) : file.mimeType.startsWith("image/") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={file.filename} className="max-h-[480px] w-full rounded-lg border object-contain bg-white" />
      ) : (
        <a href={src} className="text-sm underline">Download {file.filename}</a>
      )}
      <button type="button" className="mt-2 text-xs text-muted-foreground underline" onClick={async () => { const result = await removeCardFile(card.id, file.id); if (!result.ok) toast.error(result.error); else router.refresh(); }}>
        Remove {file.filename}
      </button>
    </div>
  );
}
