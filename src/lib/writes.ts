import { randomUUID } from "crypto";
import { CUSTOM_FIELDS, NEW_WORK_ORDERS, PRODUCTION_CHECKLIST, kindLabel, parseKind, parseStatus, statusLabel, type MaterialKind, type StockStatus } from "@/data/board-schema";
import type { Actor, CardInput } from "./board-types";
import { CardError } from "./board-types";
import { get, run, transaction, type Tx } from "./db";
import { removeUpload, safeFilename, saveUpload } from "./storage";

async function activity(tx: Tx, cardId: string, actor: Actor, kind: string, summary: string) {
  await tx.run(
    "insert into activity (id, card_id, actor_name, actor_user_id, kind, summary, created_at) values (?, ?, ?, ?, ?, ?, ?)",
    [randomUUID(), cardId, actor.name, actor.userId, kind, summary, new Date().toISOString()],
  );
}

function isUnique(error: unknown) {
  return String(error).toLowerCase().includes("unique");
}

export function normalizeMaterials(
  lines: { kind: string; itemCode: string; vendor?: string; stockStatus?: string }[] | undefined,
  ensureDefaults: boolean,
) {
  const parsed = (lines ?? []).map((line) => {
    const kind = parseKind(line.kind);
    if (!kind) throw new CardError(`Unknown material kind "${line.kind}".`);
    const stockStatus = line.stockStatus ? parseStatus(line.stockStatus) : null;
    if (line.stockStatus && !stockStatus) throw new CardError(`Unknown stock status "${line.stockStatus}".`);
    const status: StockStatus = stockStatus ?? "needs_human_check";
    return { kind, itemCode: line.itemCode.trim(), vendor: (line.vendor ?? "").trim(), stockStatus: status };
  });
  if (ensureDefaults && !parsed.some((line) => line.kind === "frame")) {
    parsed.unshift({ kind: "frame", itemCode: "Unspecified", vendor: "", stockStatus: "needs_human_check" });
  }
  if (ensureDefaults && !parsed.some((line) => line.kind === "glazing")) {
    parsed.push({ kind: "glazing", itemCode: "Unspecified", vendor: "", stockStatus: "needs_human_check" });
  }
  for (const line of parsed) {
    if (!line.itemCode) throw new CardError("Every material line needs an item code.");
    if ((line.kind === "frame" || line.kind === "glazing") && !lines?.find((raw) => parseKind(raw.kind) === line.kind && raw.stockStatus)) {
      line.stockStatus = "needs_human_check";
    }
  }
  return parsed;
}

async function resolveList(tx: Tx, listName?: string, listId?: string) {
  if (listId) {
    const row = await tx.all<{ id: string; name: string }>("select id, name from lists where id = ?", [listId]);
    if (!row[0]) throw new CardError("That list does not exist.", 404);
    return row[0];
  }
  const name = listName || NEW_WORK_ORDERS;
  const row = await tx.all<{ id: string; name: string }>("select id, name from lists where name = ?", [name]);
  if (!row[0]) {
    const names = await tx.all<{ name: string }>("select name from lists order by position");
    throw new CardError(`Unknown list "${name}". Lists: ${names.map((item) => item.name).join(", ")}`);
  }
  return row[0];
}

async function resolveLabels(tx: Tx, names: string[] | undefined) {
  if (!names) return null;
  const ids: string[] = [];
  for (const name of names) {
    const rows = await tx.all<{ id: string }>("select id from labels where lower(name) = lower(?)", [name]);
    if (!rows[0]) throw new CardError(`Unknown label "${name}".`);
    ids.push(rows[0].id);
  }
  return ids;
}

async function resolveAssignees(tx: Tx, emails: string[] | undefined) {
  if (!emails) return null;
  const ids: string[] = [];
  for (const email of emails) {
    const rows = await tx.all<{ id: string }>("select id from users where email = ?", [email.trim().toLowerCase()]);
    if (!rows[0]) throw new CardError(`Unknown assignee "${email}".`);
    ids.push(rows[0].id);
  }
  return ids;
}

