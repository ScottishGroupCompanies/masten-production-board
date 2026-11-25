import { randomUUID } from "crypto";
import { z } from "zod";
import { kindLabel, parseKind, statusLabel, type StockStatus } from "@/data/board-schema";
import { CardError } from "./board-types";
import { discontinuedStemSet, replaceDiscontinued } from "./discontinued";
import { all, transaction } from "./db";
import { BOT_NAME } from "./config";
import {
  FRAME_KINDS,
  MAT_KINDS,
  PACK_KINDS,
  codeKey,
  discontinuedStems,
  statusFromSheet,
} from "./stock";

const bodySchema = z.object({
  matsInStock: z.array(z.string()).optional(),
  filletsInStock: z.array(z.string()).optional(),
  discontinuedMats: z.array(z.string()).optional(),
  replaceDiscontinued: z.boolean().optional(),
});

export type StockChange = {
  materialId: string;
  cardId: string;
  workOrderNumber: string | null;
  kind: string;
  itemCode: string;
  from: StockStatus;
  to: StockStatus;
};

/**
 * Apply a mats-in-stock sheet and a fillet inventory sheet to existing cards.
 * Frames are left alone. Glass and foam are left alone and never enter To Order.
 * Omit a sheet to leave that material alone. An empty array means the sheet has no codes.
 */
export async function applyStockCheck(body: unknown, actorName = BOT_NAME) {
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) throw new CardError("Provide matsInStock and/or filletsInStock arrays of item codes.");
  const data = parsed.data;
  if (!data.matsInStock && !data.filletsInStock && !data.discontinuedMats) {
    throw new CardError("Provide matsInStock, filletsInStock, and/or discontinuedMats.");
  }
  if (data.discontinuedMats) {
    await replaceDiscontinued(
      data.discontinuedMats.map((code) => ({ code })),
      data.replaceDiscontinued ? "replace" : "add",
    );
  }
  const stems = await discontinuedStemSet();
  const matCodes = data.matsInStock ? discontinuedStems(data.matsInStock) : null;
  const filletCodes = data.filletsInStock ? new Set(data.filletsInStock.map((code) => codeKey(code)).filter(Boolean)) : null;

  const lines = await all<{
    id: string;
    card_id: string;
    kind: string;
    item_code: string;
    vendor: string;
    stock_status: string;
    work_order_number: string | null;
    archived: number;
  }>(
    `select material_lines.id, material_lines.card_id, material_lines.kind, material_lines.item_code,
            material_lines.vendor, material_lines.stock_status, cards.work_order_number, cards.archived
     from material_lines join cards on cards.id = material_lines.card_id
     where cards.archived = 0`,
  );

  const changes: StockChange[] = [];
  let matsChecked = 0;
  let filletsChecked = 0;
  let framesSkipped = 0;
  let packsSkipped = 0;

  for (const line of lines) {
    const kind = parseKind(line.kind) ?? line.kind;
    if (PACK_KINDS.has(kind as "glazing")) {
      packsSkipped += 1;
      continue;
    }
    if (FRAME_KINDS.has(kind as "frame")) {
      framesSkipped += 1;
      continue;
    }
    const sheet = MAT_KINDS.has(kind as "top_mat") ? matCodes : kind === "fillet" ? filletCodes : null;
    if (!sheet) continue;
    if (MAT_KINDS.has(kind as "top_mat")) matsChecked += 1;
    if (kind === "fillet") filletsChecked += 1;
    const next = statusFromSheet({
      kind,
      itemCode: line.item_code,
      current: line.stock_status as StockStatus,
      inStock: sheet,
      stems,
    });
    if (!next || next === line.stock_status) continue;
    changes.push({
      materialId: line.id,
      cardId: line.card_id,
      workOrderNumber: line.work_order_number,
      kind,
      itemCode: line.item_code,
      from: line.stock_status as StockStatus,
      to: next,
    });
  }

  if (changes.length) {
    const now = new Date().toISOString();
    await transaction(async (tx) => {
      for (const change of changes) {
        await tx.run("update material_lines set stock_status = ? where id = ?", [change.to, change.materialId]);
        await tx.run("update cards set updated_at = ? where id = ?", [now, change.cardId]);
        await tx.run(
          "insert into activity (id, card_id, actor_name, actor_user_id, kind, summary, created_at) values (?, ?, ?, ?, ?, ?, ?)",
          [
            randomUUID(),
            change.cardId,
            actorName,
            null,
            "material_status",
            `${actorName} set ${change.itemCode} (${kindLabel(change.kind)}) to ${statusLabel(change.to)} from the inventory sheet.`,
            now,
          ],
        );
      }
    });
  }

  const limit = 200;
  return {
    mats: data.matsInStock ? { checked: matsChecked, updated: changes.filter((change) => MAT_KINDS.has(change.kind as "top_mat")).length } : null,
    fillets: data.filletsInStock ? { checked: filletsChecked, updated: changes.filter((change) => change.kind === "fillet").length } : null,
    framesSkipped,
    glassAndFoamSkipped: packsSkipped,
    updated: changes.length,
    changesTruncated: changes.length > limit,
    changes: changes.slice(0, limit),
  };
}
