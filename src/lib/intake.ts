import { z } from "zod";
import { BOT_NAME } from "./config";
import { CardError, type CardInput } from "./board-types";
import { listDiscontinued, reapplyDiscontinuedFlags, removeDiscontinued, replaceDiscontinued } from "./discontinued";
import { D1_MAX_BOUND_PARAMETERS } from "./d1";
import { all, transaction } from "./db";
import { getCard, piecesForWorkOrder } from "./queries";
import { applyStockCheck } from "./stock-sync";
import { removeUpload } from "./storage";
import { addNote, attachFile, createWorkCard, moveCard, setMaterialLines, updateWorkCard } from "./writes";

const actor = { name: BOT_NAME, userId: null as string | null };

const materialSchema = z.object({
  kind: z.string(),
  itemCode: z.string().min(1),
  vendor: z.string().optional(),
  stockStatus: z.string().optional(),
  description: z.string().optional(),
});

const pieceSchema = z.object({
  pieceIndex: z.number().int().positive().optional(),
  pieceCount: z.number().int().positive().optional(),
  size: z.string().optional(),
  dimensions: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  sharedMats: z.string().optional(),
  artDescription: z.string().optional(),
  artLocation: z.string().optional(),
  artCondition: z.string().optional(),
  connectedOrders: z.string().optional(),
  additionalContact: z.string().optional(),
  customerRecordId: z.string().nullable().optional(),
  labels: z.array(z.string()).optional(),
  assignees: z.array(z.string()).optional(),
  customFields: z.record(z.string(), z.string()).optional(),
  materials: z.array(materialSchema).optional(),
});

const orderSchema = z.object({
  workOrderNumber: z.string().min(1),
  invoiceNumber: z.string().optional(),
  customerName: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  list: z.string().optional(),
  forceList: z.boolean().optional(),
  size: z.string().optional(),
  dimensions: z.string().optional(),
  pieceIndex: z.number().int().positive().optional(),
  pieceCount: z.number().int().positive().optional(),
  sharedMats: z.string().optional(),
  artDescription: z.string().optional(),
  artLocation: z.string().optional(),
  artCondition: z.string().optional(),
  connectedOrders: z.string().optional(),
  additionalContact: z.string().optional(),
  customerRecordId: z.string().nullable().optional(),
  labels: z.array(z.string()).optional(),
  assignees: z.array(z.string()).optional(),
  customFields: z.record(z.string(), z.string()).optional(),
  materials: z.array(materialSchema).optional(),
  pieces: z.array(pieceSchema).optional(),
});

type OrderBody = z.infer<typeof orderSchema>;

function piecesOf(body: OrderBody) {
  const source = body.pieces?.length
    ? body.pieces
    : [
        {
          pieceIndex: body.pieceIndex,
          pieceCount: body.pieceCount,
          size: body.size,
          dimensions: body.dimensions,
          dueDate: body.dueDate,
          startDate: body.startDate,
          sharedMats: body.sharedMats,
          artDescription: body.artDescription,
          artLocation: body.artLocation,
          artCondition: body.artCondition,
          connectedOrders: body.connectedOrders,
          additionalContact: body.additionalContact,
          customerRecordId: body.customerRecordId,
          labels: body.labels,
          assignees: body.assignees,
          customFields: body.customFields,
          materials: body.materials,
        },
      ];
  return source.map((piece, index) => ({
    pieceIndex: piece.pieceIndex ?? index + 1,
    pieceCount: piece.pieceCount ?? source.length,
    size: piece.size ?? body.size ?? "",
    dimensions: piece.dimensions ?? body.dimensions,
    dueDate: piece.dueDate === undefined ? body.dueDate : piece.dueDate,
    startDate: piece.startDate === undefined ? body.startDate : piece.startDate,
    sharedMats: piece.sharedMats ?? body.sharedMats,
    artDescription: piece.artDescription ?? body.artDescription,
    artLocation: piece.artLocation ?? body.artLocation,
    artCondition: piece.artCondition ?? body.artCondition,
    connectedOrders: piece.connectedOrders ?? body.connectedOrders,
    additionalContact: piece.additionalContact ?? body.additionalContact,
    customerRecordId: piece.customerRecordId === undefined ? body.customerRecordId : piece.customerRecordId,
    labels: piece.labels ?? body.labels,
    assignees: piece.assignees ?? body.assignees,
    customFields: piece.customFields ?? body.customFields,
    materials: piece.materials ?? body.materials,
  }));
}

