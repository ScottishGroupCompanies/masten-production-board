import { z } from "zod";
import { BOT_NAME } from "./config";
import { CardError, type CardInput } from "./board-types";
import { getCard, piecesForWorkOrder } from "./queries";
import { addNote, attachFile, createWorkCard, moveCard, setMaterialLines, updateWorkCard } from "./writes";

const actor = { name: BOT_NAME, userId: null as string | null };

const materialSchema = z.object({
  kind: z.string(),
  itemCode: z.string().min(1),
  vendor: z.string().optional(),
  stockStatus: z.string().optional(),
});

const pieceSchema = z.object({
  pieceIndex: z.number().int().positive().optional(),
  pieceCount: z.number().int().positive().optional(),
  size: z.string().optional(),
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
  dueDate: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  list: z.string().optional(),
  forceList: z.boolean().optional(),
  size: z.string().optional(),
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
    size: piece.size ?? "",
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
    workOrderNumber: body.workOrderNumber,
    invoiceNumber: body.invoiceNumber,
    pieceIndex: piece.pieceIndex,
    pieceCount: piece.pieceCount,
    size: piece.size,
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
  return { workOrderNumber: data.workOrderNumber, results };
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
    materials: z.array(z.object({ kind: z.string(), itemCode: z.string(), stockStatus: z.string() })).min(1),
  }).safeParse(body);
  if (!parsed.success) throw new CardError("Provide materials with kind, itemCode, and stockStatus.");
  const pieces = await targetPieces(workOrder, parsed.data.pieceIndex);
  for (const piece of pieces) await setMaterialLines(piece.id, parsed.data.materials, actor);
  return { workOrderNumber: workOrder, updated: pieces.map((piece) => piece.piece_index) };
}

export async function attachOrder(workOrder: string, pieceIndex: number | undefined, file: { filename: string; mimeType: string; bytes: Buffer }) {
  const pieces = await targetPieces(workOrder, pieceIndex);
  if (pieces.length !== 1) throw new CardError("Provide pieceIndex when a work order has more than one piece.");
  await attachFile(pieces[0].id, file, actor);
  return { workOrderNumber: workOrder, pieceIndex: pieces[0].piece_index, filename: file.filename, cardId: pieces[0].id };
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
