# Masten Production Board

Shop-floor board for [Masten Fine Framing](https://www.mastenonline.com/) in Greenwood Village. Staff track one card per framed piece. A later automation can push verified Lifesaver orders in through the intake API. This version does not talk to Trello, Google Sheets, or Lifesaver.

## Run it locally

```bash
npm install
npm run dev
```

Open http://127.0.0.1:4471.

Copy `.env.example` to `.env.local` and set `ADMIN_EMAIL` and `ADMIN_PASSWORD` before the first launch. Those two are required even locally. The first launch creates `data/masten.db` with the 25 lists, 50 labels, 15 custom fields, and that one admin user. It does not create cards. Attachments land in `data/uploads` until a Vercel Blob token is set.

Sign in with the email and password from `.env.local`.

Optional shop-floor sample cards (not for the live database):

```bash
npm run db:seed:demo
```

That adds demo staff `avery.chen@masten.test`, `jordan.hale@masten.test`, `priya.nandakumar@masten.test`, and `luis.ortega@masten.test`. They share `ADMIN_PASSWORD`. The command refuses to run against a remote database unless `ALLOW_DEMO_SEED=1`.

Reset the local database (stop the dev server first, the file is open while it runs):

```bash
npm run db:reset
npm run dev
```

## What the board contains

Lists, labels, and custom fields are the live board export in `src/data/live-board.json`: 25 lists in shop order (the old Template column is not used), 50 labels with their Trello colors, and 15 custom fields. DO (Quantity) is a number. The other fields use the board’s exact dropdown options. Per-material stock (In Stock, Not In Stock, Needs Human Check, Ordered, Here) stays on each material line and is separate from those dropdowns.

A card title is `Customer W.O.##### Inv.##### (n/m) size phone`. Frames and glazing default to **Needs Human Check** until someone sets a status. Any line still on Needs Human Check shows **Needs review** on the card.

## Environment variables

| Variable | Local | Production |
| --- | --- | --- |
| `DATABASE_URL` | `file:./data/masten.db` if unset | Turso URL, `libsql://...` or `https://...`. Required |
| `DATABASE_AUTH_TOKEN` | unused | Turso auth token. Required. `TURSO_AUTH_TOKEN` is accepted as an alias |
| `BLOB_READ_WRITE_TOKEN` | optional; files stay in `data/uploads` | Vercel Blob read/write token. Required |
| `INTAKE_API_KEY` | `dev-masten-intake-key` if unset | long random key. Required, no default |
| `SESSION_SECRET` | a dev-only string if unset | random string, at least 32 characters. Required |
| `ADMIN_EMAIL` | required, no default | shop admin login. Required |
| `ADMIN_PASSWORD` | required, at least 8 characters | used only when that admin user is first created |
| `ADMIN_NAME` | optional, default `Shop admin` | display name for the new admin |

Copy `.env.example` to `.env.local` for local overrides. Do not commit `.env.local`.

## Deploy on Vercel

The board starts empty. Migration creates the 25 lists, 50 labels, 15 custom fields, and the admin user. It does not insert cards, and running it again does not delete cards or change an existing admin password.

1. Create a Turso database and copy its URL and token:

```bash
turso db create masten-production
turso db show masten-production --url
turso db tokens create masten-production
```

2. In the Vercel project, create a Blob store. Connect it so Vercel sets `BLOB_READ_WRITE_TOKEN`.
3. Set these environment variables for Production (and Preview, if you want preview to boot):

```bash
DATABASE_URL=libsql://your-database-name.turso.io
DATABASE_AUTH_TOKEN=the-token-from-turso-db-tokens-create
BLOB_READ_WRITE_TOKEN=the-vercel-blob-token
INTAKE_API_KEY=a-long-random-key
SESSION_SECRET=at-least-32-random-characters
ADMIN_EMAIL=you@mastenonline.com
ADMIN_PASSWORD=a-real-password
```

4. Import the repo and deploy. The server runs the same migration on boot.
5. You can also migrate from a machine that has the production variables, before or after deploy. This is safe to repeat:

```bash
DATABASE_URL=libsql://your-database-name.turso.io \
DATABASE_AUTH_TOKEN=... \
BLOB_READ_WRITE_TOKEN=... \
INTAKE_API_KEY=... \
SESSION_SECRET=... \
ADMIN_EMAIL=you@mastenonline.com \
ADMIN_PASSWORD=... \
npm run db:migrate
```

`npm run db:migrate` prints list, label, field, user, and card counts. A new production database should report `cards 0`.

SQLite on the local disk does not persist on Vercel. Turso is the same SQL. In production, attachments are stored only in Vercel Blob. Locally, a file is written under `data/uploads`, and also to Blob when the token is set. Reads try the local file first, then Blob.

Do not run `npm run db:seed:demo` against the production database.

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
    "workOrderNumber": "12345",
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
curl -s -X POST http://127.0.0.1:4471/api/intake/orders/12345/attachments \
  -H "Authorization: Bearer dev-masten-intake-key" \
  -F "file=@./21099.pdf;type=application/pdf" \
  -F "filename=21099.pdf" \
  -F "pieceIndex=1"
```

Sending the same filename again replaces the file.

### Set stock, add a note, move the list

```bash
curl -s -X PATCH http://127.0.0.1:4471/api/intake/orders/12345/materials \
  -H "Authorization: Bearer dev-masten-intake-key" \
  -H "Content-Type: application/json" \
  -d '{"materials":[{"kind":"frame","itemCode":"LJ-8801","stockStatus":"ordered"}]}'

curl -s -X POST http://127.0.0.1:4471/api/intake/orders/12345/notes \
  -H "Authorization: Bearer dev-masten-intake-key" \
  -H "Content-Type: application/json" \
  -d '{"body":"Glass still needs a person to check the rack."}'

curl -s -X POST http://127.0.0.1:4471/api/intake/orders/12345/move \
  -H "Authorization: Bearer dev-masten-intake-key" \
  -H "Content-Type: application/json" \
  -d '{"list":"Verify Mat Before Ordering"}'
```

### Read it back

```bash
curl -s http://127.0.0.1:4471/api/intake/orders/12345 \
  -H "Authorization: Bearer dev-masten-intake-key"
```

Delete every piece of a work order, including its files:

```bash
curl -s -X DELETE http://127.0.0.1:4471/api/intake/orders/12345 \
  -H "Authorization: Bearer dev-masten-intake-key"
```

Run the same flow against a live server:

```bash
npm run test:intake
```

The test uses a throwaway work order number and deletes that order before it exits. It does not leave a card on the board.

## Data model

SQLite (local file or Turso).

- `users` — staff. `role` is `admin` or `staff`.
- `lists` — the 25 columns, in `position` order. `kind` is `production`, `done`, or `utility`. To Order only looks at open production cards.
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

The board scrolls sideways across all 25 lists. Drag a card between columns or reorder it inside a column. Counts in the headers are open cards. Archive from the card, and turn on Archived in the filter bar to put it back. Search matches customer, work order, and invoice. Filters cover label, assignee, due date, and material status.

**To order** groups every Not In Stock line by vendor. Mark ordered when it is placed, then Mark here when it arrives.
