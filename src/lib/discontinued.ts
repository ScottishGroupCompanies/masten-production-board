import { randomUUID } from "crypto";
import type { Actor } from "./board-types";
import { all, transaction } from "./db";
import { MAT_KINDS, codeKey, discontinuedStems, matchesDiscontinued } from "./stock";

export type DiscontinuedMat = {
  code: string;
  rawCode: string;
  note: string;
  createdAt: string;
};

export async function listDiscontinued(): Promise<DiscontinuedMat[]> {
  const rows = await all<{ code: string; raw_code: string; note: string; created_at: string }>(
    "select code, raw_code, note, created_at from discontinued_mats order by raw_code",
  );
  return rows.map((row) => ({
    code: row.code,
    rawCode: row.raw_code,
    note: row.note,
    createdAt: row.created_at,
  }));
}

export async function discontinuedStemSet(): Promise<Set<string>> {
  const rows = await listDiscontinued();
  return discontinuedStems(rows.map((row) => row.code));
}

export async function replaceDiscontinued(entries: { code: string; note?: string }[], mode: "add" | "replace"): Promise<DiscontinuedMat[]> {
  const now = new Date().toISOString();
  const clean = entries
    .map((entry) => ({ code: codeKey(entry.code), raw: entry.code.trim(), note: (entry.note ?? "").trim() }))
    .filter((entry) => entry.code && entry.raw);
  await transaction(async (tx) => {
    if (mode === "replace") await tx.run("delete from discontinued_mats");
    for (const entry of clean) {
      await tx.run(
        `insert into discontinued_mats (code, raw_code, note, created_at) values (?, ?, ?, ?)
         on conflict(code) do update set raw_code = excluded.raw_code, note = case when excluded.note = '' then discontinued_mats.note else excluded.note end`,
        [entry.code, entry.raw, entry.note, now],
      );
    }
  });
  return listDiscontinued();
}

export async function removeDiscontinued(codes: string[]): Promise<DiscontinuedMat[]> {
  const keys = codes.map((code) => codeKey(code)).filter(Boolean);
  if (keys.length) {
    await transaction(async (tx) => {
      for (const key of keys) await tx.run("delete from discontinued_mats where code = ?", [key]);
    });
  }
  return listDiscontinued();
}

/**
 * Discontinued mats that are not In Stock or Here are flagged and kept out of To Order.
 * A code removed from the list goes back to To Order when it was only flagged.
 */
export async function reapplyDiscontinuedFlags(actor: Actor): Promise<number> {
  const stems = await discontinuedStemSet();
  const lines = await all<{ id: string; card_id: string; item_code: string; kind: string; stock_status: string; vendor: string }>(
    "select id, card_id, item_code, kind, stock_status, vendor from material_lines",
  );
  const pending: { id: string; cardId: string; itemCode: string; vendor: string; next: string }[] = [];
  for (const line of lines) {
    if (!MAT_KINDS.has(line.kind as "top_mat")) continue;
    const discontinued = matchesDiscontinued(line.item_code, stems);
    let next = line.stock_status;
    if (discontinued && next !== "in_stock" && next !== "here") next = "discontinued_attention";
    if (!discontinued && next === "discontinued_attention") next = "not_in_stock";
    if (next !== line.stock_status) {
      pending.push({ id: line.id, cardId: line.card_id, itemCode: line.item_code, vendor: line.vendor, next });
    }
  }
  if (!pending.length) return 0;
  const now = new Date().toISOString();
  await transaction(async (tx) => {
    for (const line of pending) {
      await tx.run("update material_lines set stock_status = ? where id = ?", [line.next, line.id]);
      await tx.run("update cards set updated_at = ? where id = ?", [now, line.cardId]);
      await tx.run(
        "insert into activity (id, card_id, actor_name, actor_user_id, kind, summary, created_at) values (?, ?, ?, ?, ?, ?, ?)",
        [
          randomUUID(),
          line.cardId,
          actor.name,
          actor.userId,
          "material_status",
          `${actor.name} set ${line.itemCode}${line.vendor ? ` (${line.vendor})` : ""} to ${nextLabel(line.next)} from the discontinued mat list.`,
          now,
        ],
      );
    }
  });
  return pending.length;
}

function nextLabel(status: string): string {
  if (status === "discontinued_attention") return "Discontinued – not in stock, needs attention";
  if (status === "not_in_stock") return "To Order";
  return status;
}
