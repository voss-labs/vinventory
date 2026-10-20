# VAuth integration contract

Updated: 17 October 2026.

Status: OIDC/session/permission foundations are implemented. The project owner
has supplied VInventory client registration output and the VAuth `integrating.md`
guide. Callback/configuration alignment is implemented and covered by automated
tests. Hosted discovery, Neon migrations, owner login, `/api/me` and repeat
sign-in were verified on 17 October 2026. Unassigned onboarding, first-admin
setup and full role-boundary verification remain pending. Live local sign-out
and the new landing-to-labs flow are also verified.

This document distinguishes current behavior from the next implementation.
Registration has been exercised against hosted VAuth from this app, including
code exchange and local session persistence. Do not record client secrets here.

## Boundary

VAuth is the identity provider. VInventory owns application sessions,
account types, lab memberships, and every lab-scoped permission. VAuth supplies
no roles, roll numbers, departments or employee IDs. First-party registration
only skips consent; it does not grant VInventory admin access.

VInventory stores the stable OIDC `sub` claim as `users.auth_subject`, together
with the provider key `vauth`. The subject remains the login identity key.
Provider-verified email may match an approved local borrower/staff record; name
and roll number may not. Preserve existing subject bindings and refuse/log any
attempt to reassign a record to a different subject. Retry safe linking on later
sign-ins if records become available. Failed or absent matches must leave the
person unassigned, without breaking their authenticated session.

The current schema still has `student`/`staff`/`system_admin` and defaults new
users to `student`. Add an explicit `unassigned` state, migrate existing records
with review, and update contracts, guards and UI. An unassigned user may access
identity/access-pending information and logout, but no operational inventory,
borrowing, import or administration endpoints. A verified email domain alone
does not assign a role. No product password/sign-up flow is planned.

## Protocol and adapter decision

- OIDC discovery from the explicit discovery URL, independently checked against
  the configured issuer. The hosted issuer documented by
  VAuth is `https://accounts.vosslabs.org/api/auth`.
- Authorization Code flow with mandatory PKCE S256.
- `state` and `nonce` generated for every attempt and validated at callback.
- Requested scopes: `openid profile email`.
- Client authentication: `client_secret_post`.
- ID-token signature and claims validated by `openid-client` against the
  discovered issuer metadata and JWKS.
- Exact registered callback URI from `VAUTH_REDIRECT_URI`.

The supplied guide uses Better Auth `genericOAuth` with provider ID `voss`.
Decision (17 October 2026): retain the existing `openid-client` adapter in
Fastify and implement equivalent protocol/access requirements. Alignment coverage
exercises explicit hosted discovery with an independent issuer check, EdDSA
signature verification through JWKS, issuer/audience/expiry/state/nonce failures,
PKCE S256, verified email, optional-name fallback, the registered callback,
environment aliases and root `.env` loading. Live owner login remains a separate
acceptance check, now passed for the registered localhost client. Better Auth is not currently
installed, and `BETTER_AUTH_URL`/`BETTER_AUTH_SECRET` do not configure this adapter.
Any later switch must explicitly plan session storage, identity preservation,
schema migration, routes and logout; do not combine the two session systems.

The adapter explicitly selects VAuth's EdDSA ID-token algorithm and enables
`openid-client` signature checks against JWKS. Tests reject bad signatures,
issuer/audience/expiry/state/nonce failures and missing/false `email_verified`.
Missing, null, empty and whitespace-only names use the email local part.

The short-lived login transaction is kept in a signed, HTTP-only, SameSite=Lax
cookie. A successful callback upserts the local identity and creates a random
opaque VInventory session. Only the token hash is persisted. Production
cookies are Secure; production VAuth issuers must use HTTPS. The current default
session duration is twelve hours and configurable; the guide's seven-day sliding
session example is not current VInventory behavior. Local logout revokes the
product session, not the hosted VAuth session; subsequent SSO without another
email code is expected.

## Current routes

| Route | Purpose |
|---|---|
| `GET /auth/login?returnTo=/path` | Start OIDC login; the UI requests `/labs`, and only local return paths are accepted |
| `GET /api/auth/oauth2/callback/voss` | Verify the callback, create the local session, redirect to the web app |
| `POST /auth/logout` | Revoke the local session and clear its cookie |
| `GET /api/me` | Demonstrate authenticated local identity |
| `GET /api/labs` | List active labs and the current user's stock-management flag; authenticated directory metadata only |
| `GET /api/labs/:labId/issue-access` | Demonstrate server-side lab permission enforcement |
| `GET /auth/dev/personas` | List the active seeded test users for Development sign-in; development only |
| `POST /auth/dev/login` | Sign in as a seeded test user with `{ persona }`; development only |