function toInput(body: OrderBody, piece: ReturnType<typeof piecesOf>[number], existing: boolean): CardInput {
  return {
    customerName: body.customerName,
    phone: body.phone,
    email: body.email,
    workOrderNumber: body.workOrderNumber,
    invoiceNumber: body.invoiceNumber,
    pieceIndex: piece.pieceIndex,
    pieceCount: piece.pieceCount,
    size: piece.size,
    dimensions: piece.dimensions,
    dueDate: piece.dueDate,
    startDate: piece.startDate,
    sharedMats: piece.sharedMats,
    artDescription: piece.artDescription,
    artLocation: piece.artLocation,
    artCondition: piece.artCondition,
    connectedOrders: piece.connectedOrders,
    additionalContact: piece.additionalContact,
    customerRecordId: piece.customerRecordId,
    labelNames: piece.labels,
    assigneeEmails: piece.assignees,
    customFields: piece.customFields,
    materials: piece.materials,
    replaceMaterials: Boolean(piece.materials),
    listName: body.list,
    forceList: existing ? Boolean(body.forceList) : true,
    ensureDefaults: true,
  };
}

export async function upsertOrder(body: unknown) {
  const parsed = orderSchema.safeParse(body);
  if (!parsed.success) {
    throw new CardError("Invalid order payload.", 400);
  }
  const data = parsed.data;
  const pieces = piecesOf(data);
  const existing = await piecesForWorkOrder(data.workOrderNumber);
  const results = [];
  for (const piece of pieces) {
    const match = existing.find((row) => row.piece_index === piece.pieceIndex);
    if (match) {
      const updated = await updateWorkCard(match.id, toInput(data, piece, true), actor);
      const card = await getCard(match.id);
      results.push({ action: "updated" as const, id: match.id, pieceIndex: piece.pieceIndex, list: updated.listName, title: card?.title ?? "" });
    } else {
      const created = await createWorkCard(toInput(data, piece, false), actor);
      const card = await getCard(created.id);
      results.push({ action: "created" as const, id: created.id, pieceIndex: piece.pieceIndex, list: created.listName, title: card?.title ?? "" });
    }
  }
  const linkedOrders = data.invoiceNumber
    ? await all<{ id: string; work_order_number: string | null; piece_index: number | null }>(
        `select id, work_order_number, piece_index from cards
         where invoice_number = ? and work_order_number != ?
         order by work_order_number, piece_index`,
        [data.invoiceNumber, data.workOrderNumber],
      )
    : [];
  return {
    workOrderNumber: data.workOrderNumber,
    invoiceNumber: data.invoiceNumber ?? null,
    results,
    linkedOrders: linkedOrders.map((row) => ({
      id: row.id,
      workOrderNumber: row.work_order_number,
      pieceIndex: row.piece_index,
    })),
  };
}

export async function deleteOrder(workOrder: string) {
  const pieces = await piecesForWorkOrder(workOrder);
  if (!pieces.length) throw new CardError(`No card for work order ${workOrder}.`, 404);
  const ids = pieces.map((piece) => piece.id);
  const files: { storage_key: string }[] = [];
  for (let index = 0; index < ids.length; index += D1_MAX_BOUND_PARAMETERS) {
    const chunk = ids.slice(index, index + D1_MAX_BOUND_PARAMETERS);
    const rows = await all<{ storage_key: string }>(
      `select storage_key from attachments where card_id in (${chunk.map(() => "?").join(", ")})`,
      chunk,
    );
    files.push(...rows);
  }
  await transaction(async (tx) => {
    for (const piece of pieces) {
      await tx.run(
        "delete from checklist_items where checklist_id in (select id from checklists where card_id = ?)",
        [piece.id],
      );
      await tx.run("delete from checklists where card_id = ?", [piece.id]);
      await tx.run("delete from activity where card_id = ?", [piece.id]);
      await tx.run("delete from notes where card_id = ?", [piece.id]);
      await tx.run("delete from attachments where card_id = ?", [piece.id]);
      await tx.run("delete from material_lines where card_id = ?", [piece.id]);
      await tx.run("delete from card_field_values where card_id = ?", [piece.id]);
      await tx.run("delete from card_labels where card_id = ?", [piece.id]);
      await tx.run("delete from card_assignees where card_id = ?", [piece.id]);
      await tx.run("delete from cards where id = ?", [piece.id]);
    }
  });
  for (const file of files) await removeUpload(file.storage_key);
  return { workOrderNumber: workOrder, deleted: pieces.map((piece) => piece.id) };
}

export async function readOrder(workOrder: string) {
  const pieces = await piecesForWorkOrder(workOrder);
  if (!pieces.length) throw new CardError(`No card for work order ${workOrder}.`, 404);
  const cards = [];
  for (const piece of pieces) {
    const card = await getCard(piece.id);
    if (card) cards.push(card);
  }
  return { workOrderNumber: workOrder, cards };
}

