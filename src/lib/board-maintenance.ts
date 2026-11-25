import { randomUUID } from "crypto";
import { isRedoAlias, isRemovedList, REDO_LIST_NAME } from "./board-lists";
import { all, run, transaction } from "./db";
import { removeUpload } from "./storage";

/**
 * Rename Jersey Reduce / Jersey Re-Do's to Re-do's without changing the list id,
 * so cards stay in the column. Safe to run more than once.
 */
export async function renameRedoList(): Promise<boolean> {
  const lists = await all<{ id: string; name: string }>("select id, name from lists");
  const current = lists.find((list) => list.name === REDO_LIST_NAME);
  const alias = lists.find((list) => isRedoAlias(list.name));
  if (!alias) return false;
  if (current && current.id !== alias.id) {
    await transaction(async (tx) => {
      await tx.run("update cards set list_id = ? where list_id = ?", [current.id, alias.id]);
      await tx.run("delete from lists where id = ?", [alias.id]);
    });
    return true;
  }
  await run("update lists set name = ? where id = ?", [REDO_LIST_NAME, alias.id]);
  return true;
}

export type RetiredLists = { lists: string[]; cards: number };

/**
 * Delete only the six unused lists and the cards that are in them.
 * Other lists and their cards are not read for deletion.
 */
export async function removeUnusedLists(): Promise<RetiredLists> {
  const lists = await all<{ id: string; name: string }>("select id, name from lists");
  const doomed = lists.filter((list) => isRemovedList(list.name));
  if (!doomed.length) return { lists: [], cards: 0 };

  const removedNames: string[] = [];
  let cards = 0;
  for (const list of doomed) {
    const rows = await all<{ id: string }>("select id from cards where list_id = ?", [list.id]);
    const ids = rows.map((row) => row.id);
    const files: { storage_key: string }[] = [];
    for (const id of ids) {
      const stored = await all<{ storage_key: string }>("select storage_key from attachments where card_id = ?", [id]);
      files.push(...stored);
    }
    await transaction(async (tx) => {
      for (const id of ids) {
        await tx.run("delete from checklist_items where checklist_id in (select id from checklists where card_id = ?)", [id]);
        await tx.run("delete from checklists where card_id = ?", [id]);
        await tx.run("delete from activity where card_id = ?", [id]);
        await tx.run("delete from notes where card_id = ?", [id]);
        await tx.run("delete from attachments where card_id = ?", [id]);
        await tx.run("delete from material_lines where card_id = ?", [id]);
        await tx.run("delete from card_field_values where card_id = ?", [id]);
        await tx.run("delete from card_labels where card_id = ?", [id]);
        await tx.run("delete from card_assignees where card_id = ?", [id]);
        await tx.run("delete from cards where id = ?", [id]);
      }
      await tx.run("delete from lists where id = ?", [list.id]);
      await tx.run(
        `insert into meta (key, value) values (?, ?)
         on conflict(key) do update set value = excluded.value`,
        ["board_revision", randomUUID()],
      );
    });
    for (const file of files) {
      try {
        await removeUpload(file.storage_key);
      } catch (error) {
        console.error(`Could not delete attachment ${file.storage_key}`, error);
      }
    }
    removedNames.push(list.name);
    cards += ids.length;
  }
  if (removedNames.length) {
    console.log(`Retired unused lists (${cards} cards deleted): ${removedNames.join(", ")}`);
  }
  return { lists: removedNames, cards };
}

/** Glass and foam are shop pack stock. They are never left as To Order or On Order. */
export async function normalizePackMaterials(): Promise<number> {
  const rows = await all<{ id: string }>(
    "select id from material_lines where kind in ('glazing', 'backing') and stock_status in ('not_in_stock', 'ordered')",
  );
  if (!rows.length) return 0;
  await transaction(async (tx) => {
    await tx.run(
      "update material_lines set stock_status = 'in_stock' where kind in ('glazing', 'backing') and stock_status in ('not_in_stock', 'ordered')",
    );
  });
  return rows.length;
}

/** The Production checklist is no longer part of a card. */
export async function removeProductionChecklists(): Promise<number> {
  const lists = await all<{ id: string }>("select id from checklists where title = ?", ["Production"]);
  if (!lists.length) return 0;
  await transaction(async (tx) => {
    await tx.run("delete from checklist_items where checklist_id in (select id from checklists where title = ?)", ["Production"]);
    await tx.run("delete from checklists where title = ?", ["Production"]);
  });
  return lists.length;
}
