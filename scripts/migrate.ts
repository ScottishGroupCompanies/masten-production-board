import { loadEnvFiles } from "./load-env";

async function main() {
  loadEnvFiles();
  const { ensureDatabase } = await import("../src/lib/seed");
  const { all, get } = await import("../src/lib/db");

  await ensureDatabase();

  const [lists, labels, fields, users, cards] = await Promise.all([
    get<{ n: number | bigint }>("select count(*) as n from lists"),
    get<{ n: number | bigint }>("select count(*) as n from labels"),
    get<{ n: number | bigint }>("select count(*) as n from custom_fields"),
    get<{ n: number | bigint }>("select count(*) as n from users"),
    get<{ n: number | bigint }>("select count(*) as n from cards"),
  ]);
  const admins = await all<{ email: string }>("select email from users where role = 'admin' order by email");

  console.log("Migration finished. Existing cards were left in place.");
  console.log(`lists ${Number(lists?.n ?? 0)}`);
  console.log(`labels ${Number(labels?.n ?? 0)}`);
  console.log(`custom fields ${Number(fields?.n ?? 0)}`);
  console.log(`users ${Number(users?.n ?? 0)}`);
  console.log(`cards ${Number(cards?.n ?? 0)}`);
  console.log(`admins ${admins.map((row) => row.email).join(", ") || "(none)"}`);
  console.log("The admin password is set only when that email is created. A later run does not change it.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
