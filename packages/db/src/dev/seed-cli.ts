// Refuses before connecting if the target isn't local. DATABASE_URL comes from
// the environment (dev:setup passes the local URL explicitly; load-env.mjs
// lets that value win over .env).
import { createDatabase } from "../index.js";
import { isLocalDatabaseUrl } from "./local-url.js";
import { seedDevelopmentData } from "./seed.js";

// Names the host without echoing credentials from the URL.
function safeHost(value: string): string {
  if (!value) return "DATABASE_URL is empty";
  try {
    return `host ${new URL(value).host || "missing"}`;
  } catch {
    return "DATABASE_URL is not a valid URL";
  }
}

const url = process.env.DATABASE_URL ?? "";
if (!isLocalDatabaseUrl(url)) {
  console.error(`Refusing to seed: DATABASE_URL is not a local database (${safeHost(url)}).`);
  console.error("If your .env points at a hosted database, move it aside (for example to .env.neon) and re-run.");
  process.exit(1);
}

const { db, close } = createDatabase(url);
try {
  const summary = await seedDevelopmentData(db);
  console.log(`Seeded the development database (${safeHost(url)}):`);
  console.table(summary);
} catch (error) {
  console.error("Seeding failed; the transaction was rolled back and nothing was changed.");
  console.error(error);
  process.exitCode = 1;
} finally {
  await close();
}
