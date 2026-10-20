import { buildApp } from "./app.js";
import { DrizzleDevAuthRepository } from "./auth/dev-repository.js";
import { DrizzleAuthRepository } from "./auth/repository.js";
import { VAuthOidcClient } from "./auth/oidc.js";
import { UnavailableOidcClient } from "./auth/unavailable-oidc.js";
import { loadConfig } from "./config.js";
import { createDatabase } from "@vinventory/db";
import { DrizzleInventoryRepository } from "./inventory/repository.js";
import { DrizzleLabsRepository } from "./labs/repository.js";

const config = loadConfig();
const database = createDatabase(config.databaseUrl);
const app = await buildApp({
  inventory: new DrizzleInventoryRepository(database.db),
  labs: new DrizzleLabsRepository(database.db),
  auth: {
    repository: new DrizzleAuthRepository(database.db),
    // Without credentials (dev auth only), real sign-in fails cleanly instead of at startup.
    oidcClient: config.vAuth.credentialsConfigured ? new VAuthOidcClient(config.vAuth) : new UnavailableOidcClient(),
    cookieSecret: config.cookieSecret,
    secureCookies: config.environment === "production",
    sessionTtlHours: config.sessionTtlHours,
    webOrigin: config.webOrigin,
    callbackUrl: config.vAuth.redirectUri,
  },
  ...(config.devAuth ? { devAuth: { devRepository: new DrizzleDevAuthRepository(database.db) } } : {}),
});

app.addHook("onClose", async () => database.close());

try {
  await app.listen({ host: config.apiHost, port: config.apiPort });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
