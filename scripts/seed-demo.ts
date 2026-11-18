import { loadEnvFiles } from "./load-env";

async function main() {
  loadEnvFiles();
  const { seedDemo } = await import("../src/lib/demo-seed");
  const result = await seedDemo();
  if (result.skipped) {
    console.log("Demo cards were already loaded. Nothing new was added.");
  } else {
    console.log(`Loaded ${result.inserted} demo cards.`);
  }
  console.log("Demo staff use the same password as ADMIN_PASSWORD.");
  console.log("avery.chen@masten.test, jordan.hale@masten.test, priya.nandakumar@masten.test, luis.ortega@masten.test");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