export async function moveOrder(workOrder: string, body: unknown) {
  const parsed = z.object({ list: z.string().min(1), pieceIndex: z.number().int().positive().optional() }).safeParse(body);
  if (!parsed.success) throw new CardError("Provide a list name.");
  const pieces = await piecesForWorkOrder(workOrder);
  if (!pieces.length) throw new CardError(`No card for work order ${workOrder}.`, 404);
  const targets = parsed.data.pieceIndex ? pieces.filter((piece) => piece.piece_index === parsed.data.pieceIndex) : pieces;
  if (!targets.length) throw new CardError(`Work order ${workOrder} has no piece ${parsed.data.pieceIndex}.`, 404);
  const moved = [];
  for (const target of targets) {
    const result = await moveCard(target.id, parsed.data.list, actor);
    moved.push({ id: target.id, pieceIndex: target.piece_index, ...result });
  }
  return { workOrderNumber: workOrder, moved };
}

export async function noteOrder(workOrder: string, body: unknown) {
  const parsed = z.object({ body: z.string().min(1), pieceIndex: z.number().int().positive().optional() }).safeParse(body);
  if (!parsed.success) throw new CardError("Note body is required.");
  const pieces = await targetPieces(workOrder, parsed.data.pieceIndex);
  for (const piece of pieces) await addNote(piece.id, parsed.data.body, actor);
  return { workOrderNumber: workOrder, noted: pieces.map((piece) => piece.piece_index) };
}

export async function stockOrder(workOrder: string, body: unknown) {
  const parsed = z.object({
    pieceIndex: z.number().int().positive().optional(),
    materials: z.array(z.object({
      kind: z.string(),
      itemCode: z.string().optional(),
      stockStatus: z.string(),
      description: z.string().optional(),
    })).min(1),
  }).safeParse(body);
  if (!parsed.success) throw new CardError("Provide materials with kind and stockStatus. Include itemCode when a card has more than one line of that kind.");
  const pieces = await targetPieces(workOrder, parsed.data.pieceIndex);
  for (const piece of pieces) await setMaterialLines(piece.id, parsed.data.materials, actor);
  const described = parsed.data.materials.filter((line) => line.itemCode && line.description && /discontinued/i.test(line.description));
  if (described.length) {
    await replaceDiscontinued(described.map((line) => ({ code: line.itemCode ?? "", note: line.description })), "add");
    await reapplyDiscontinuedFlags(actor);
  }
  return { workOrderNumber: workOrder, updated: pieces.map((piece) => piece.piece_index) };
}

export async function attachOrder(workOrder: string, pieceIndex: number | undefined, file: { filename: string; mimeType: string; bytes: Buffer }) {
  const pieces = await targetPieces(workOrder, pieceIndex);
  if (pieces.length !== 1) throw new CardError("Provide pieceIndex when a work order has more than one piece.");
  await attachFile(pieces[0].id, file, actor);
  return { workOrderNumber: workOrder, pieceIndex: pieces[0].piece_index, filename: file.filename, cardId: pieces[0].id };
}

export async function readDiscontinuedMats() {
  return { codes: await listDiscontinued() };
}

export async function writeDiscontinuedMats(body: unknown) {
  const parsed = z.object({
    codes: z.array(z.union([z.string(), z.object({ code: z.string(), note: z.string().optional() })])).min(1),
    mode: z.enum(["add", "replace"]).optional(),
  }).safeParse(body);
  if (!parsed.success) throw new CardError("Provide codes, and optionally mode add or replace.");
  const entries = parsed.data.codes.map((entry) => (typeof entry === "string" ? { code: entry } : entry));
  const codes = await replaceDiscontinued(entries, parsed.data.mode ?? "add");
  const updated = await reapplyDiscontinuedFlags(actor);
  return { codes, updated };
}

export async function deleteDiscontinuedMats(body: unknown) {
  const parsed = z.object({ codes: z.array(z.string()).min(1) }).safeParse(body);
  if (!parsed.success) throw new CardError("Provide codes to remove.");
  const codes = await removeDiscontinued(parsed.data.codes);
  const updated = await reapplyDiscontinuedFlags(actor);
  return { codes, updated };
}

export async function syncStock(body: unknown) {
  return applyStockCheck(body, actor.name);
}

async function targetPieces(workOrder: string, pieceIndex?: number) {
  const pieces = await piecesForWorkOrder(workOrder);
  if (!pieces.length) throw new CardError(`No card for work order ${workOrder}.`, 404);
  if (!pieceIndex) {
    if (pieces.length > 1) throw new CardError("Provide pieceIndex. This work order has more than one piece.");
    return pieces;
  }
  const match = pieces.filter((piece) => piece.piece_index === pieceIndex);
  if (!match.length) throw new CardError(`Work order ${workOrder} has no piece ${pieceIndex}.`, 404);
  return match;
}
