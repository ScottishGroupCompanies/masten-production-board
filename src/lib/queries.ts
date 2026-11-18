import { kindLabel, type MaterialKind, type StockStatus } from "@/data/board-schema";
import { all, get } from "./db";
import { cardTitle, isOverdue, shopToday } from "./format";
import type { BoardCard, BoardData, CardDetail, MaterialView, OrderLine } from "./board-types";

type CardRow = {
  id: string;
  list_id: string;
  position: number;
  archived: number;
  customer_name: string;
  phone: string;
  work_order_number: string | null;
  invoice_number: string | null;
  piece_index: number | null;
  piece_count: number | null;
  size: string;
  due_date: string | null;
  start_date: string | null;
  shared_mats: string;
  art_description: string;
  art_location: string;
  art_condition: string;
  connected_orders: string;
  additional_contact: string;
  customer_record_id: string | null;
  list_name?: string;
  list_kind?: string;
};

function asMaterial(row: {
  id: string;
  kind: string;
  item_code: string;
  vendor: string;
  stock_status: string;
  position: number;
}): MaterialView {
  return {
    id: row.id,
    kind: row.kind as MaterialKind,
    itemCode: row.item_code,
    vendor: row.vendor,
    stockStatus: row.stock_status as StockStatus,
    position: Number(row.position),
  };
}

export async function getBoard(): Promise<BoardData> {
  const today = shopToday();
  const [lists, labels, users, cards, labelLinks, assignees, materials] = await Promise.all([
    all<{ id: string; name: string; kind: string; position: number }>(
      "select id, name, kind, position from lists order by position",
    ),
    all<{ id: string; name: string; color: string }>("select id, name, color from labels order by position"),
    all<{ id: string; name: string; email: string; role: string }>("select id, name, email, role from users order by name"),
    all<CardRow>("select * from cards"),
    all<{ card_id: string; label_id: string }>("select card_id, label_id from card_labels"),
    all<{ card_id: string; user_id: string }>("select card_id, user_id from card_assignees"),
    all<{ id: string; card_id: string; kind: string; item_code: string; vendor: string; stock_status: string; position: number }>(
      "select id, card_id, kind, item_code, vendor, stock_status, position from material_lines order by position",
    ),
  ]);
  const listKind = new Map(lists.map((list) => [list.id, list.kind]));
  const labelById = new Map(labels.map((label) => [label.id, label]));
  const userById = new Map(users.map((user) => [user.id, user]));
  const labelsByCard = new Map<string, BoardCard["labels"]>();
  for (const link of labelLinks) {
    const label = labelById.get(link.label_id);
    if (!label) continue;
    const bucket = labelsByCard.get(link.card_id) ?? [];
    bucket.push(label);
    labelsByCard.set(link.card_id, bucket);
  }
  const peopleByCard = new Map<string, BoardCard["assignees"]>();
  for (const link of assignees) {
    const user = userById.get(link.user_id);
    if (!user) continue;
    const bucket = peopleByCard.get(link.card_id) ?? [];
    bucket.push({ id: user.id, name: user.name });
    peopleByCard.set(link.card_id, bucket);
  }
  const materialsByCard = new Map<string, MaterialView[]>();
  for (const row of materials) {
    const bucket = materialsByCard.get(row.card_id) ?? [];
    bucket.push(asMaterial(row));
    materialsByCard.set(row.card_id, bucket);
  }
  return {
    today,
    lists,
    labels,
    users,
    cards: cards
      .map((card) => {
        const lines = materialsByCard.get(card.id) ?? [];
        const archived = Number(card.archived) === 1;
        return {
          id: card.id,
          listId: card.list_id,
          position: Number(card.position),
          archived,
          title: cardTitle({
            customerName: card.customer_name,
            workOrderNumber: card.work_order_number,
            invoiceNumber: card.invoice_number,
            pieceIndex: card.piece_index,
            pieceCount: card.piece_count,
            size: card.size,
            phone: card.phone,
          }),
          customerName: card.customer_name,
          phone: card.phone,
          workOrderNumber: card.work_order_number,
          invoiceNumber: card.invoice_number,
          pieceIndex: card.piece_index,
          pieceCount: card.piece_count,
          size: card.size,
          dueDate: card.due_date,
          startDate: card.start_date,
          overdue: isOverdue(card.due_date, listKind.get(card.list_id) ?? "production", archived, today),
          labels: labelsByCard.get(card.id) ?? [],
          assignees: peopleByCard.get(card.id) ?? [],
          materials: lines,
          needsReview: lines.some((line) => line.stockStatus === "needs_human_check"),
        } satisfies BoardCard;
      })
      .sort((a, b) => a.position - b.position),
  };
}

