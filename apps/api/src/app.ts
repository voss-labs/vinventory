import Fastify from "fastify";

import { healthResponseSchema, labsResponseSchema } from "@vinventory/contracts";

import { registerDevAuthentication } from "./auth/dev-auth.js";
import { registerAuthentication } from "./auth/plugin.js";
import type { AuthRepository, DevAuthRepository, OidcClient } from "./auth/types.js";
import { registerInventoryImports } from "./inventory/routes.js";
import type { InventoryRepository } from "./inventory/repository.js";
import type { LabsRepository } from "./labs/repository.js";

type BuildAppOptions = {
  logger?: boolean;
  inventory?: InventoryRepository;
  labs?: LabsRepository;
  auth?: {
    repository: AuthRepository;
    oidcClient: OidcClient;
    cookieSecret: string;
    secureCookies: boolean;
    sessionTtlHours: number;
    webOrigin: string;
    callbackUrl: string;
  };
  devAuth?: { devRepository: DevAuthRepository };
};

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: options.logger ?? true });

  app.get("/health", async () => healthResponseSchema.parse({ status: "ok" }));

  if (options.auth) {
    await registerAuthentication(app, options.auth);
    if (options.devAuth) {
      // Fourth lock: refuse to build an app with dev login in production, whatever the caller passed.
      if (process.env.NODE_ENV === "production") {
        throw new Error("Development authentication must not be registered in production.");
      }
      await registerDevAuthentication(app, { ...options.auth, devRepository: options.devAuth.devRepository });
    }
    if (options.inventory) await registerInventoryImports(app, options.inventory, options.auth.webOrigin);
    if (options.labs) {
      app.get("/api/labs", { preHandler: [app.authenticate] }, async (request) =>
        labsResponseSchema.parse({ labs: await options.labs!.listActiveLabs(request.currentUser!) }));
    }

    app.get(
      "/api/me",
      { preHandler: [app.authenticate] },
      async (request) => ({ user: request.currentUser }),
    );

    app.get<{ Params: { labId: string } }>(
      "/api/labs/:labId/issue-access",
      {
        preHandler: [app.authenticate, app.requireLabPermission("issue")],
      },
      async () => ({ allowed: true }),
    );
  }

  return app;
}
