import { randomUUID } from "crypto";
import { hashSync } from "bcryptjs";
import { CUSTOM_FIELDS, LABELS, LISTS, slugId } from "@/data/board-schema";
import { adminCredentials, assertProductionConfig } from "./config";
import { ensureReady, migrate, transaction } from "./db";

export async function seedCatalog(): Promise<{ adminCreated: boolean }> {
  if (LISTS.length !== 25) throw new Error(`Expected 25 lists, found ${LISTS.length}`);
  if (LABELS.length !== 50) throw new Error(`Expected 50 labels, found ${LABELS.length}`);
  if (CUSTOM_FIELDS.length !== 15) throw new Error(`Expected 15 custom fields, found ${CUSTOM_FIELDS.length}`);

  const admin = adminCredentials();
  const now = new Date().toISOString();
  let adminCreated = false;

  await transaction(async (tx) => {
    for (const [index, list] of LISTS.entries()) {
      await tx.run(
        `insert into lists (id, name, position, kind) values (?, ?, ?, ?)
         on conflict(name) do update set position = excluded.position, kind = excluded.kind`,
        [slugId("list", list.name), list.name, index, list.kind],
      );
    }
    for (const [index, label] of LABELS.entries()) {
      await tx.run(
        `insert into labels (id, name, color, position) values (?, ?, ?, ?)
         on conflict(name) do update set color = excluded.color, position = excluded.position`,
        [`${slugId("label", label.name)}-${index}`, label.name, label.color, index],
      );
    }
    for (const [index, field] of CUSTOM_FIELDS.entries()) {
      const preferredId = slugId("field", field.name);
      await tx.run(
        `insert into custom_fields (id, name, position) values (?, ?, ?)
         on conflict(name) do update set position = excluded.position`,
        [preferredId, field.name, index],
      );
      const stored = await tx.all<{ id: string }>("select id from custom_fields where name = ?", [field.name]);
      const fieldId = stored[0]?.id ?? preferredId;
      for (const [optionIndex, option] of field.options.entries()) {
        const existing = await tx.all<{ id: string }>(
          "select id from custom_field_options where field_id = ? and label = ?",
          [fieldId, option],
        );
        if (existing[0]) {
          await tx.run("update custom_field_options set position = ? where id = ?", [optionIndex, existing[0].id]);
          continue;
        }
        const preferredOptionId = `${fieldId}-${optionIndex}`;
        const taken = await tx.all<{ id: string }>("select id from custom_field_options where id = ?", [preferredOptionId]);
        const optionId = taken[0] ? `${preferredOptionId}-${randomUUID().slice(0, 8)}` : preferredOptionId;
        await tx.run(
          "insert into custom_field_options (id, field_id, label, position) values (?, ?, ?, ?)",
          [optionId, fieldId, option, optionIndex],
        );
      }
    }

    const existingAdmin = await tx.all<{ id: string }>("select id from users where email = ?", [admin.email]);
    if (!existingAdmin[0]) {
      await tx.run(
        "insert into users (id, email, name, password_hash, role, created_at) values (?, ?, ?, ?, ?, ?)",
        [randomUUID(), admin.email, admin.name, hashSync(admin.password, 8), "admin", now],
      );
      adminCreated = true;
    }

    await tx.run(
      `insert into meta (key, value) values (?, ?)
       on conflict(key) do update set value = excluded.value`,
      ["schema_version", "1"],
    );
  });

  return { adminCreated };
}

export function ensureDatabase(): Promise<void> {
  return ensureReady(async () => {
    if (process.env.NEXT_PHASE !== "phase-production-build") assertProductionConfig();
    await migrate();
    await seedCatalog();
  });
}
