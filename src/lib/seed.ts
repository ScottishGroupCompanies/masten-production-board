import { randomUUID } from "crypto";
import { CUSTOM_FIELDS, LABELS, LISTS, slugId } from "@/data/board-schema";
import { adminCredentials, assertProductionConfig } from "./config";
import { ensureReady, migrate, transaction } from "./db";
import { hashPassword } from "./password";

export async function seedCatalog(): Promise<{ adminCreated: boolean }> {
  if (LISTS.length !== 25) throw new Error(`Expected 25 lists, found ${LISTS.length}`);
  if (LABELS.length !== 50) throw new Error(`Expected 50 labels, found ${LABELS.length}`);
  if (CUSTOM_FIELDS.length !== 15) throw new Error(`Expected 15 custom fields, found ${CUSTOM_FIELDS.length}`);

  const admin = adminCredentials();
  const now = new Date().toISOString();
  let adminCreated = false;

  await transaction(async (tx) => {
    const existingAdmin = await tx.all<{ id: string }>("select id from users where email = ?", [admin.email]);

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
      await tx.run(
        `insert into custom_fields (id, name, position) values (?, ?, ?)
         on conflict(name) do update set position = excluded.position`,
        [slugId("field", field.name), field.name, index],
      );
      for (const [optionIndex, option] of field.options.entries()) {
        const suffix = randomUUID().slice(0, 8);
        const optionKey = String(optionIndex);
        await tx.run(
          `update custom_field_options set position = ?
           where label = ? and field_id = (select id from custom_fields where name = ?)`,
          [optionIndex, option, field.name],
        );
        // Option ids stay `${stored field id}-${index}`. The index is bound as text so
        // SQLite does not turn 0 into 0.0. A short suffix is used only when that id is taken.
        await tx.run(
          `insert into custom_field_options (id, field_id, label, position)
           select
             case
               when exists (select 1 from custom_field_options where id = custom_fields.id || '-' || ?)
               then custom_fields.id || '-' || ? || '-' || ?
               else custom_fields.id || '-' || ?
             end,
             custom_fields.id,
             ?,
             ?
           from custom_fields
           where custom_fields.name = ?
             and not exists (
               select 1 from custom_field_options
               where field_id = custom_fields.id and label = ?
             )`,
          [optionKey, optionKey, suffix, optionKey, option, optionIndex, field.name, option],
        );
      }
    }

    if (!existingAdmin[0]) {
      await tx.run(
        `insert into users (id, email, name, password_hash, role, created_at)
         select ?, ?, ?, ?, ?, ?
         where not exists (select 1 from users where email = ?)`,
        [randomUUID(), admin.email, admin.name, hashPassword(admin.password), "admin", now, admin.email],
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