## Registered deployment targets

VAuth runs at `accounts.vosslabs.org`. The owner does not run it locally.
The local application can use production VAuth with its registered localhost
callback, as described in section 9 of the supplied guide.

| Purpose | Exact target |
|---|---|
| Issuer | `https://accounts.vosslabs.org/api/auth` |
| Discovery | `https://accounts.vosslabs.org/api/auth/.well-known/openid-configuration` |
| Local product origin | `http://localhost:5173` |
| Registered local callback | `http://localhost:5173/api/auth/oauth2/callback/voss` |
| Production product origin | `https://vinventory.vosslabs.org` |
| Registered production callback | `https://vinventory.vosslabs.org/api/auth/oauth2/callback/voss` |

The user reported successful first-party registration and supplied credentials.
Do not re-register the client by default. The printed localhost discovery URL
is unsuitable here: use hosted discovery, while retaining the localhost callback.
Exact redirect matching includes scheme, hostname, port, path and trailing slash.
The browser must use `localhost`, not an interchangeable-looking `127.0.0.1`.

Development flow: local product → hosted VAuth login/consent as applicable →
registered local callback → server token verification → local session → role-
appropriate destination. Vite already proxies `/api` and `/auth` to the API at
`127.0.0.1:3000`; the registered callback handler is mounted at
`/api/auth/oauth2/callback/voss`. Vite binds to localhost:5173 and refuses an
occupied port instead of silently moving the app to an unregistered origin.
Production needs equivalent same-origin routing. `/auth/callback` is retired.

## Environment configuration

| Guide/registration input | Adapter setting | Behavior |
|---|---|---|
| `VOSS_CLIENT_ID` | `clientId`; legacy `VAUTH_CLIENT_ID` | Accept either; reject conflicting values |
| `VOSS_CLIENT_SECRET` | `clientSecret`; legacy `VAUTH_CLIENT_SECRET` | Server-only; accept either; reject conflicting values |
| `VOSS_DISCOVERY_URL` | `discoveryUrl` plus expected `issuer` | Fetch the explicit URL; derive expected issuer by removing `/.well-known/openid-configuration`; verify returned metadata independently |
| `VAUTH_ISSUER` | Legacy issuer input | Derive discovery by appending the discovery suffix; if both settings exist, require agreement; default to hosted VAuth if neither exists |
| Product origin | `WEB_ORIGIN` | Local: `http://localhost:5173`; production: registered product origin |
| Product callback | `VAUTH_REDIRECT_URI` | Match the exact registered callback and implement that route |
| Product session signing secret | `COOKIE_SECRET` | Separate from the VAuth client secret; remain server-side |
| Product persistence | `DATABASE_URL` | VInventory development/production databases, not VAuth's database |

`VAUTH_REDIRECT_URI` must exactly equal `WEB_ORIGIN` plus the registered callback
path: no query, fragment, trailing slash, different hostname or different port.
Production requires HTTPS for the provider and product; HTTP is allowed only for
loopback hosts outside production. Local browser URLs must match registration.

`scripts/load-env.mjs` loads the repository root `.env` for `pnpm dev`,
`pnpm --filter @vinventory/api start` and the Drizzle commands, regardless of
package cwd. Existing host variables win. Setting `NODE_ENV=production` in the
host skips local files. Ship this loader alongside the deployed monorepo API.
Tests inject their settings explicitly and never preload real client credentials.
Never put secrets into `VITE_*`, tracked files or browser code.

For this owner's local setup, registered VAuth credentials and a generated
product cookie secret are stored only in the ignored root `.env`. The separate
Neon development database `neondb` is configured, and the initial migration
created all 23 application tables. Live login persists the identity/session and
repeat sign-in returns the same local user ID. Do not overwrite
this file with a template. For a new contributor, copy `.env.development.example`
and supply their own authorized settings.

## First system administrator and local testing

`system_admin` already passes the backend's existing lab-permission checks;
there is no first-admin setup command or admin dashboard yet. The owner is the
intended initial administrator, and Ajit Ghadge remains M201's lab incharge.

Implement a trusted, operator-run setup command for one explicitly selected,
already authenticated owner identity. Show its stable subject/local ID and
verified email, require an explicit target, audit the role grant, and make
repeated runs safe without silently appointing another account. Do not grant
admin to the first visitor or via a public self-promotion route. Role assignment
must survive later sign-ins. Provision M201 and its accepted policies through
repeatable administration tools; no full dashboard is needed to begin testing.

