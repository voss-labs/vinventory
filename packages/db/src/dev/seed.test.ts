import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "../index.js";
import { DEV_PERSONAS, findPersona } from "./personas.js";
import { seedDevelopmentData } from "./seed.js";

// A fresh, in-memory PostgreSQL engine; never uses DATABASE_URL.
const client = new PGlite();
const db = drizzle(client) as unknown as Database;

// The first six are section A6 of the build spec; the rest follow from its stock table.
const expectedCounts = {
  users: 7, labs: 3, lab_memberships: 4, stock_policies: 3, lab_stock: 7, physical_units: 5,
  component_models: 7, quantity_balances: 4, inventory_movements: 9, audit_events: 7,
};

async function countRows(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of Object.keys(expectedCounts)) {
    const result = await client.query<{ count: number }>(`SELECT count(*)::int AS count FROM ${table}`);
    counts[table] = result.rows[0]?.count ?? -1;
  }
  return counts;
}

async function userIds(): Promise<string[]> {
  return (await client.query<{ id: string }>("SELECT id FROM users ORDER BY id")).rows.map((row) => row.id);
}

beforeAll(async () => {
  await client.exec(await readFile(new URL("../../migrations/0000_spooky_pestilence.sql", import.meta.url), "utf8"));
}, 30000);
afterAll(async () => { await client.close(); });

describe("seedDevelopmentData", () => {
  it("produces identical row counts and user ids when run twice", async () => {
    const summary = await seedDevelopmentData(db);
    expect(summary).toEqual(expectedCounts);
    const firstCounts = await countRows();
    const firstIds = await userIds();
    expect(firstCounts).toEqual(expectedCounts);

    await seedDevelopmentData(db);
    expect(await countRows()).toEqual(firstCounts);
    expect(await userIds()).toEqual(firstIds);
  });

  it("creates exactly one matching user row for every persona", async () => {
    await seedDevelopmentData(db);
    for (const persona of DEV_PERSONAS) {
      const result = await client.query<Record<string, unknown>>(
        "SELECT id, auth_provider, auth_subject, email, account_type, is_active FROM users WHERE id = $1",
        [persona.userId],
      );
      expect(result.rows).toEqual([{
        id: persona.userId, auth_provider: "dev", auth_subject: `dev:${persona.key}`, email: persona.email,
        account_type: persona.accountType, is_active: persona.isActive,
      }]);
    }
  });
});

describe("DEV_PERSONAS", () => {
  it("has unique keys and emails, all on the reserved .invalid domain", () => {
    const keys = DEV_PERSONAS.map((persona) => persona.key);
    const emails = DEV_PERSONAS.map((persona) => persona.email);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(emails).size).toBe(emails.length);
    for (const email of emails) expect(email.endsWith("@dev.vinventory.invalid")).toBe(true);
  });

  it("finds a persona by key", () => {
    expect(findPersona("admin")?.name).toBe("Asha Deshpande");
  });

  it.each([undefined, "", "admin@dev.vinventory.invalid", "admin' OR 1=1", 1])(
    "findPersona(%j) returns null",
    (key) => {
      expect(findPersona(key)).toBeNull();
    },
  );
});
