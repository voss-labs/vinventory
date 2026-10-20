// Signing in as a seeded persona without VAuth.
//
// AUTHENTICATION only is bypassed. This creates the same user_sessions row and
// the same signed cookie as the VAuth callback, then gets out of the way:
// authenticate, requireLabPermission, hasLabPermission and listActiveLabs read
// that row exactly as they do in production. Nothing here decides permissions.
//
// It cannot reach production: see dev-auth-gate.ts, config.ts and
// apps/web/src/dev/build-guard.ts. These routes are only registered when the
// gate passed at startup.
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { DEV_PERSONAS, findPersona } from "@vinventory/db/dev";

import { sessionCookieName } from "./constants.js";
import { hashIp, hashToken, randomToken } from "./crypto.js";
import type { AuthRepository, DevAuthRepository } from "./types.js";

type DevAuthOptions = {
  devRepository: DevAuthRepository;
  repository: AuthRepository; // the production repository: createSession, revokeSession
  secureCookies: boolean;
  sessionTtlHours: number;
  webOrigin: string;
};

const loginBodySchema = z.object({ persona: z.string() });

export async function registerDevAuthentication(
  app: FastifyInstance,
  options: DevAuthOptions,
): Promise<void> {
  app.log.warn("DEVELOPMENT AUTHENTICATION IS ENABLED. Sign-in is bypassed for seeded personas.");

  app.get("/auth/dev/personas", async () => ({
    personas: DEV_PERSONAS.filter((persona) => persona.isActive).map(({ key, name, role, scope }) => ({
      key,
      name,
      role,
      scope,
    })),
  }));

  app.post("/auth/dev/login", async (request, reply) => {
    if (request.headers.origin && request.headers.origin !== options.webOrigin) {
      return reply.code(403).send({ error: "request_origin_not_allowed" });
    }

    const body = loginBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    // Only a known persona key is accepted, never an email, id or role from the request.
    const persona = findPersona(body.data.persona);
    if (!persona) {
      return reply.code(400).send({ error: "unknown_persona" });
    }

    // Inactive users (and an unseeded database) end here, like a refused VAuth sign-in.
    const user = await options.devRepository.findDevUser(persona.email);
    if (!user) {
      return reply.code(404).send({ error: "persona_not_available", hint: "This persona is deactivated or not seeded. Run pnpm dev:seed if you expected it to exist." });
    }

    const rawCookie = request.cookies[sessionCookieName];
    const unsigned = rawCookie ? request.unsignCookie(rawCookie) : null;
    if (unsigned?.valid && unsigned.value) {
      await options.repository.revokeSession(hashToken(unsigned.value), new Date());
    }

    const sessionToken = randomToken();
    const expiresAt = new Date(Date.now() + options.sessionTtlHours * 60 * 60 * 1000);

    await options.repository.createSession({
      userId: user.id,
      tokenHash: hashToken(sessionToken),
      expiresAt,
      userAgent: request.headers["user-agent"] ?? null,
      ipHash: hashIp(request.ip),
    });

    reply.setCookie(sessionCookieName, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: options.secureCookies,
      path: "/",
      expires: expiresAt,
      signed: true,
    });

    return { user };
  });
}