For independent testing, add development-only seeded identities for admin,
incharge, restricted staff, student and unassigned users. A planned identity
switcher must require `VINVENTORY_DEV_AUTH=1`, refuse production at runtime, and
fail the production build if enabled. It substitutes identity only; roles and
lab permissions still come from the application database. Never use another
person's account or shared client credentials. Keep synthetic records in an
isolated development/test database. Mock identity tests do not prove hosted login.

## Development authentication

For local work without VAuth credentials, `VINVENTORY_DEV_AUTH=1` lets a
contributor sign in as a seeded test user from **Development sign-in** in the
header. See [local development](./local-development.md) for the test users. It
replaces only the sign-in step: it creates the same hashed `user_sessions` row
and signed cookie as the VAuth callback, and roles, memberships and permissions
are still read from the database.

Four locks keep it out of production:

1. **Runtime gate.** It is enabled only when `NODE_ENV` is not `production` and
   `VINVENTORY_DEV_AUTH` is exactly `1`.
2. **Config refusal.** The API refuses to start with `NODE_ENV=production` and any
   non-empty `VINVENTORY_DEV_AUTH`.
3. **Build lock and bundle exclusion.** `vite build` fails if `VINVENTORY_DEV_AUTH`
   or `VITE_DEV_AUTH` is set in the build environment, and the control is behind
   `import.meta.env.DEV`, so none of its code is in the production bundle. The
   lock reads the build process's environment, not `.env`, because every local
   `.env` enables dev sign-in and `pnpm verify` must still build.
4. **Routes not registered.** `/auth/dev/personas` and `/auth/dev/login` exist
   only when the gate passed at startup; otherwise they return 404.

The `unassigned` test user uses today's `student` default until the `unassigned`
account type exists.

## Acceptance checklist

- [x] Registration details and integration guide received from the owner.
- [x] Adapter/configuration decision recorded; examples and startup load the intended settings.
- [x] Hosted discovery fetched; exact callback, protocol checks and environment loading covered by automated tests.
- [x] Hosted discovery and the registered client work; local callback matches exactly.
- [x] Real owner sign-in validates tokens and reaches `/api/me` with a usable display name.
- [ ] Unmatched users reach access-pending with no operational role; guards use allowlists.
- [ ] Verified-email binding refuses cross-identity rebinds and never trusts typed roll numbers.
- [ ] One-time setup grants only the intended owner `system_admin`, with repeat-safe audit behavior.
- [ ] M201 and accepted policies can be provisioned for owner-led import testing.
- [x] Repeat sign-in preserves the same local user; no elevated role or lab membership was granted.
- [x] Local sign-out revokes the session and returns to the public landing page; repeat hosted SSO reaches `/labs`.
- [ ] Complete inactive-user and all role-boundary acceptance checks before the pilot.
- [ ] Incharge/staff access is limited to granted labs; system-admin global access is deliberate.
- [x] Development switcher and synthetic fixtures cannot be enabled in production.
- [ ] Production callback, HTTPS cookies and deployed environment are checked before release.

Evidence: use automated boundary/permission tests plus a real browser hosted-login
demonstration. Do not use VAuth's production database or its maintainer-only OTP
verification script to test this product; the owner signs in through their own
mailbox. Roll-number storage and borrower binding remain VInventory tasks.

## Local verification evidence — 17 October 2026

- Applied the initial migration to the owner's configured Neon `neondb`;
  verified 23 public application tables and one migration journal record.
- Browser flow from `http://localhost:5173/auth/login` reached hosted VAuth
  with PKCE S256 and the exact registered localhost callback.
- Owner completed their own mailbox sign-in; callback returned to VInventory,
  and `/api/me` resolved the database-backed user with a non-empty display name.
- A second hosted sign-in returned the same local user ID. The account is still
  `student` under the existing schema default, with no stock-management labs.
  This is evidence of the known onboarding gap, not completed role provisioning.
- Fixed Windows package filtering in `pnpm dev` and switched API development
  startup to Node watch with the tsx import hook. Confirmed both frontend and API
  start from the root command; no populated `.env` was committed.

Landing/workspace follow-up: the homepage now explains VInventory, the header
distinguishes signed-in users, and every sign-in CTA requests `returnTo=/labs`.
Provider discovery failures return to a readable landing-page error; session and
directory requests have timeouts and retry states. Sign-out and subsequent hosted
SSO were exercised in the browser and returned to the new labs workspace. No
active labs are currently configured; the directory reports that explicitly.
Browsing lab metadata does not grant any inventory operation. Production routing
must serve the frontend for `/labs` and `/labs/*`, and proxy `/api/*` and `/auth/*`.
