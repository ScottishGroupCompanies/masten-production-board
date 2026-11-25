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

Lists, labels, and custom fields are the live board export in `src/data/live-board.json`: 19 lists in shop order, 50 labels with their Trello colors, and 15 custom fields. The shop dropdowns now live inside Materials. DO (Quantity) is a number. The other fields use the board’s exact dropdown options.

Stock on each material line is **In Stock**, **To Order**, **Pending**, **On Order**, **Here**, or **Discontinued – not in stock, needs attention**. The app does not read Google Sheets. Statuses change when someone sets them in the UI or when the intake API receives them. A daily stock check (below) is how the mats-in-stock sheet and the fillet sheet update existing cards.

Frames start as **To Order** until someone marks that frame **In Stock**. Fillets and mats follow the sheets you post. Glass (`glazing`) and foam (`backing`, also accepted as `foam`) are shown on the card. A To Order or On Order status on glass or foam is stored as In Stock, and those lines never appear in To order. A discontinued mat never appears in To order. If it is not in stock it is flagged **Discontinued – not in stock, needs attention**.

Six unused lists are removed on startup, and cards that are in those lists are deleted. Nothing else is deleted. The names David used, and the names stored on an older board, are:

| David’s name | Stored name |
| --- | --- |
| Measure Stack | Measure Stacked Frame |
| Past Due Priority | Past Due - PRIORITY |
| Reed Projects | Reed Projects |
| New List | New List |
| Text Message | Text Messages |
| Estimate/Quote | Estimates/Quotes |

`Jersey Re-Do's` and `Jersey Reduce` are renamed to **Re-do's**. The list id stays the same, so cards remain in that column.

A card title is `Customer W.O.##### Inv.##### (n/m) size phone`. The board refreshes about every 4 seconds, so a change one person saves shows up for everyone else without a reload.

## Environment variables

| Variable | Local | Production |
| --- | --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | unset | Cloudflare account id. Required with the two D1 variables below |
| `CLOUDFLARE_D1_DATABASE_ID` | unset | D1 database UUID. Required |
| `CLOUDFLARE_D1_API_TOKEN` | unset | API token with D1 Edit. Required. Sent as `Authorization: Bearer` |
| `DATABASE_URL` | `file:./data/masten.db` if unset | Not required when the D1 variables are set. Optional Turso fallback: `libsql://...` or `https://...` |
| `DATABASE_AUTH_TOKEN` | unused | Only for the Turso fallback. `TURSO_AUTH_TOKEN` is accepted as an alias |
| `BLOB_READ_WRITE_TOKEN` | optional; files stay in `data/uploads` | Vercel Blob read/write token. Required |
| `INTAKE_API_KEY` | `dev-masten-intake-key` if unset | long random key. Required, no default |
| `SESSION_SECRET` | a dev-only string if unset | random string, at least 32 characters. Required |
| `ADMIN_EMAIL` | required, no default | shop admin login. Required |
| `ADMIN_PASSWORD` | required, at least 8 characters | used only when that admin user is first created |
| `ADMIN_NAME` | optional, default `Shop admin` | display name for the new admin |

Copy `.env.example` to `.env.local` for local overrides. Do not commit `.env.local`.

## Deploy on Vercel

The board starts empty. Migration creates the 19 lists, 50 labels, 15 custom fields, and the admin user. It does not insert cards. Running it again does not change an existing admin password. It does delete cards that are still in the six retired lists above, and only those cards.

1. Create a Cloudflare D1 database (dashboard, or `npx wrangler d1 create masten-production`). Copy the account id and the database UUID.
2. Create a Cloudflare API token with Account permission **D1 Edit**. A read-only token cannot create tables or write cards.
3. In the Vercel project, create a Blob store. Connect it so Vercel sets `BLOB_READ_WRITE_TOKEN`.
4. Set these environment variables for Production (and Preview, if you want preview to boot):

```bash
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_D1_DATABASE_ID=your-database-uuid
CLOUDFLARE_D1_API_TOKEN=the-d1-edit-token
BLOB_READ_WRITE_TOKEN=the-vercel-blob-token
INTAKE_API_KEY=a-long-random-key
SESSION_SECRET=at-least-32-random-characters
ADMIN_EMAIL=you@mastenonline.com
ADMIN_PASSWORD=a-real-password
```

`DATABASE_URL` is not required when those three Cloudflare variables are set. The Node.js server calls the D1 HTTP API (`/query` for reads, `/raw` for writes). Statements that must commit together are sent as one `{ "batch": [...] }` request, because that API has no interactive transaction. If the D1 variables are unset, a Turso `DATABASE_URL` plus `DATABASE_AUTH_TOKEN` still works.

5. Import the repo and deploy. The server runs the same migration on boot.
6. You can also migrate from a machine that has the D1 variables, before or after deploy. This is safe to repeat and does not insert cards:

```bash
CLOUDFLARE_ACCOUNT_ID=your-account-id \
CLOUDFLARE_D1_DATABASE_ID=your-database-uuid \
CLOUDFLARE_D1_API_TOKEN=the-d1-edit-token \
ADMIN_EMAIL=you@mastenonline.com \
ADMIN_PASSWORD=... \
npm run db:migrate
```

`npm run db:migrate` prints list, label, field, user, and card counts, and the names of any retired lists it deleted. A new production database should report `cards 0`. Run it with the D1 variables set if you want the column cleanup before the next deploy. The same cleanup also runs when the server boots, so a normal Vercel deploy does it with the project’s D1 credentials. No other lists or cards are touched.

SQLite on the local disk does not persist on Vercel. D1 speaks the same SQL over HTTPS. In production, attachments are stored only in Vercel Blob. Locally, a file is written under `data/uploads`, and also to Blob when the token is set. Reads try the local file first, then Blob.

Do not run `npm run db:seed:demo` against the production database.

## Intake API

Every call needs `Authorization: Bearer $INTAKE_API_KEY` or `X-API-Key`. Automated changes are logged as **Masten Orders bot**.

New cards land in **New Work Orders** unless `list` is set. Sending the same work order and piece again updates that card and does not move it, unless `forceList` is true. A multi-piece order is several cards that share a W.O. number (`pieceIndex` / `pieceCount`, or a `pieces` array). The lookup key is W.O. number plus piece.

Stock statuses: `in_stock`, `not_in_stock` (To Order), `needs_human_check` (Pending), `ordered` (On Order), `here`, `discontinued_attention`. Aliases such as `to_order`, `on_order`, and `pending` are accepted. If a frame status is omitted, it becomes To Order. If glass or foam status is omitted, it becomes In Stock. Mats and fillets stay Pending until a status or a stock check sets them.

`email` is stored on its own and shown as a mailto link. A phone number in `additionalContact` that matches the customer phone is dropped. `dimensions` fills the dimensions field (the same value as `size`). If both are omitted, the first size in the art description is used, such as `16x20`.

Sending the same `invoiceNumber` on different work orders creates one card per work order (and per piece, when a work order has several pieces) and links them under Connected Orders. The response includes `linkedOrders`. Those links are loaded from the shared invoice number, so a later work order on that invoice shows up on the cards that were already there.

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

Sending the same filename again replaces that file. It does not change the customer, materials, list, or any other card field. `pieceIndex` is required only when the work order has more than one piece.

These two production cards already have their order PDFs. The same request attaches or replaces the PDF on an existing card (set `INTAKE_API_KEY` to the production key):

```bash
curl -s -X POST "https://masten-production-board.vercel.app/api/intake/orders/26522/attachments" \
  -H "Authorization: Bearer $INTAKE_API_KEY" \
  -F "file=@./20242.pdf;type=application/pdf" \
  -F "filename=20242.pdf"

curl -s -X POST "https://masten-production-board.vercel.app/api/intake/orders/26523/attachments" \
  -H "Authorization: Bearer $INTAKE_API_KEY" \
  -F "file=@./20243.pdf;type=application/pdf" \
  -F "filename=20243.pdf"
```

`26522` is Lifesaver Test, invoice 20242, card `3847a0ac-0023-40c1-b048-e55310695091`. `26523` is David Ferrer, invoice 20243, card `7a12d370-3289-4e12-9767-8ed14d83e06b`.

### Correct stock on one work order

`PATCH /api/intake/orders/:workOrder/materials` sets statuses on an existing card. Omit `itemCode` when that card has only one line of the kind. Codes match with or without hyphens and with or without a trailing D. A discontinued mat sent as To Order or On Order is stored as **Discontinued – not in stock, needs attention** instead.

```bash
curl -s -X PATCH http://127.0.0.1:4471/api/intake/orders/26523/materials \
  -H "Authorization: Bearer dev-masten-intake-key" \
  -H "Content-Type: application/json" \
  -d '{"materials":[{"kind":"top_mat","stockStatus":"in_stock"}]}'
```

Read the card first if you need the item code or there is more than one mat:

```bash
curl -s http://127.0.0.1:4471/api/intake/orders/26523 \
  -H "Authorization: Bearer dev-masten-intake-key"
```

Work order **26523** (David Ferrer, invoice 20243, card `7a12d370-3289-4e12-9767-8ed14d83e06b`) can show a mat as On Order while that mat is on the MATS IN STOCK sheet. The board never reads that sheet itself. The On Order value is whatever was stored when the card was created or last edited (`ordered`). To correct 26523, PATCH the mat to `in_stock` as above, or include its code in the daily stock check below. Either one sets it to In Stock. If the GET shows more than one mat line, add `itemCode` from that response so only the mat that is on the sheet changes.

### Daily stock check

`POST /api/intake/stock-check` is the re-check to run when an order arrives and once a day after you read the sheets. Send the codes that are in stock. Omit a sheet to leave that material alone. An empty array means the sheet lists nothing.