export async function getCard(id: string): Promise<CardDetail | null> {
  const board = await getBoard();
  const card = board.cards.find((item) => item.id === id);
  if (!card) return null;
  const row = await get<CardRow>(
    `select cards.*, lists.name as list_name, lists.kind as list_kind
     from cards join lists on lists.id = cards.list_id where cards.id = ?`,
    [id],
  );
  if (!row) return null;
  const fields = await all<{ id: string; name: string; option_label: string | null }>(
    `select custom_fields.id, custom_fields.name, card_field_values.option_label
     from custom_fields
     left join card_field_values on card_field_values.field_id = custom_fields.id and card_field_values.card_id = ?
     order by custom_fields.position`,
    [id],
  );
  const options = await all<{ field_id: string; label: string }>(
    "select field_id, label from custom_field_options order by position",
  );
  const optionsByField = new Map<string, string[]>();
  for (const option of options) {
    const bucket = optionsByField.get(option.field_id) ?? [];
    bucket.push(option.label);
    optionsByField.set(option.field_id, bucket);
  }
  const notes = await all<{ id: string; author_name: string; body: string; created_at: string }>(
    "select id, author_name, body, created_at from notes where card_id = ? order by created_at desc",
    [id],
  );
  const checklists = await all<{ id: string; title: string }>(
    "select id, title from checklists where card_id = ? order by position",
    [id],
  );
  const items = await all<{ id: string; checklist_id: string; text: string; checked: number }>(
    `select checklist_items.id, checklist_items.checklist_id, checklist_items.text, checklist_items.checked
     from checklist_items join checklists on checklists.id = checklist_items.checklist_id
     where checklists.card_id = ? order by checklist_items.position`,
    [id],
  );
  const attachments = await all<{ id: string; filename: string; mime_type: string; byte_size: number; created_at: string }>(
    "select id, filename, mime_type, byte_size, created_at from attachments where card_id = ? order by created_at",
    [id],
  );
  const activity = await all<{ id: string; actor_name: string; kind: string; summary: string; created_at: string }>(
    "select id, actor_name, kind, summary, created_at from activity where card_id = ? order by created_at desc",
    [id],
  );
  const customer = row.customer_record_id
    ? await get<{ customer_name: string }>("select customer_name from cards where id = ?", [row.customer_record_id])
    : undefined;
  const siblings = row.work_order_number
    ? await all<CardRow & { list_name: string }>(
        `select cards.*, lists.name as list_name from cards join lists on lists.id = cards.list_id
         where cards.work_order_number = ? and cards.id != ? order by cards.piece_index`,
        [row.work_order_number, id],
      )
    : [];
  const linked = await all<CardRow & { list_name: string }>(
    `select cards.*, lists.name as list_name from cards join lists on lists.id = cards.list_id
     where cards.customer_record_id = ? order by cards.work_order_number, cards.piece_index`,
    [id],
  );
  const customerList = await get<{ id: string }>("select id from lists where name = ?", ["Master Customer List"]);
  const customerRecords = customerList
    ? await all<{ id: string; customer_name: string }>(
        "select id, customer_name from cards where list_id = ? and archived = 0 order by customer_name",
        [customerList.id],
      )
    : [];
  const titleOf = (item: CardRow) =>
    cardTitle({
      customerName: item.customer_name,
      workOrderNumber: item.work_order_number,
      invoiceNumber: item.invoice_number,
      pieceIndex: item.piece_index,
      pieceCount: item.piece_count,
      size: item.size,
      phone: item.phone,
    });
  return {
    ...card,
    listName: row.list_name ?? "",
    listKind: row.list_kind ?? "production",
    sharedMats: row.shared_mats,
    artDescription: row.art_description,
    artLocation: row.art_location,
    artCondition: row.art_condition,
    connectedOrders: row.connected_orders,
    additionalContact: row.additional_contact,
    customerRecordId: row.customer_record_id,
    customerRecordName: customer?.customer_name ?? null,
    fields: fields.map((field) => ({
      id: field.id,
      name: field.name,
      value: field.option_label ?? "",
      options: optionsByField.get(field.id) ?? [],
    })),
    notes: notes.map((note) => ({ id: note.id, authorName: note.author_name, body: note.body, createdAt: note.created_at })),
    checklists: checklists.map((list) => ({
      id: list.id,
      title: list.title,
      items: items
        .filter((item) => item.checklist_id === list.id)
        .map((item) => ({ id: item.id, text: item.text, checked: Number(item.checked) === 1 })),
    })),
    attachments: attachments.map((file) => ({
      id: file.id,
      filename: file.filename,
      mimeType: file.mime_type,
      byteSize: Number(file.byte_size),
      createdAt: file.created_at,
    })),
    activity: activity.map((event) => ({
      id: event.id,
      actorName: event.actor_name,
      kind: event.kind,
      summary: event.summary,
      createdAt: event.created_at,
    })),
    siblings: siblings.map((sibling) => ({
      id: sibling.id,
      title: titleOf(sibling),
      listName: sibling.list_name ?? "",
      pieceIndex: sibling.piece_index,
    })),
    linkedOrders: linked.map((order) => ({ id: order.id, title: titleOf(order), listName: order.list_name ?? "" })),
    customerRecords: customerRecords.map((record) => ({ id: record.id, name: record.customer_name })),
  };
}