async function resolveFields(tx: Tx, values: Record<string, string> | undefined) {
  if (!values) return null;
  const pairs: { fieldId: string; label: string }[] = [];
  for (const [name, label] of Object.entries(values)) {
    const fields = await tx.all<{ id: string }>("select id from custom_fields where name = ?", [name]);
    if (!fields[0]) throw new CardError(`Unknown custom field "${name}".`);
    const definition = CUSTOM_FIELDS.find((field) => field.name === name);
    if (definition?.type === "number") {
      if (label && !/^\d+(\.\d+)?$/.test(label)) throw new CardError(`${name} must be a number.`);
    } else if (label) {
      const option = await tx.all<{ label: string }>(
        "select label from custom_field_options where field_id = ? and label = ?",
        [fields[0].id, label],
      );
      if (!option[0]) {
        const allowed = definition?.options ?? [];
        throw new CardError(`"${label}" is not an option for ${name}. Options: ${allowed.join(", ")}`);
      }
    }
    pairs.push({ fieldId: fields[0].id, label });
  }
  return pairs;
}

async function writeChildren(
  tx: Tx,
  cardId: string,
  labels: string[] | null,
  assignees: string[] | null,
  fields: { fieldId: string; label: string }[] | null,
  materials: { kind: MaterialKind; itemCode: string; vendor: string; stockStatus: StockStatus }[] | null,
) {
  if (labels) {
    await tx.run("delete from card_labels where card_id = ?", [cardId]);
    for (const labelId of labels) await tx.run("insert into card_labels (card_id, label_id) values (?, ?)", [cardId, labelId]);
  }
  if (assignees) {
    await tx.run("delete from card_assignees where card_id = ?", [cardId]);
    for (const userId of assignees) await tx.run("insert into card_assignees (card_id, user_id) values (?, ?)", [cardId, userId]);
  }
  if (fields) {
    for (const field of fields) {
      await tx.run("delete from card_field_values where card_id = ? and field_id = ?", [cardId, field.fieldId]);
      if (field.label) {
        await tx.run("insert into card_field_values (card_id, field_id, option_label) values (?, ?, ?)", [cardId, field.fieldId, field.label]);
      }
    }
  }
  if (materials) {
    await tx.run("delete from material_lines where card_id = ?", [cardId]);
    for (const [index, line] of materials.entries()) {
      await tx.run(
        "insert into material_lines (id, card_id, position, kind, item_code, vendor, stock_status) values (?, ?, ?, ?, ?, ?, ?)",
        [randomUUID(), cardId, index, line.kind, line.itemCode, line.vendor, line.stockStatus],
      );
    }
  }
}

async function ensureChecklist(tx: Tx, cardId: string) {
  const existing = await tx.all<{ id: string }>("select id from checklists where card_id = ? limit 1", [cardId]);
  if (existing[0]) return;
  const checklistId = randomUUID();
  await tx.run("insert into checklists (id, card_id, title, position) values (?, ?, ?, 0)", [checklistId, cardId, PRODUCTION_CHECKLIST.title]);
  for (const [index, text] of PRODUCTION_CHECKLIST.items.entries()) {
    await tx.run("insert into checklist_items (id, checklist_id, text, checked, position) values (?, ?, ?, 0, ?)", [
      randomUUID(),
      checklistId,
      text,
      index,
    ]);
  }
}

