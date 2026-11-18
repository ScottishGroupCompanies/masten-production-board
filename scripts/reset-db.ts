import fs from "fs";
import path from "path";

const file = path.join(process.cwd(), "data", "masten.db");
for (const candidate of [file, `${file}-wal`, `${file}-shm`]) {
  fs.rmSync(candidate, { force: true });
}
console.log("Removed the local database. Restart the app to seed it again.");
