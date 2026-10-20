import cookie from "@fastify/cookie";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { hashIp, hashToken, randomToken } from "./crypto.js";
import { oauthCallbackPath, sessionCookieName as sessionCookie } from "./constants.js";
import type {
  AuthRepository,
  CurrentUser,
  LabPermission,
  OidcClient,
  OidcTransaction,
  VerifiedIdentity,
} from "./types.js";

declare module "fastify" {
  interface FastifyRequest {
    currentUser: CurrentUser | null;
  }
}

const loginCookie = "vinventory_oidc";
const loginMaxAgeSeconds = 10 * 60;

type AuthPluginOptions = {
  repository: AuthRepository;
  oidcClient: OidcClient;
  cookieSecret: string;
  secureCookies: boolean;
  sessionTtlHours: number;
  webOrigin: string;
  callbackUrl: string;
};

function safeReturnPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return "/";
  }

  try {
    const trustedOrigin = new URL("https://vinventory.invalid");
    const candidate = new URL(value, trustedOrigin);

    return candidate.origin === trustedOrigin.origin
      ? `${candidate.pathname}${candidate.search}${candidate.hash}`
      : "/";
  } catch {
    return "/";
  }
}

function encodeTransaction(transaction: OidcTransaction): string {
  return Buffer.from(JSON.stringify(transaction), "utf8").toString("base64url");
}

function decodeTransaction(value: string): OidcTransaction {
  const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as OidcTransaction;

  if (
    typeof parsed.codeVerifier !== "string" ||
    typeof parsed.state !== "string" ||
    typeof parsed.nonce !== "string" ||
    typeof parsed.returnTo !== "string" ||
    typeof parsed.createdAt !== "number"
  ) {
    throw new Error("Malformed OIDC transaction");
  }

  if (Date.now() - parsed.createdAt > loginMaxAgeSeconds * 1000) {
    throw new Error("Expired OIDC transaction");
  }

  return { ...parsed, returnTo: safeReturnPath(parsed.returnTo) };
}

export async function registerAuthentication(
  app: FastifyInstance,
  options: AuthPluginOptions,
): Promise<void> {
  await app.register(cookie, {
    secret: options.cookieSecret,
    hook: "onRequest",
  });
  app.decorateRequest("currentUser", null);

  const baseCookie = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: options.secureCookies,
    path: "/",
  };

  app.get<{ Querystring: { returnTo?: string } }>("/auth/login", async (request, reply) => {
    const returnTo = safeReturnPath(request.query.returnTo);
    let authorization: Awaited<ReturnType<OidcClient["createAuthorizationRequest"]>>;
    try {
      authorization = await options.oidcClient.createAuthorizationRequest(returnTo);
    } catch {
      return reply.redirect(new URL("/?authError=provider_unavailable", options.webOrigin).href);
    }

    reply.setCookie(loginCookie, encodeTransaction(authorization.transaction), {
      ...baseCookie,
      signed: true,
      maxAge: loginMaxAgeSeconds,
    });

    return reply.redirect(authorization.authorizationUrl);
  });

  app.get(oauthCallbackPath, async (request, reply) => {
    const rawCookie = request.cookies[loginCookie];
    const unsigned = rawCookie ? request.unsignCookie(rawCookie) : null;

    if (!unsigned?.valid || !unsigned.value) {
      return reply.code(400).send({ error: "invalid_login_state" });
    }

    let transaction: OidcTransaction;
    try {
      transaction = decodeTransaction(unsigned.value);
    } catch {
      return reply.code(400).send({ error: "invalid_login_state" });
    }

    const callbackUrl = new URL(options.callbackUrl);
    callbackUrl.search = new URL(request.url, "http://localhost").search;
    reply.clearCookie(loginCookie, baseCookie);
    let identity: VerifiedIdentity;
    try {
      identity = await options.oidcClient.exchangeCallback(callbackUrl, transaction);
    } catch {
      return reply.code(400).send({ error: "invalid_auth_callback" });
    }
    const user = await options.repository.upsertIdentity(identity);
    const sessionToken = randomToken();
    const expiresAt = new Date(
      Date.now() + options.sessionTtlHours * 60 * 60 * 1000,
    );

    await options.repository.createSession({
      userId: user.id,
      tokenHash: hashToken(sessionToken),
      expiresAt,
      userAgent: request.headers["user-agent"] ?? null,
      ipHash: hashIp(request.ip),
    });

    reply.setCookie(sessionCookie, sessionToken, {
      ...baseCookie,
      expires: expiresAt,
      signed: true,
    });

    return reply.redirect(new URL(transaction.returnTo, options.webOrigin).href);
  });

  app.post("/auth/logout", async (request, reply) => {
    if (request.headers.origin && request.headers.origin !== options.webOrigin) {
      return reply.code(403).send({ error: "request_origin_not_allowed" });
    }
    const rawCookie = request.cookies[sessionCookie];
    const unsigned = rawCookie ? request.unsignCookie(rawCookie) : null;

    if (unsigned?.valid && unsigned.value) {
      await options.repository.revokeSession(hashToken(unsigned.value), new Date());
    }

    reply.clearCookie(sessionCookie, baseCookie);
    return reply.code(204).send();
  });

  app.decorate(
    "authenticate",
    async function authenticate(request: FastifyRequest, reply: FastifyReply) {
      const rawCookie = request.cookies[sessionCookie];
      const unsigned = rawCookie ? request.unsignCookie(rawCookie) : null;

      if (!unsigned?.valid || !unsigned.value) {
        return reply.code(401).send({ error: "authentication_required" });
      }

      const user = await options.repository.findActiveSession(
        hashToken(unsigned.value),
        new Date(),
      );

      if (!user) {
        reply.clearCookie(sessionCookie, baseCookie);
        return reply.code(401).send({ error: "authentication_required" });
      }

      request.currentUser = user;
    },
  );

  app.decorate(
    "requireLabPermission",
    (permission: LabPermission) =>
      async (
        request: FastifyRequest<{ Params: { labId: string } }>,
        reply: FastifyReply,
      ) => {
        if (!request.currentUser) {
          return reply.code(401).send({ error: "authentication_required" });
        }

        const allowed = await options.repository.hasLabPermission(
          request.currentUser.id,
          request.params.labId,
          permission,
        );

        if (!allowed) {
          return reply.code(403).send({ error: "lab_access_denied" });
        }
      },
  );
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<unknown>;
    requireLabPermission(
      permission: LabPermission,
    ): (
      request: FastifyRequest<{ Params: { labId: string } }>,
      reply: FastifyReply,
    ) => Promise<unknown>;
  }
}
