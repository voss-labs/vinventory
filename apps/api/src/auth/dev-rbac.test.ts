import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@vinventory/db";
import { DEV_LAB_IDS, DEV_PERSONAS, seedDevelopmentData } from "@vinventory/db/dev";

import { buildApp } from "../app.js";
import { DrizzleInventoryRepository } from "../inventory/repository.js";
import { DrizzleLabsRepository } from "../labs/repository.js";
import { hashToken, randomToken } from "./crypto.js";
import { DrizzleDevAuthRepository } from "./dev-repository.js";
import { DrizzleAuthRepository } from "./repository.js";
import { labPermissions, type LabPermission, type OidcClient } from "./types.js";

// The production repositories against the real migration and the real seed, in an
// in-memory PostgreSQL engine. No mocks: if a persona can do something here, the
// same rows would let them do it in production.
const client = new PGlite();
const db = drizzle(client) as unknown as Database;
const authRepository = new DrizzleAuthRepository(db);
const labsRepository = new DrizzleLabsRepository(db);
const inventoryRepository = new DrizzleInventoryRepository(db);
const devRepository = new DrizzleDevAuthRepository(db);

const webOrigin = "http://localhost:5173";
const labs = { "DEV-VLSI": DEV_LAB_IDS.vlsi, "DEV-EMB": DEV_LAB_IDS.emb } as const;
type LabCode = keyof typeof labs;

// Section A7 of the build spec. `true`/`false` apply to all six permissions.
const all = true;
const none = false;
const expectedMatrix: Record<string, Record<LabCode, boolean | readonly LabPermission[]>> = {
  admin: { "DEV-VLSI": all, "DEV-EMB": all },
  "incharge-vlsi": { "DEV-VLSI": all, "DEV-EMB": none },
  "incharge-emb": { "DEV-VLSI": none, "DEV-EMB": all },
  "staff-restricted": { "DEV-VLSI": ["issue", "receive"], "DEV-EMB": none },
  student: { "DEV-VLSI": none, "DEV-EMB": none },
  unassigned: { "DEV-VLSI": none, "DEV-EMB": none },
  deactivated: { "DEV-VLSI": none, "DEV-EMB": none },
};

const expectedManagedLabs: Record<string, LabCode[]> = {
  admin: ["DEV-EMB", "DEV-VLSI"],
  "incharge-vlsi": ["DEV-VLSI"],
  "incharge-emb": ["DEV-EMB"],
};

function expected(persona: string, lab: LabCode, permission: LabPermission): boolean {
  const cell = expectedMatrix[persona]?.[lab];
  return Array.isArray(cell) ? cell.includes(permission) : cell === true;
}

const matrixCases = DEV_PERSONAS.flatMap((persona) =>
  (Object.keys(labs) as LabCode[]).flatMap((lab) =>
    labPermissions.map((permission) => ({
      name: `${persona.key} ${permission} on ${lab}`,
      persona,
      lab,
      permission,
      allowed: expected(persona.key, lab, permission),
    })),
  ),
);

const unusedOidcClient: OidcClient = {
  createAuthorizationRequest: async () => {
    throw new Error("VAuth is not used in these tests");
  },
  exchangeCallback: async () => {
    throw new Error("VAuth is not used in these tests");
  },
};

let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  await client.exec(await readFile(new URL("../../../../packages/db/migrations/0000_spooky_pestilence.sql", import.meta.url), "utf8"));
  await seedDevelopmentData(db);
  app = await buildApp({
    logger: false,
    inventory: inventoryRepository,
    labs: labsRepository,
    auth: {
      repository: authRepository,
      oidcClient: unusedOidcClient,
      cookieSecret: "test-cookie-secret-that-is-at-least-32-characters",
      secureCookies: false,
      sessionTtlHours: 12,
      webOrigin,
      callbackUrl: `${webOrigin}/api/auth/oauth2/callback/voss`,
    },
    devAuth: { devRepository },
  });
}, 30000);

afterAll(async () => {
  await app.close();
  await client.close();
});

async function loginAs(persona: string): Promise<string> {
  const response = await app.inject({ method: "POST", url: "/auth/dev/login", payload: { persona } });
  expect(response.statusCode).toBe(200);
  const raw = response.headers["set-cookie"];
  const cookie = (Array.isArray(raw) ? raw : [raw]).find((value) => value?.startsWith("vinventory_session="));
  if (!cookie) throw new Error(`No session cookie for ${persona}`);
  return cookie.split(";", 1)[0] ?? cookie;
}

