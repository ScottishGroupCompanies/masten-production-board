import { simplePdf } from "../src/lib/pdf";

const base = process.env.BASE_URL || "http://127.0.0.1:4471";
const key = process.env.INTAKE_API_KEY || "dev-masten-intake-key";

async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${key}`);
  const response = await fetch(`${base}${path}`, { ...init, headers });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} -> ${response.status} ${text}`);
  }
  return body;
}

async function main() {
  const created = await request("/api/intake/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workOrderNumber: "99001",
      invoiceNumber: "21099",
      customerName: "Sample Intake",
      phone: "303-555-0199",
      dueDate: "2026-12-05",
      startDate: "2026-11-18",
      size: "16x20",
      pieceIndex: 1,
      pieceCount: 1,
      artDescription: "Graphite study of a cottonwood. API sample, not a real order.",
      artLocation: "Bin A-1",
      artCondition: "Good",
      sharedMats: "None",
      materials: [
        { kind: "frame", itemCode: "LJ-8801", vendor: "Larson", stockStatus: "not_in_stock" },
        { kind: "top_mat", itemCode: "C-9893", vendor: "Crescent", stockStatus: "in_stock" },
        { kind: "glazing", itemCode: "Museum 16x20", vendor: "Larson" },
      ],
    }),
  });
  if (created.results[0].action !== "created" && created.results[0].action !== "updated") {
    throw new Error("Upsert did not return a card");
  }
  const firstId = created.results[0].id;

  const updated = await request("/api/intake/orders", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workOrderNumber: "99001",
      invoiceNumber: "21099",
      customerName: "Sample Intake",
      phone: "303-555-0199",
      dueDate: "2026-12-12",
      list: "Completed 🎊",
      size: "16x20",
    }),
  });
  if (updated.results[0].id !== firstId) throw new Error("Upsert created a second card");
  if (updated.results[0].action !== "updated") throw new Error("Second call was not an update");
  if (updated.results[0].list === "Completed 🎊") throw new Error("Update moved the card without forceList");

  const pdf = simplePdf("Work order 99001", ["Customer: Sample Intake", "Invoice: 21099", "API sample PDF"]);
  const form = new FormData();
  form.set("file", new File([new Uint8Array(pdf)], "21099.pdf", { type: "application/pdf" }));
  form.set("filename", "21099.pdf");
  form.set("pieceIndex", "1");
  const attached = await request("/api/intake/orders/99001/attachments", { method: "POST", body: form });
  if (attached.filename !== "21099.pdf") throw new Error("Attachment filename was not the invoice PDF");

  await request("/api/intake/orders/99001/materials", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      materials: [
        { kind: "frame", itemCode: "LJ-8801", stockStatus: "ordered" },
        { kind: "glazing", itemCode: "Museum 16x20", stockStatus: "needs_human_check" },
      ],
    }),
  });

  await request("/api/intake/orders/99001/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: "Glass still needs a person to check the Larson rack." }),
  });

  const moved = await request("/api/intake/orders/99001/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ list: "Materials to Check" }),
  });
  if (!moved.moved[0].changed && moved.moved[0].to !== "Materials to Check") {
    throw new Error("Move did not land on Materials to Check");
  }

  const order = await request("/api/intake/orders/99001");
  const card = order.cards[0];
  const frame = card.materials.find((line: { itemCode: string }) => line.itemCode === "LJ-8801");
  const glass = card.materials.find((line: { kind: string }) => line.kind === "glazing");
  if (frame?.stockStatus !== "ordered") throw new Error(`Frame status was ${frame?.stockStatus}`);
  if (glass?.stockStatus !== "needs_human_check") throw new Error("Omitted glass status was not Needs Human Check");
  if (!card.notes.some((note: { authorName: string }) => note.authorName === "Masten Orders bot")) {
    throw new Error("Note was not authored by Masten Orders bot");
  }
  if (!card.attachments.some((file: { filename: string }) => file.filename === "21099.pdf")) {
    throw new Error("PDF was not stored on the card");
  }
  if (!card.activity.some((event: { actorName: string }) => event.actorName === "Masten Orders bot")) {
    throw new Error("Activity was not logged for the bot");
  }

  const denied = await fetch(`${base}/api/intake/orders/99001`);
  if (denied.status !== 401) throw new Error(`Expected 401 without a key, got ${denied.status}`);

  console.log("Intake sample passed for W.O.99001 on Materials to Check.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