- A mat or fillet whose code is in the sheet becomes **In Stock**, including a line that was On Order.
- A mat or fillet that is not in the sheet becomes **To Order**, except lines already **On Order** or **Here**.
- Frames are not changed. A frame stays In Stock when someone marked it that way.
- Glass and foam are not changed and never show up in To order.
- A discontinued mat that is not in the sheet becomes **Discontinued – not in stock, needs attention**, never To Order.
- Optional `discontinuedMats` adds those codes (or replaces the list when `replaceDiscontinued` is true) and then applies the same rules.

```bash
curl -s -X POST http://127.0.0.1:4471/api/intake/stock-check \
  -H "Authorization: Bearer dev-masten-intake-key" \
  -H "Content-Type: application/json" \
  -d '{
    "matsInStock": ["C9893", "WB-1234"],
    "filletsInStock": ["FL-88"],
    "discontinuedMats": ["C9893D"]
  }'
```

The response lists how many lines were checked and the changes (capped at 200).

### Discontinued mat codes

Admins edit the list at `/discontinued`. The same list is available to the intake API. A code matches with or without a trailing D, and hyphens are ignored. `mode` is `add` (default) or `replace`.

```bash
curl -s http://127.0.0.1:4471/api/intake/discontinued-mats \
  -H "Authorization: Bearer dev-masten-intake-key"

curl -s -X PUT http://127.0.0.1:4471/api/intake/discontinued-mats \
  -H "Authorization: Bearer dev-masten-intake-key" \
  -H "Content-Type: application/json" \
  -d '{"mode":"add","codes":["C9893D",{"code":"WB-440D","note":"Lifesaver discontinued"}]}'

curl -s -X DELETE http://127.0.0.1:4471/api/intake/discontinued-mats \
  -H "Authorization: Bearer dev-masten-intake-key" \
  -H "Content-Type: application/json" \
  -d '{"codes":["WB-440D"]}'
```

A material description that contains `DISCONTINUED` (Lifesaver’s `<NAME>-DISCONTINUED-CHECK STOCK`) adds that item code to the list.

Mat lines in To order show the sheet size to buy, not the artwork size. Anything that fits in 32×40, in either orientation, shows **32x40** (a 16×20 piece included). Anything larger that fits in 40×60 shows **40x60**. Anything bigger shows **check size**. Add the next sheet to `MAT_ORDER_SIZES` in `src/data/board-schema.ts` when the shop starts ordering it.

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

SQLite. Development uses a local file. Production uses Cloudflare D1. A Turso libSQL database is an optional fallback when the D1 variables are unset.

- `users` — staff. `role` is `admin` or `staff`.
- `lists` — the shop columns, in `position` order. `kind` is `production`, `done`, or `utility`. To order only looks at open production cards, and it skips glass, foam, and discontinued mats.
- `labels` — name and color.
- `custom_fields` and `custom_field_options` — the 15 dropdowns.
- `cards` — one row per piece. Unique on (`work_order_number`, `piece_index`) when a work order is set. Holds customer, phone, email, invoice, dimensions (`size`), due date, start date, working notes, and the description sections. Connected Orders on the card are the other work orders that share the invoice number.
- `card_labels`, `card_assignees`, `card_field_values` — labels, people, and dropdown values.
- `material_lines` — kind, item code, vendor, and stock status.
- `discontinued_mats` — mat codes that can only come from stock on hand. Editable by admins and by the intake API.
- `notes` — author and timestamp.
- `checklists` and `checklist_items`.
- `attachments` — filename, mime type, and storage key. The Lifesaver PDF is `<invoice>.pdf`.
- `activity` — who changed what, and when. The bot’s name is `Masten Orders bot`.

## Everyday use

The board scrolls sideways across the lists. On a phone, a touch drag starts only after a short press-and-hold, so scrolling a column does not move a card. **Lock dragging** / **Unlock dragging** in the filter bar turns dragging off for this person on this device and remembers that choice.

A circle by the customer name moves that card to Completed. Clicking a card opens it over the board. Closing it leaves the board where it was. `/cards/<id>` still opens the card on its own page.

Each tile shows the cover photo, the date the card was added, and the status of Frame, Top mat, 2nd mat, Glass, and Fillets when that line exists. Notes on the card save while you type. Every signed-in person, staff included, can view, edit, and move every card. Only Users and Discontinued mats are admin-only.

**To order** groups every To Order line by vendor. Mats show the sheet size to order (32x40, 40x60, or check size). Mark on order when it is placed, then Mark here when it arrives.

## Accounts

An admin opens **Users** in the header (`/users`) to add a person, reset a password, change a role, or remove an account. The email is the login. It does not have to be a real mailbox, so an address like `name@masten.test` is allowed. The password is at least 8 characters and is stored with the same hash as the first admin.

Staff who open `/users` or `/discontinued` get **403** and do not see the page. Anyone who is signed in can change their own password from **Password** in the header (`/account`).

The last admin cannot be removed or changed to staff. New accounts are created in the app. They are not written into the repo, the migration, or the demo seed.
