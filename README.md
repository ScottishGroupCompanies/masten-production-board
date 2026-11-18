# Masten Production Board

Shop-floor board for [Masten Fine Framing](https://www.mastenonline.com/) in Greenwood Village. Staff track one card per framed piece. A later automation can push verified Lifesaver orders in through the intake API. This version does not talk to Trello, Google Sheets, or Lifesaver.

## Run it locally

```bash
npm install
npm run dev
```

Open http://127.0.0.1:4471.

The first launch creates `data/masten.db` and about 27 fake cards (multi-piece orders, overdue jobs, and Not In Stock lines from Larson, Crescent, Bainbridge, Artique, and CDNV). Attachments land in `data/uploads`.

Sign in as the admin:

- Email: `avery.chen@masten.test`
- Password: `FrameShop#1986`

Other staff use the same password: `jordan.hale@masten.test`, `priya.nandakumar@masten.test`, `luis.ortega@masten.test`.

Reset the local database (stop the dev server first, the file is open while it runs):

```bash
npm run db:reset
npm run dev
```

## What the board contains

Lists, labels, and custom fields are the live board export in `src/data/live-board.json`: 26 lists in shop order, 50 labels with their Trello colors, and 15 custom fields. DO (Quantity) is a number. The other fields use the board’s exact dropdown options. Per-material stock (In Stock, Not In Stock, Needs Human Check, Ordered, Here) stays on each material line and is separate from those dropdowns.

A card title is `Customer W.O.##### Inv.##### (n/m) size phone`. Frames and glazing default to **Needs Human Check** until someone sets a status. Any line still on Needs Human Check shows **Needs review** on the card.

## Environment variables

| Variable | Local default | Production |
| --- | --- | --- |
| `DATABASE_URL` | `file:./data/masten.db` | Turso URL, `libsql://...` or `https://...` |
| `TURSO_AUTH_TOKEN` | unused | Turso token |
| `INTAKE_API_KEY` | `dev-masten-intake-key` | required, no default |
| `SESSION_SECRET` | a dev-only string | long random secret |
| `ADMIN_PASSWORD` | `FrameShop#1986` | password baked into the first seed |
| `BLOB_READ_WRITE_TOKEN` | unused | Vercel Blob token for attachments |

Copy `.env.example` to `.env.local` when you want to override the defaults. Do not ship the demo password or the dev API key.

## Deploy on Vercel

1. Create a [Turso](https://turso.tech) database and a [Vercel Blob](https://vercel.com/docs/vercel-blob) store.
2. Set `DATABASE_URL`, `TURSO_AUTH_TOKEN`, `BLOB_READ_WRITE_TOKEN`, `INTAKE_API_KEY`, `SESSION_SECRET`, and `ADMIN_PASSWORD`.
3. Import the repo and deploy. The first boot seeds lists, labels, fields, the admin user, and the sample cards.

SQLite on the local disk does not persist on Vercel. Turso is the same SQL. Attachments are written to `data/uploads` and, when the blob token is set, also to Vercel Blob. Reads prefer the local file and fall back to the blob.

## Intake API

Every call needs `Authorization: Bearer $INTAKE_API_KEY` or `X-API-Key`. Automated changes are logged as **Masten Orders bot**.

New cards land in **New Work Orders** unless `list` is set. Sending the same work order and piece again updates that card and does not move it, unless `forceList` is true. A multi-piece order is several cards that share a W.O. number (`pieceIndex` / `pieceCount`, or a `pieces` array). The lookup key is W.O. number plus piece.

Stock statuses: `in_stock`, `not_in_stock`, `needs_human_check`, `ordered`, `here` (or the display labels, such as `Not In Stock`). If frame or glazing status is omitted, it becomes Needs Human Check.

### Upsert an order

```bash
curl -s -X POST http://127.0.0.1:4471/api/intake/orders \
  -H "Authorization: Bearer dev-masten-intake-key" \
  -H "Content-Type: application/json" \
  -d '{
    "workOrderNumber": "99001",
    "invoiceNumber": "21099",
    "customerName": "Sample Intake",
    "phone": "303-555-0199",
    "dueDate": "2026-12-05",
    "size": "16x20",
    "pieceIndex": 1,
    "pieceCount": 1,
    "artDescription": "Graphite study of a cottonwood",
    "artLocation": "Bin A-1",
    "artCondition": "Good",
    "materials": [
      {"kind": "frame", "itemCode": "LJ-8801", "vendor": "Larson", "stockStatus": "not_in_stock"},
      {"kind": "top_mat", "itemCode": "C-9893", "vendor": "Crescent", "stockStatus": "in_stock"},
      {"kind": "glazing", "itemCode": "Museum 16x20", "vendor": "Larson"}
    ]
  }'
```

`PUT` is the same operation. A second call with the same W.O. and piece updates the card.

### Upload the order PDF

```bash
curl -s -X POST http://127.0.0.1:4471/api/intake/orders/99001/attachments \
  -H "Authorization: Bearer dev-masten-intake-key" \
  -F "file=@./21099.pdf;type=application/pdf" \
  -F "filename=21099.pdf" \
  -F "pieceIndex=1"
```

Sending the same filename again replaces the file.

### Set stock, add a note, move the list

```bash
curl -s -X PATCH http://127.0.0.1:4471/api/intake/orders/99001/materials \
  -H "Authorization: Bearer dev-masten-intake-key" \
  -H "Content-Type: application/json" \
  -d '{"materials":[{"kind":"frame","itemCode":"LJ-8801","stockStatus":"ordered"}]}'

curl -s -X POST http://127.0.0.1:4471/api/intake/orders/99001/notes \
  -H "Authorization: Bearer dev-masten-intake-key" \
  -H "Content-Type: application/json" \
  -d '{"body":"Glass still needs a person to check the rack."}'

curl -s -X POST http://127.0.0.1:4471/api/intake/orders/99001/move \
  -H "Authorization: Bearer dev-masten-intake-key" \
  -H "Content-Type: application/json" \
  -d '{"list":"Verify Mat Before Ordering"}'
```

### Read it back

```bash
curl -s http://127.0.0.1:4471/api/intake/orders/99001 \
  -H "Authorization: Bearer dev-masten-intake-key"
```

Run the same flow against a live server:

```bash
npm run test:intake
```

That leaves sample work order **99001** on Verify Mat Before Ordering. Running it again updates the same card.

## Data model

SQLite (local file or Turso).

- `users` — staff. `role` is `admin` or `staff`.
- `lists` — the 26 columns, in `position` order. `kind` is `production`, `done`, or `utility`. To Order only looks at open production cards.
- `labels` — name and color.
- `custom_fields` and `custom_field_options` — the 15 dropdowns.
- `cards` — one row per piece. Unique on (`work_order_number`, `piece_index`) when a work order is set. Holds customer, phone, invoice, size, due date, start date, and the description sections: Shared Mats, Art Description, Art Location, Art Condition, Connected Orders, Additional Contact Info, and `customer_record_id`.
- `card_labels`, `card_assignees`, `card_field_values` — labels, people, and dropdown values.
- `material_lines` — kind, item code, vendor, and stock status.
- `notes` — author and timestamp.
- `checklists` and `checklist_items`.
- `attachments` — filename, mime type, and storage key. The Lifesaver PDF is `<invoice>.pdf`.
- `activity` — who changed what, and when. The bot’s name is `Masten Orders bot`.

## Everyday use

The board scrolls sideways across all 26 lists. Drag a card between columns or reorder it inside a column. Counts in the headers are open cards. Archive from the card, and turn on Archived in the filter bar to put it back. Search matches customer, work order, and invoice. Filters cover label, assignee, due date, and material status.

**To order** groups every Not In Stock line by vendor. Mark ordered when it is placed, then Mark here when it arrives.