export async function getToOrder(): Promise<{ today: string; lines: OrderLine[] }> {
  const today = shopToday();
  const rows = await all<{
    id: string;
    kind: string;
    item_code: string;
    vendor: string;
    stock_status: string;
    card_id: string;
    customer_name: string;
    work_order_number: string | null;
    invoice_number: string | null;
    piece_index: number | null;
    piece_count: number | null;
    size: string;
    phone: string;
    due_date: string | null;
    list_name: string;
    list_kind: string;
  }>(
    `select material_lines.id, material_lines.kind, material_lines.item_code, material_lines.vendor, material_lines.stock_status,
            cards.id as card_id, cards.customer_name, cards.work_order_number, cards.invoice_number, cards.piece_index,
            cards.piece_count, cards.size, cards.phone, cards.due_date, lists.name as list_name, lists.kind as list_kind
     from material_lines
     join cards on cards.id = material_lines.card_id
     join lists on lists.id = cards.list_id
     where material_lines.stock_status in ('not_in_stock', 'ordered')
       and cards.archived = 0 and lists.kind = 'production'
     order by material_lines.vendor, cards.due_date`,
  );
  return {
    today,
    lines: rows.map((row) => ({
      materialId: row.id,
      kind: row.kind,
      kindLabel: kindLabel(row.kind),
      itemCode: row.item_code,
      vendor: row.vendor || "Unassigned vendor",
      stockStatus: row.stock_status as StockStatus,
      cardId: row.card_id,
      customerName: row.customer_name,
      workOrderNumber: row.work_order_number,
      invoiceNumber: row.invoice_number,
      pieceIndex: row.piece_index,
      pieceCount: row.piece_count,
      size: row.size,
      dueDate: row.due_date,
      overdue: isOverdue(row.due_date, row.list_kind, false, today),
      listName: row.list_name,
      title: cardTitle({
        customerName: row.customer_name,
        workOrderNumber: row.work_order_number,
        invoiceNumber: row.invoice_number,
        pieceIndex: row.piece_index,
        pieceCount: row.piece_count,
        size: row.size,
        phone: row.phone,
      }),
    })),
  };
}

export async function getAttachment(id: string) {
  return get<{ id: string; card_id: string; filename: string; mime_type: string; storage_key: string }>(
    "select id, card_id, filename, mime_type, storage_key from attachments where id = ?",
    [id],
  );
}

export async function piecesForWorkOrder(workOrder: string) {
  return all<{ id: string; piece_index: number | null; list_id: string }>(
    "select id, piece_index, list_id from cards where work_order_number = ? order by piece_index",
    [workOrder],
  );
}
