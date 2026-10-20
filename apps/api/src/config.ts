import { z } from "zod";

import { oauthCallbackPath } from "./auth/constants.js";
import { devAuthEnabled } from "./auth/dev-auth-gate.js";

const hostedIssuer = "https://accounts.vosslabs.org/api/auth";
const discoverySuffix = "/.well-known/openid-configuration";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  API_HOST: z.string().min(1).default("127.0.0.1"),
  API_PORT: z.coerce.number().int().positive().max(65_535).default(3000),
  WEB_ORIGIN: z.string().url(),
  COOKIE_SECRET: z.string().min(32),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().max(720).default(12),
  VAUTH_ISSUER: z.string().url().optional(),
  VOSS_DISCOVERY_URL: z.string().url().optional(),
  VOSS_CLIENT_ID: z.string().min(1).optional(),
  VOSS_CLIENT_SECRET: z.string().min(1).optional(),
  VAUTH_CLIENT_ID: z.string().min(1).optional(),
  VAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  VAUTH_REDIRECT_URI: z.string().url(),
  VINVENTORY_DEV_AUTH: z.string().optional(),
});

export type AppConfig = {
  environment: z.infer<typeof environmentSchema>["NODE_ENV"];
  databaseUrl: string;
  apiHost: string;
  apiPort: number;
  webOrigin: string;
  cookieSecret: string;
  sessionTtlHours: number;
  devAuth: boolean;
  vAuth: {
    issuer: string;
    discoveryUrl: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    allowInsecureRequests: boolean;
    credentialsConfigured: boolean;
  };
};

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const parsed = environmentSchema.parse(environment);
  // Second lock on development authentication: any value at all is refused in
  // production, not only the "1" that the gate would accept elsewhere.
  if (parsed.NODE_ENV === "production" && parsed.VINVENTORY_DEV_AUTH) {
    throw new Error("VINVENTORY_DEV_AUTH must not be set in production. It bypasses sign-in.");
  }
  const devAuth = devAuthEnabled(parsed);
  const alias = (preferred: "VOSS_CLIENT_ID" | "VOSS_CLIENT_SECRET", legacy: "VAUTH_CLIENT_ID" | "VAUTH_CLIENT_SECRET") => {
    if (parsed[preferred] && parsed[legacy] && parsed[preferred] !== parsed[legacy]) {
      throw new Error(`Conflicting ${preferred} and ${legacy}`);
    }
    const value = parsed[preferred] ?? parsed[legacy];
    // Dev auth lets a contributor run without VAuth credentials; real sign-in is then unavailable.
    if (!value && devAuth) return "";
    if (!value) throw new Error(`${preferred} is required (${legacy} is also supported)`);
    return value;
  };
  const discoveryUrl = parsed.VOSS_DISCOVERY_URL
    ?? `${parsed.VAUTH_ISSUER ?? hostedIssuer}${discoverySuffix}`;
  const discovery = new URL(discoveryUrl);
  if (!discovery.pathname.endsWith(discoverySuffix) || discovery.search || discovery.hash) {
    throw new Error("VOSS_DISCOVERY_URL must end with /.well-known/openid-configuration without a query or fragment");
  }
  const expectedIssuer = discoveryUrl.slice(0, -discoverySuffix.length);
  if (parsed.VAUTH_ISSUER && parsed.VAUTH_ISSUER !== expectedIssuer) {
    throw new Error("Conflicting VAUTH_ISSUER and VOSS_DISCOVERY_URL");
  }
  const issuer = new URL(expectedIssuer);
  if (issuer.pathname.includes("/.well-known/") || issuer.search || issuer.hash) {
    throw new Error("VAUTH_ISSUER must be the issuer, not a discovery-document URL, query or fragment");
  }
  const webOrigin = new URL(parsed.WEB_ORIGIN);
  const callback = new URL(parsed.VAUTH_REDIRECT_URI);

  if (parsed.NODE_ENV === "production" && issuer.protocol !== "https:") {
    throw new Error("VAUTH_ISSUER must use HTTPS in production");
  }
  for (const [name, url] of [["issuer", issuer], ["WEB_ORIGIN", webOrigin], ["VAUTH_REDIRECT_URI", callback]] as const) {
    const localHttp = parsed.NODE_ENV !== "production" && url.protocol === "http:"
      && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !localHttp) || url.username || url.password) {
      throw new Error(`${name} must use HTTPS (HTTP loopback is allowed outside production) and contain no credentials`);
    }
  }
  if (parsed.WEB_ORIGIN !== webOrigin.origin) {
    throw new Error("WEB_ORIGIN must be an origin without a path, query or fragment");
  }
  if (parsed.VAUTH_REDIRECT_URI !== `${webOrigin.origin}${oauthCallbackPath}`) {
    throw new Error(`VAUTH_REDIRECT_URI must exactly match WEB_ORIGIN + ${oauthCallbackPath}`);
  }
  const clientId = alias("VOSS_CLIENT_ID", "VAUTH_CLIENT_ID");
  const clientSecret = alias("VOSS_CLIENT_SECRET", "VAUTH_CLIENT_SECRET");

  return {
    environment: parsed.NODE_ENV,
    databaseUrl: parsed.DATABASE_URL,
    apiHost: parsed.API_HOST,
    apiPort: parsed.API_PORT,
    webOrigin: parsed.WEB_ORIGIN,
    cookieSecret: parsed.COOKIE_SECRET,
    sessionTtlHours: parsed.SESSION_TTL_HOURS,
    devAuth,
    vAuth: {
      issuer: expectedIssuer,
      discoveryUrl,
      clientId,
      clientSecret,
      redirectUri: parsed.VAUTH_REDIRECT_URI,
      allowInsecureRequests:
        parsed.NODE_ENV !== "production" && issuer.protocol === "http:",
      credentialsConfigured: clientId !== "" && clientSecret !== "",
    },
  };
}