function get(url: string, cookie: string) {
  return app.inject({ method: "GET", url, headers: { cookie } });
}

describe("permission matrix against seeded data", () => {
  // A loop rather than it.each: "$name" interpolation truncates long names, and
  // each test name must spell out the full cell.
  for (const { name, persona, lab, permission, allowed } of matrixCases) {
    it(name, async () => {
      expect(await authRepository.hasLabPermission(persona.userId, labs[lab], permission), name).toBe(allowed);
    });
  }
});

describe("lab directory against seeded data", () => {
  it.each(DEV_PERSONAS.map((persona) => ({ key: persona.key, persona })))("$key sees both active labs", async ({ persona }) => {
    const result = await labsRepository.listActiveLabs({
      id: persona.userId,
      displayName: persona.name,
      email: persona.email,
      accountType: persona.accountType,
    });
    const managed = expectedManagedLabs[persona.key] ?? [];

    expect(result.map((lab) => lab.code)).toEqual(["DEV-EMB", "DEV-VLSI"]);
    for (const lab of result) {
      expect({ code: lab.code, canManageStock: lab.canManageStock })
        .toEqual({ code: lab.code, canManageStock: managed.includes(lab.code as LabCode) });
    }
  });
});

describe("persona boundaries end to end", () => {
  it("incharge-vlsi manages its own lab and is denied in the other", async () => {
    const cookie = await loginAs("incharge-vlsi");

    const own = await get(`/api/labs/${DEV_LAB_IDS.vlsi}/import-policies`, cookie);
    expect(own.statusCode).toBe(200);
    expect((own.json() as { policies: unknown[] }).policies).toHaveLength(2);

    const other = await get(`/api/labs/${DEV_LAB_IDS.emb}/import-policies`, cookie);
    expect(other.statusCode).toBe(403);
    expect(other.json()).toEqual({ error: "lab_access_denied" });
  });

  it("staff-restricted can issue in DEV-VLSI but cannot import stock or reach DEV-EMB", async () => {
    const cookie = await loginAs("staff-restricted");

    expect((await get(`/api/labs/${DEV_LAB_IDS.vlsi}/issue-access`, cookie)).statusCode).toBe(200);
    expect((await get(`/api/labs/${DEV_LAB_IDS.vlsi}/import-policies`, cookie)).statusCode).toBe(403);
    expect((await get(`/api/labs/${DEV_LAB_IDS.emb}/issue-access`, cookie)).statusCode).toBe(403);
  });

  it("unassigned reaches the limited state: browses labs, manages nothing", async () => {
    const cookie = await loginAs("unassigned");

    const me = await get("/api/me", cookie);
    expect(me.statusCode).toBe(200);
    expect(me.json()).toEqual({ user: expect.objectContaining({ email: "unassigned@dev.vinventory.invalid", accountType: "student" }) });

    const directory = await get("/api/labs", cookie);
    expect(directory.statusCode).toBe(200);
    const listed = (directory.json() as { labs: { code: string; canManageStock: boolean }[] }).labs;
    expect(listed.map((lab) => lab.code)).toEqual(["DEV-EMB", "DEV-VLSI"]);
    expect(listed.every((lab) => !lab.canManageStock)).toBe(true);

    expect((await get("/api/import-labs", cookie)).json()).toEqual({ labs: [] });
    expect((await get(`/api/labs/${DEV_LAB_IDS.vlsi}/import-policies`, cookie)).statusCode).toBe(403);
    expect((await get(`/api/labs/${DEV_LAB_IDS.emb}/import-policies`, cookie)).statusCode).toBe(403);
  });

  it("deactivated cannot log in, and an existing session for it is rejected", async () => {
    const login = await app.inject({ method: "POST", url: "/auth/dev/login", payload: { persona: "deactivated" } });
    expect(login.statusCode).toBe(404);

    const deactivated = DEV_PERSONAS.find((persona) => persona.key === "deactivated")!;
    const token = randomToken();
    await authRepository.createSession({
      userId: deactivated.userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      userAgent: null,
      ipHash: null,
    });

    const me = await get("/api/me", `vinventory_session=${app.signCookie(token)}`);
    expect(me.statusCode).toBe(401);
  });

  it("admin manages stock in both labs", async () => {
    const cookie = await loginAs("admin");

    expect((await get(`/api/labs/${DEV_LAB_IDS.vlsi}/import-policies`, cookie)).statusCode).toBe(200);
    expect((await get(`/api/labs/${DEV_LAB_IDS.emb}/import-policies`, cookie)).statusCode).toBe(200);
  });
});
