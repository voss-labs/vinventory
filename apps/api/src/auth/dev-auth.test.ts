import { afterEach, describe, expect, it, vi } from "vitest";

import { DEV_PERSONAS } from "@vinventory/db/dev";

import { buildApp } from "../app.js";
import type { AuthRepository, CurrentUser, DevAuthRepository, OidcClient } from "./types.js";

const webOrigin = "http://localhost:5173";

function cookieFrom(
  headers: Record<string, string | string[] | number | undefined>,
  name: string,
): string {
  const raw = headers["set-cookie"];
  const values = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? [raw]
      : [];
  const cookie = values.find((value) => value.startsWith(`${name}=`));

  if (!cookie) {
    throw new Error(`Missing ${name} cookie`);
  }

  return cookie.split(";", 1)[0] ?? cookie;
}

// Stands in for a seeded database: every active persona exists, `deactivated` does not
// come back (findDevUser filters on is_active), and `missing` can drop a persona as if
// the seed was never run.
function createFixture(missing: string[] = []) {
  const seeded = new Map<string, CurrentUser>(
    DEV_PERSONAS.filter((persona) => persona.isActive && !missing.includes(persona.key)).map((persona) => [
      persona.email,
      { id: persona.userId, displayName: persona.name, email: persona.email, accountType: persona.accountType },
    ]),
  );
  const sessions = new Map<string, CurrentUser>();

  const devRepository: DevAuthRepository = {
    findDevUser: vi.fn(async (email: string) => seeded.get(email) ?? null),
  };
  const repository: AuthRepository = {
    upsertIdentity: vi.fn(async () => {
      throw new Error("Dev login must not upsert identities");
    }),
    createSession: vi.fn(async (input) => {
      const user = [...seeded.values()].find((candidate) => candidate.id === input.userId);
      if (user) sessions.set(input.tokenHash, user);
    }),
    findActiveSession: vi.fn(async (tokenHash) => sessions.get(tokenHash) ?? null),
    revokeSession: vi.fn(async (tokenHash) => {
      sessions.delete(tokenHash);
    }),
    hasLabPermission: vi.fn(async () => false),
  };
  const oidcClient: OidcClient = {
    createAuthorizationRequest: vi.fn(async () => {
      throw new Error("not used");
    }),
    exchangeCallback: vi.fn(async () => {
      throw new Error("not used");
    }),
  };

  return { devRepository, repository, oidcClient };
}

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function createApp({ devAuth = true, missing = [] as string[] } = {}) {
  const { devRepository, repository, oidcClient } = createFixture(missing);
  const app = await buildApp({
    logger: false,
    auth: {
      repository,
      oidcClient,
      cookieSecret: "test-cookie-secret-that-is-at-least-32-characters",
      secureCookies: false,
      sessionTtlHours: 12,
      webOrigin,
      callbackUrl: `${webOrigin}/api/auth/oauth2/callback/voss`,
    },
    ...(devAuth ? { devAuth: { devRepository } } : {}),
  });
  apps.push(app);
  return { app, devRepository, repository };
}

function login(app: Awaited<ReturnType<typeof buildApp>>, payload?: unknown, headers: Record<string, string> = {}) {
  return app.inject({
    method: "POST",
    url: "/auth/dev/login",
    headers,
    ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
  });
}

describe("development login", () => {
  it("does not exist when dev auth was not enabled at startup", async () => {
    const { app } = await createApp({ devAuth: false });

    expect((await app.inject({ method: "GET", url: "/auth/dev/personas" })).statusCode).toBe(404);
    expect((await login(app, { persona: "admin" })).statusCode).toBe(404);
  });

  it("refuses to build an app with dev auth in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(createApp()).rejects.toThrow("must not be registered in production");
  });

  it("lists the six active personas and hides the deactivated one", async () => {
    const { app } = await createApp();

    const response = await app.inject({ method: "GET", url: "/auth/dev/personas" });
    const keys = (response.json() as { personas: { key: string }[] }).personas.map((persona) => persona.key);

    expect(response.statusCode).toBe(200);
    expect(keys).toHaveLength(6);
    expect(keys).not.toContain("deactivated");
  });

  it("creates a real session and replaces it when switching persona", async () => {
    const { app, repository } = await createApp();

    const asAdmin = await login(app, { persona: "admin" });
    expect(asAdmin.statusCode).toBe(200);
    const adminCookie = cookieFrom(asAdmin.headers, "vinventory_session");
    const adminMe = await app.inject({ method: "GET", url: "/api/me", headers: { cookie: adminCookie } });
    expect(adminMe.json()).toEqual({ user: expect.objectContaining({ email: "admin@dev.vinventory.invalid", accountType: "system_admin" }) });

    const asStudent = await login(app, { persona: "student" }, { cookie: adminCookie });
    expect(asStudent.statusCode).toBe(200);
    expect(repository.revokeSession).toHaveBeenCalledOnce();
    expect((await app.inject({ method: "GET", url: "/api/me", headers: { cookie: adminCookie } })).statusCode).toBe(401);

    const studentCookie = cookieFrom(asStudent.headers, "vinventory_session");
    const studentMe = await app.inject({ method: "GET", url: "/api/me", headers: { cookie: studentCookie } });
    expect(studentMe.json()).toEqual({ user: expect.objectContaining({ email: "student@dev.vinventory.invalid", accountType: "student" }) });
  });

  it.each([
    ["an unknown key", { persona: "superuser" }, "unknown_persona"],
    ["an email address", { persona: "admin@dev.vinventory.invalid" }, "unknown_persona"],
    ["an injection attempt", { persona: "admin' OR 1=1" }, "unknown_persona"],
    ["a non-string persona", { persona: 1 }, "invalid_request"],
    ["a missing body", undefined, "invalid_request"],
  ])("rejects %s without creating a session", async (_case, payload, error) => {
    const { app, repository } = await createApp();

    const response = await login(app, payload);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error });
    expect(repository.createSession).not.toHaveBeenCalled();
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("rejects a cross-origin login", async () => {
    const { app, repository } = await createApp();

    const response = await login(app, { persona: "admin" }, { origin: "https://untrusted.example" });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "request_origin_not_allowed" });
    expect(repository.createSession).not.toHaveBeenCalled();
  });

  it("refuses the deactivated persona", async () => {
    const { app, repository } = await createApp();

    const response = await login(app, { persona: "deactivated" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "persona_not_available", hint: "This persona is deactivated or not seeded. Run pnpm dev:seed if you expected it to exist." });
    expect(repository.createSession).not.toHaveBeenCalled();
  });

  it("points at the seed when a persona is not in the database", async () => {
    const { app, repository } = await createApp({ missing: ["admin"] });

    const response = await login(app, { persona: "admin" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "persona_not_available", hint: "This persona is deactivated or not seeded. Run pnpm dev:seed if you expected it to exist." });
    expect(repository.createSession).not.toHaveBeenCalled();
  });
});