export async function createWorkCard(input: CardInput, actor: Actor) {
  return transaction(async (tx) => {
    const list = await resolveList(tx, input.listName, input.listId);
    const workOrder = input.workOrderNumber?.trim() || null;
    const pieceIndex = workOrder ? input.pieceIndex || 1 : null;
    const pieceCount = workOrder ? input.pieceCount || 1 : null;
    const id = randomUUID();
    const now = new Date().toISOString();
    const positionRow = await tx.all<{ position: number }>("select coalesce(max(position), -1000) as position from cards where list_id = ?", [list.id]);
    try {
      await tx.run(
        `insert into cards (
          id, list_id, position, archived, customer_name, phone, work_order_number, invoice_number,
          piece_index, piece_count, size, due_date, start_date, shared_mats, art_description, art_location,
          art_condition, connected_orders, additional_contact, customer_record_id, created_at, updated_at
        ) values (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, list.id, Number(positionRow[0]?.position ?? 0) + 1000, input.customerName.trim(), input.phone?.trim() ?? "",
          workOrder, input.invoiceNumber?.trim() || null, pieceIndex, pieceCount, input.size?.trim() ?? "",
          input.dueDate || null, input.startDate || shopDateDefault(input.startDate), input.sharedMats ?? "",
          input.artDescription ?? "", input.artLocation ?? "", input.artCondition ?? "", input.connectedOrders ?? "",
          input.additionalContact ?? "", input.customerRecordId || null, now, now,
        ],
      );
    } catch (error) {
      if (isUnique(error)) throw new CardError(`Work order ${workOrder} piece ${pieceIndex} already exists.`);
      throw error;
    }
    await writeChildren(
      tx, id,
      await resolveLabels(tx, input.labelNames),
      await resolveAssignees(tx, input.assigneeEmails),
      await resolveFields(tx, input.customFields),
      normalizeMaterials(input.materials, input.ensureDefaults ?? Boolean(workOrder)),
    );
    if (workOrder) await ensureChecklist(tx, id);
    await activity(tx, id, actor, "created", `${actor.name} created this card in ${list.name}.`);
    return { id, listName: list.name, pieceIndex };
  });
}

function shopDateDefault(value: string | null | undefined) {
  return value || null;
}

export async function updateWorkCard(id: string, input: CardInput, actor: Actor) {
  return transaction(async (tx) => {
    const current = await tx.all<{
      list_id: string; list_name: string; customer_name: string; phone: string; work_order_number: string | null;
      invoice_number: string | null; piece_index: number | null; piece_count: number | null; size: string;
      due_date: string | null; start_date: string | null; shared_mats: string; art_description: string;
      art_location: string; art_condition: string; connected_orders: string; additional_contact: string;
      customer_record_id: string | null;
    }>(
      "select cards.*, lists.name as list_name from cards join lists on lists.id = cards.list_id where cards.id = ?",
      [id],
    );
    const card = current[0];
    if (!card) throw new CardError("Card not found.", 404);
    let listId = card.list_id;
    let listName = card.list_name;
    if (input.forceList && (input.listName || input.listId)) {
      const list = await resolveList(tx, input.listName, input.listId);
      if (list.id !== card.list_id) {
        listId = list.id;
        listName = list.name;
        await activity(tx, id, actor, "moved", `${actor.name} moved this from ${card.list_name} to ${list.name}.`);
      }
    }
    const workOrder = input.workOrderNumber === undefined ? card.work_order_number : input.workOrderNumber?.trim() || null;
    const pieceIndex = workOrder ? input.pieceIndex || card.piece_index || 1 : null;
    const pieceCount = workOrder ? input.pieceCount || card.piece_count || 1 : null;
    const dueDate = input.dueDate === undefined ? card.due_date : input.dueDate || null;
    try {
      await tx.run(
        `update cards set list_id = ?, customer_name = ?, phone = ?, work_order_number = ?, invoice_number = ?,
         piece_index = ?, piece_count = ?, size = ?, due_date = ?, start_date = ?, shared_mats = ?, art_description = ?,
         art_location = ?, art_condition = ?, connected_orders = ?, additional_contact = ?, customer_record_id = ?, updated_at = ?
         where id = ?`,
        [
          listId, input.customerName.trim(), input.phone ?? card.phone, workOrder,
          input.invoiceNumber === undefined ? card.invoice_number : input.invoiceNumber?.trim() || null,
          pieceIndex, pieceCount, input.size ?? card.size, dueDate,
          input.startDate === undefined ? card.start_date : input.startDate || null,
          input.sharedMats ?? card.shared_mats, input.artDescription ?? card.art_description,
          input.artLocation ?? card.art_location, input.artCondition ?? card.art_condition,
          input.connectedOrders ?? card.connected_orders, input.additionalContact ?? card.additional_contact,
          input.customerRecordId === undefined ? card.customer_record_id : input.customerRecordId || null,
          new Date().toISOString(), id,
        ],
      );
    } catch (error) {
      if (isUnique(error)) throw new CardError(`Work order ${workOrder} piece ${pieceIndex} already exists.`);
      throw error;
    }
    await writeChildren(
      tx, id,
      await resolveLabels(tx, input.labelNames),
      await resolveAssignees(tx, input.assigneeEmails),
      await resolveFields(tx, input.customFields),
      input.replaceMaterials || input.materials ? normalizeMaterials(input.materials, false) : null,
    );
    const changes: string[] = [];
    if (input.customerName.trim() !== card.customer_name) changes.push("customer");
    if (dueDate !== card.due_date) changes.push("due date");
    if ((input.size ?? card.size) !== card.size) changes.push("size");
    if (input.artDescription !== undefined && input.artDescription !== card.art_description) changes.push("art description");
    if (input.artLocation !== undefined && input.artLocation !== card.art_location) changes.push("art location");
    if (input.materials) changes.push("materials");
    if (input.labelNames) changes.push("labels");
    if (input.customFields) changes.push("custom fields");
    if (changes.length) await activity(tx, id, actor, "updated", `${actor.name} updated ${changes.join(", ")}.`);
    return { listName, pieceIndex };
  });
}

export async function moveCard(id: string, listName: string, actor: Actor) {
  return transaction(async (tx) => {
    const current = await tx.all<{ list_id: string; list_name: string }>(
      "select cards.list_id, lists.name as list_name from cards join lists on lists.id = cards.list_id where cards.id = ?",
      [id],
    );
    if (!current[0]) throw new CardError("Card not found.", 404);
    const list = await resolveList(tx, listName);
    if (list.id === current[0].list_id) return { from: list.name, to: list.name, changed: false };
    const position = await tx.all<{ position: number }>("select coalesce(max(position), -1000) as position from cards where list_id = ?", [list.id]);
    await tx.run("update cards set list_id = ?, position = ?, updated_at = ? where id = ?", [
      list.id, Number(position[0]?.position ?? 0) + 1000, new Date().toISOString(), id,
    ]);
    await activity(tx, id, actor, "moved", `${actor.name} moved this from ${current[0].list_name} to ${list.name}.`);
    return { from: current[0].list_name, to: list.name, changed: true };
  });
}

export async function saveOrder(groups: { listId: string; cardIds: string[] }[], actor: Actor) {
  await transaction(async (tx) => {
    for (const group of groups) {
      const nextList = await tx.all<{ name: string }>("select name from lists where id = ?", [group.listId]);
      if (!nextList[0]) throw new CardError("That list does not exist.", 404);
      for (const [index, cardId] of group.cardIds.entries()) {
        const current = await tx.all<{ list_id: string; name: string }>(
          "select cards.list_id, lists.name from cards join lists on lists.id = cards.list_id where cards.id = ?",
          [cardId],
        );
        if (!current[0]) continue;
        await tx.run("update cards set list_id = ?, position = ?, updated_at = ? where id = ?", [
          group.listId, index * 1000, new Date().toISOString(), cardId,
        ]);
        if (current[0].list_id !== group.listId) {
          await activity(tx, cardId, actor, "moved", `${actor.name} moved this from ${current[0].name} to ${nextList[0].name}.`);
        }
      }
    }
  });
}

export async function setArchived(id: string, archived: boolean, actor: Actor) {
  await transaction(async (tx) => {
    const card = await tx.all<{ id: string }>("select id from cards where id = ?", [id]);
    if (!card[0]) throw new CardError("Card not found.", 404);
    await tx.run("update cards set archived = ?, updated_at = ? where id = ?", [archived ? 1 : 0, new Date().toISOString(), id]);
    await activity(tx, id, actor, archived ? "archived" : "unarchived", archived ? `${actor.name} archived this card.` : `${actor.name} put this card back on the board.`);
  });
}

export async function setMaterialStatus(materialId: string, status: string, actor: Actor) {
  const parsed = parseStatus(status);
  if (!parsed) throw new CardError("Unknown stock status.");
  await transaction(async (tx) => {
    const line = await tx.all<{ card_id: string; item_code: string; kind: string; vendor: string; stock_status: string }>(
      "select card_id, item_code, kind, vendor, stock_status from material_lines where id = ?",
      [materialId],
    );
    if (!line[0]) throw new CardError("Material line not found.", 404);
    if (line[0].stock_status === parsed) return;
    await tx.run("update material_lines set stock_status = ? where id = ?", [parsed, materialId]);
    await tx.run("update cards set updated_at = ? where id = ?", [new Date().toISOString(), line[0].card_id]);
    await activity(tx, line[0].card_id, actor, "material_status", `${actor.name} set ${line[0].item_code} (${kindLabel(line[0].kind)}${line[0].vendor ? `, ${line[0].vendor}` : ""}) to ${statusLabel(parsed)}.`);
  });
}

export async function setMaterialLines(cardId: string, updates: { kind: string; itemCode: string; stockStatus: string }[], actor: Actor) {
  await transaction(async (tx) => {
    const card = await tx.all<{ id: string }>("select id from cards where id = ?", [cardId]);
    if (!card[0]) throw new CardError("Card not found.", 404);
    for (const update of updates) {
      const kind = parseKind(update.kind);
      if (!kind) throw new CardError(`Unknown material kind "${update.kind}".`);
      const status = parseStatus(update.stockStatus);
      if (!status) throw new CardError(`Unknown stock status "${update.stockStatus}".`);
      const lines = await tx.all<{ id: string; stock_status: string; item_code: string; vendor: string }>(
        "select id, stock_status, item_code, vendor from material_lines where card_id = ? and kind = ? and lower(item_code) = lower(?)",
        [cardId, kind, update.itemCode],
      );
      if (!lines[0]) throw new CardError(`No ${kindLabel(kind)} line with item code ${update.itemCode} on this card.`, 404);
      if (lines[0].stock_status === status) continue;
      await tx.run("update material_lines set stock_status = ? where id = ?", [status, lines[0].id]);
      await activity(tx, cardId, actor, "material_status", `${actor.name} set ${lines[0].item_code} (${kindLabel(kind)}${lines[0].vendor ? `, ${lines[0].vendor}` : ""}) to ${statusLabel(status)}.`);
    }
    await tx.run("update cards set updated_at = ? where id = ?", [new Date().toISOString(), cardId]);
  });
}

export async function addMaterial(cardId: string, input: { kind: string; itemCode: string; vendor?: string; stockStatus?: string }, actor: Actor) {
  const [line] = normalizeMaterials([input], false);
  await transaction(async (tx) => {
    const card = await tx.all<{ id: string }>("select id from cards where id = ?", [cardId]);
    if (!card[0]) throw new CardError("Card not found.", 404);
    const position = await tx.all<{ position: number }>("select coalesce(max(position), -1) as position from material_lines where card_id = ?", [cardId]);
    await tx.run(
      "insert into material_lines (id, card_id, position, kind, item_code, vendor, stock_status) values (?, ?, ?, ?, ?, ?, ?)",
      [randomUUID(), cardId, Number(position[0]?.position ?? -1) + 1, line.kind, line.itemCode, line.vendor, line.stockStatus],
    );
    await activity(tx, cardId, actor, "material_status", `${actor.name} added ${line.itemCode} (${kindLabel(line.kind)}) as ${statusLabel(line.stockStatus)}.`);
  });
}

export async function updateMaterial(materialId: string, input: { itemCode: string; vendor: string; kind: string }, actor: Actor) {
  const kind = parseKind(input.kind);
  if (!kind) throw new CardError("Unknown material kind.");
  if (!input.itemCode.trim()) throw new CardError("Item code is required.");
  await transaction(async (tx) => {
    const line = await tx.all<{ card_id: string; item_code: string; vendor: string; kind: string }>(
      "select card_id, item_code, vendor, kind from material_lines where id = ?",
      [materialId],
    );
    if (!line[0]) throw new CardError("Material line not found.", 404);
    await tx.run("update material_lines set item_code = ?, vendor = ?, kind = ? where id = ?", [input.itemCode.trim(), input.vendor.trim(), kind, materialId]);
    if (line[0].item_code !== input.itemCode.trim() || line[0].vendor !== input.vendor.trim() || line[0].kind !== kind) {
      await activity(tx, line[0].card_id, actor, "updated", `${actor.name} edited material ${input.itemCode.trim()} (${kindLabel(kind)}).`);
    }
  });
}

export async function deleteMaterial(materialId: string, actor: Actor) {
  await transaction(async (tx) => {
    const line = await tx.all<{ card_id: string; item_code: string; kind: string }>("select card_id, item_code, kind from material_lines where id = ?", [materialId]);
    if (!line[0]) throw new CardError("Material line not found.", 404);
    await tx.run("delete from material_lines where id = ?", [materialId]);
    await activity(tx, line[0].card_id, actor, "updated", `${actor.name} removed ${line[0].item_code} (${kindLabel(line[0].kind)}).`);
  });
}

export async function setField(cardId: string, fieldId: string, optionLabel: string, actor: Actor) {
  await transaction(async (tx) => {
    const field = await tx.all<{ name: string }>("select name from custom_fields where id = ?", [fieldId]);
    if (!field[0]) throw new CardError("Unknown custom field.", 404);
    const optionCount = await tx.all<{ n: number }>("select count(*) as n from custom_field_options where field_id = ?", [fieldId]);
    if (Number(optionCount[0]?.n ?? 0) === 0) {
      if (optionLabel && !/^\d+(\.\d+)?$/.test(optionLabel)) throw new CardError(`${field[0].name} must be a number.`);
    } else if (optionLabel) {
      const option = await tx.all<{ label: string }>("select label from custom_field_options where field_id = ? and label = ?", [fieldId, optionLabel]);
      if (!option[0]) throw new CardError(`"${optionLabel}" is not an option for ${field[0].name}.`);
    }
    await tx.run("delete from card_field_values where card_id = ? and field_id = ?", [cardId, fieldId]);
    if (optionLabel) await tx.run("insert into card_field_values (card_id, field_id, option_label) values (?, ?, ?)", [cardId, fieldId, optionLabel]);
    await activity(tx, cardId, actor, "field_changed", optionLabel ? `${actor.name} set ${field[0].name} to ${optionLabel}.` : `${actor.name} cleared ${field[0].name}.`);
  });
}

export async function toggleLabel(cardId: string, labelId: string, actor: Actor) {
  await transaction(async (tx) => {
    const label = await tx.all<{ name: string }>("select name from labels where id = ?", [labelId]);
    if (!label[0]) throw new CardError("Unknown label.", 404);
    const existing = await tx.all<{ label_id: string }>("select label_id from card_labels where card_id = ? and label_id = ?", [cardId, labelId]);
    if (existing[0]) {
      await tx.run("delete from card_labels where card_id = ? and label_id = ?", [cardId, labelId]);
      await activity(tx, cardId, actor, "label_changed", `${actor.name} removed the ${label[0].name} label.`);
    } else {
      await tx.run("insert into card_labels (card_id, label_id) values (?, ?)", [cardId, labelId]);
      await activity(tx, cardId, actor, "label_changed", `${actor.name} added the ${label[0].name} label.`);
    }
  });
}

export async function toggleAssignee(cardId: string, userId: string, actor: Actor) {
  await transaction(async (tx) => {
    const user = await tx.all<{ name: string }>("select name from users where id = ?", [userId]);
    if (!user[0]) throw new CardError("Unknown teammate.", 404);
    const existing = await tx.all<{ user_id: string }>("select user_id from card_assignees where card_id = ? and user_id = ?", [cardId, userId]);
    if (existing[0]) {
      await tx.run("delete from card_assignees where card_id = ? and user_id = ?", [cardId, userId]);
      await activity(tx, cardId, actor, "assignee_changed", `${actor.name} unassigned ${user[0].name}.`);
    } else {
      await tx.run("insert into card_assignees (card_id, user_id) values (?, ?)", [cardId, userId]);
      await activity(tx, cardId, actor, "assignee_changed", `${actor.name} assigned ${user[0].name}.`);
    }
  });
}

export async function toggleCheck(itemId: string, checked: boolean, actor: Actor) {
  await transaction(async (tx) => {
    const item = await tx.all<{ text: string; card_id: string }>(
      `select checklist_items.text, checklists.card_id from checklist_items
       join checklists on checklists.id = checklist_items.checklist_id where checklist_items.id = ?`,
      [itemId],
    );
    if (!item[0]) throw new CardError("Checklist item not found.", 404);
    await tx.run("update checklist_items set checked = ? where id = ?", [checked ? 1 : 0, itemId]);
    await activity(tx, item[0].card_id, actor, "checklist", checked ? `${actor.name} checked "${item[0].text}".` : `${actor.name} cleared "${item[0].text}".`);
  });
}

export async function addCheckItem(cardId: string, text: string, actor: Actor) {
  const body = text.trim();
  if (!body) throw new CardError("Checklist item is empty.");
  await transaction(async (tx) => {
    let checklist = await tx.all<{ id: string }>("select id from checklists where card_id = ? order by position limit 1", [cardId]);
    if (!checklist[0]) {
      await ensureChecklist(tx, cardId);
      checklist = await tx.all<{ id: string }>("select id from checklists where card_id = ? order by position limit 1", [cardId]);
    }
    const position = await tx.all<{ position: number }>("select coalesce(max(position), -1) as position from checklist_items where checklist_id = ?", [checklist[0].id]);
    await tx.run("insert into checklist_items (id, checklist_id, text, checked, position) values (?, ?, ?, 0, ?)", [
      randomUUID(), checklist[0].id, body, Number(position[0]?.position ?? -1) + 1,
    ]);
    await activity(tx, cardId, actor, "checklist", `${actor.name} added checklist item "${body}".`);
  });
}

export async function addNote(cardId: string, body: string, actor: Actor) {
  const text = body.trim();
  if (!text) throw new CardError("Note is empty.");
  await transaction(async (tx) => {
    const card = await tx.all<{ id: string }>("select id from cards where id = ?", [cardId]);
    if (!card[0]) throw new CardError("Card not found.", 404);
    await tx.run("insert into notes (id, card_id, author_name, author_user_id, body, created_at) values (?, ?, ?, ?, ?, ?)", [
      randomUUID(), cardId, actor.name, actor.userId, text, new Date().toISOString(),
    ]);
    await activity(tx, cardId, actor, "note", `${actor.name} added a note.`);
  });
}

const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]);

export async function attachFile(cardId: string, file: { filename: string; mimeType: string; bytes: Buffer }, actor: Actor) {
  if (!ALLOWED_MIME.has(file.mimeType)) throw new CardError("Attach a PDF or an image.");
  if (file.bytes.length > 20 * 1024 * 1024) throw new CardError("Files must be 20 MB or smaller.");
  const filename = safeFilename(file.filename);
  const existing = await get<{ id: string; storage_key: string }>("select id, storage_key from attachments where card_id = ? and filename = ?", [cardId, filename]);
  const storageKey = existing?.storage_key ?? `${cardId}/${randomUUID()}-${filename}`;
  await saveUpload(storageKey, file.bytes);
  await transaction(async (tx) => {
    const card = await tx.all<{ id: string }>("select id from cards where id = ?", [cardId]);
    if (!card[0]) throw new CardError("Card not found.", 404);
    if (existing) {
      await tx.run("update attachments set mime_type = ?, byte_size = ?, created_at = ? where id = ?", [file.mimeType, file.bytes.length, new Date().toISOString(), existing.id]);
      await activity(tx, cardId, actor, "attachment", `${actor.name} replaced ${filename}.`);
    } else {
      const covers = await tx.all<{ id: string }>("select id from attachments where card_id = ? and is_cover = 1", [cardId]);
      const isCover = file.mimeType.startsWith("image/") && covers.length === 0 ? 1 : 0;
      await tx.run(
        "insert into attachments (id, card_id, filename, mime_type, byte_size, storage_key, is_cover, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
        [randomUUID(), cardId, filename, file.mimeType, file.bytes.length, storageKey, isCover, new Date().toISOString()],
      );
      await activity(tx, cardId, actor, "attachment", `${actor.name} attached ${filename}.`);
    }
  });
}

export async function renameAttachment(attachmentId: string, filename: string, actor: Actor) {
  const next = safeFilename(filename);
  if (!next) throw new CardError("File name is empty.");
  await transaction(async (tx) => {
    const file = await tx.all<{ card_id: string; filename: string }>("select card_id, filename from attachments where id = ?", [attachmentId]);
    if (!file[0]) throw new CardError("Attachment not found.", 404);
    await tx.run("update attachments set filename = ? where id = ?", [next, attachmentId]);
    await activity(tx, file[0].card_id, actor, "attachment", `${actor.name} renamed ${file[0].filename} to ${next}.`);
  });
}

export async function setCover(attachmentId: string, actor: Actor) {
  await transaction(async (tx) => {
    const file = await tx.all<{ card_id: string; filename: string; mime_type: string }>(
      "select card_id, filename, mime_type from attachments where id = ?",
      [attachmentId],
    );
    if (!file[0]) throw new CardError("Attachment not found.", 404);
    if (!file[0].mime_type.startsWith("image/")) throw new CardError("Only a photo can be the cover.");
    await tx.run("update attachments set is_cover = 0 where card_id = ?", [file[0].card_id]);
    await tx.run("update attachments set is_cover = 1 where id = ?", [attachmentId]);
    await activity(tx, file[0].card_id, actor, "attachment", `${actor.name} set ${file[0].filename} as the cover.`);
  });
}

export async function deleteAttachment(attachmentId: string, actor: Actor) {
  const file = await get<{ id: string; card_id: string; filename: string; storage_key: string }>(
    "select id, card_id, filename, storage_key from attachments where id = ?",
    [attachmentId],
  );
  if (!file) throw new CardError("Attachment not found.", 404);
  await run("delete from attachments where id = ?", [attachmentId]);
  await removeUpload(file.storage_key);
  await transaction(async (tx) => {
    await activity(tx, file.card_id, actor, "attachment", `${actor.name} removed ${file.filename}.`);
  });
}
