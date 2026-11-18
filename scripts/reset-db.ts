import fs from "fs";
import { loadEnvFiles } from "./load-env";

async function main() {
  loadEnvFiles();
  const { isRemoteDatabase } = await import("../src/lib/config");
  if (isRemoteDatabase()) {
    console.error("Refusing to delete a remote database. db:reset only removes the local SQLite file.");
    process.exit(1);
  }

  const { localDatabaseFile } = await import("../src/lib/db");
  const file = localDatabaseFile();
  for (const candidate of [file, `${file}-wal`, `${file}-shm`]) {
    fs.rmSync(candidate, { force: true });
  }
  console.log("Removed the local database. Restart the app, or run npm run db:migrate, to create an empty board.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
