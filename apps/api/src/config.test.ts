import { describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";

const validEnvironment = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://user:password@localhost:5432/vinventory_test",
  API_HOST: "127.0.0.1",
  API_PORT: "3001",
  WEB_ORIGIN: "http://localhost:5173",
  COOKIE_SECRET: "a-cookie-secret-with-more-than-32-characters",
  SESSION_TTL_HOURS: "8",
  VAUTH_ISSUER: "http://localhost:3002/api/auth",
  VAUTH_CLIENT_ID: "vinventory-test",
  VAUTH_CLIENT_SECRET: "test-secret",
  VAUTH_REDIRECT_URI: "http://localhost:5173/api/auth/oauth2/callback/voss",
} satisfies NodeJS.ProcessEnv;

describe("configuration", () => {
  it("loads an explicit test configuration", () => {
    const config = loadConfig(validEnvironment);

    expect(config.environment).toBe("test");
    expect(config.apiPort).toBe(3001);
    expect(config.sessionTtlHours).toBe(8);
    expect(config.vAuth.allowInsecureRequests).toBe(true);
  });

  it("requires HTTPS for the production identity provider", () => {
    expect(() =>
      loadConfig({ ...validEnvironment, NODE_ENV: "production" }),
    ).toThrow("VAUTH_ISSUER must use HTTPS in production");
  });

  it("rejects short cookie secrets", () => {
    expect(() =>
      loadConfig({ ...validEnvironment, COOKIE_SECRET: "too-short" }),
    ).toThrow();
  });

  it("accepts the supplied VOSS names and hosted discovery", () => {
    const { VAUTH_CLIENT_ID, VAUTH_CLIENT_SECRET, VAUTH_ISSUER, ...environment } = validEnvironment;
    const config = loadConfig({ ...environment,
      VOSS_CLIENT_ID: VAUTH_CLIENT_ID, VOSS_CLIENT_SECRET: VAUTH_CLIENT_SECRET,
      VOSS_DISCOVERY_URL: "https://accounts.vosslabs.org/api/auth/.well-known/openid-configuration",
    });
    expect(config.vAuth).toMatchObject({
      issuer: "https://accounts.vosslabs.org/api/auth",
      discoveryUrl: "https://accounts.vosslabs.org/api/auth/.well-known/openid-configuration",
      clientId: VAUTH_CLIENT_ID, clientSecret: VAUTH_CLIENT_SECRET,
      allowInsecureRequests: false,
    });
  });

  it("defaults legacy client settings to hosted discovery when no issuer is supplied", () => {
    const { VAUTH_ISSUER, ...environment } = validEnvironment;
    expect(loadConfig(environment).vAuth.issuer).toBe("https://accounts.vosslabs.org/api/auth");
  });

  it.each([
    { VOSS_CLIENT_ID: "other-client" },
    { VOSS_CLIENT_SECRET: "other-secret" },
    { VOSS_DISCOVERY_URL: "https://accounts.vosslabs.org/api/auth/.well-known/openid-configuration" },
  ])("rejects conflicting aliases without exposing values", (overrides) => {
    expect(() => loadConfig({ ...validEnvironment, ...overrides })).toThrow(/Conflicting/);
    try { loadConfig({ ...validEnvironment, ...overrides }); } catch (error) {
      expect(String(error)).not.toContain("other-secret");
    }
  });

  it("accepts matching aliases", () => {
    expect(loadConfig({ ...validEnvironment,
      VOSS_CLIENT_ID: validEnvironment.VAUTH_CLIENT_ID,
      VOSS_CLIENT_SECRET: validEnvironment.VAUTH_CLIENT_SECRET,
      VOSS_DISCOVERY_URL: `${validEnvironment.VAUTH_ISSUER}/.well-known/openid-configuration`,
    }).vAuth.clientId).toBe("vinventory-test");
  });

  it.each([
    "http://127.0.0.1:5173/api/auth/oauth2/callback/voss",
    "http://localhost:5174/api/auth/oauth2/callback/voss",
    "http://localhost:5173/api/auth/oauth2/callback/voss/",
    "http://localhost:5173/api/auth/oauth2/callback/voss?extra=1",
    "http://localhost:5173/api/auth/oauth2/callback/voss#extra",
    "http://localhost:3000/auth/callback",
  ])("rejects a callback that differs from the product origin and registered path: %s", (uri) => {
    expect(() => loadConfig({ ...validEnvironment, VAUTH_REDIRECT_URI: uri })).toThrow(/VAUTH_REDIRECT_URI/);
  });

  it("rejects discovery URLs passed as issuers and malformed discovery endpoints", () => {
    expect(() => loadConfig({ ...validEnvironment,
      VAUTH_ISSUER: "https://accounts.vosslabs.org/api/auth/.well-known/openid-configuration",
      VOSS_DISCOVERY_URL: "https://accounts.vosslabs.org/api/auth/.well-known/openid-configuration",
    })).toThrow(/Conflicting/);
    expect(() => loadConfig({ ...validEnvironment, VOSS_DISCOVERY_URL: "https://accounts.vosslabs.org/api/auth" })).toThrow(/VOSS_DISCOVERY_URL/);
  });

  it("requires HTTPS product URLs in production", () => {
    expect(() => loadConfig({ ...validEnvironment, NODE_ENV: "production",
      VAUTH_ISSUER: "https://accounts.vosslabs.org/api/auth",
    })).toThrow(/WEB_ORIGIN must use HTTPS/);
    expect(loadConfig({ ...validEnvironment, NODE_ENV: "production",
      VAUTH_ISSUER: "https://accounts.vosslabs.org/api/auth",
      WEB_ORIGIN: "https://vinventory.vosslabs.org",
      VAUTH_REDIRECT_URI: "https://vinventory.vosslabs.org/api/auth/oauth2/callback/voss",
    }).vAuth.allowInsecureRequests).toBe(false);
  });
});

describe("development authentication flag", () => {
  const { VAUTH_CLIENT_ID, VAUTH_CLIENT_SECRET, ...withoutCredentials } = validEnvironment;
  const development = { ...withoutCredentials, NODE_ENV: "development" };

  it.each(["1", "yes"])("refuses to start in production with VINVENTORY_DEV_AUTH=%j", (flag) => {
    expect(() => loadConfig({ ...validEnvironment, NODE_ENV: "production", VINVENTORY_DEV_AUTH: flag }))
      .toThrow("VINVENTORY_DEV_AUTH must not be set in production. It bypasses sign-in.");
  });

  it("loads without client credentials when dev auth is on", () => {
    const config = loadConfig({ ...development, VINVENTORY_DEV_AUTH: "1" });
    expect(config.devAuth).toBe(true);
    expect(config.vAuth.credentialsConfigured).toBe(false);
  });

  it("still requires client credentials when dev auth is off", () => {
    expect(() => loadConfig(development)).toThrow("VOSS_CLIENT_ID is required (VAUTH_CLIENT_ID is also supported)");
  });

  it("reports credentials as configured when dev auth is on and they are present", () => {
    const config = loadConfig({ ...validEnvironment, NODE_ENV: "development", VINVENTORY_DEV_AUTH: "1" });
    expect(config.devAuth).toBe(true);
    expect(config.vAuth.credentialsConfigured).toBe(true);
  });
});
