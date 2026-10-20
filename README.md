# VInventory

Lab inventory and borrowing system, rebuilt from the lending-first plan.

## Workspace

- `apps/web` — React and Vite browser application
- `apps/api` — Fastify HTTP API and domain services
- `apps/worker` — scheduled reminder worker
- `packages/db` — Drizzle schema, database connection, and migrations
- `packages/contracts` — shared Zod request/response contracts
- `docs` — schema, ER diagram, operating notes, and architecture decisions

## Requirements

- Node.js 22.12 or newer
- pnpm 11
- Docker (local development) or PostgreSQL (Neon for shared environments)

## Run locally for testing

No credentials are needed. With Docker, Node.js 22.12+ and pnpm 11 installed:

```bash
pnpm install
pnpm dev:setup
pnpm dev
```

Then open `http://localhost:5173` exactly and choose someone from **Development
sign-in** in the header. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) and
[`docs/local-development.md`](./docs/local-development.md) for the details,
including how to use real VAuth and the Neon database instead.

## Automated checks

Run these from the same inner repository folder, in another terminal if the
development servers are running:

```powershell
pnpm test       # Automated tests
pnpm typecheck  # TypeScript checks
pnpm build      # Production builds
pnpm verify     # All three, in sequence
```

Automated tests use mocks and isolated fixtures; they do not replace the manual
hosted-login check above.

## First-time setup on a new environment

```powershell
pnpm install
Copy-Item .env.development.example .env
```

Only copy the template when `.env` does not already exist. Fill in the
VInventory development `DATABASE_URL`, registered `VOSS_CLIENT_ID` and
`VOSS_CLIENT_SECRET`, and a random `COOKIE_SECRET` of at least 32 characters.
Keep the template's hosted discovery URL, localhost origin and registered
callback. See [Neon development setup](./docs/local-development.md).

Then apply the schema and start the app:

```powershell
pnpm --filter @vinventory/db db:migrate
pnpm dev
```

For an existing environment, run `db:migrate` when new migrations are added.
The API expects VInventory to be registered as an OIDC client in VAuth with
the exact redirect URI configured in `VAUTH_REDIRECT_URI`.

Open `http://localhost:5173` exactly. Vite keeps that port fixed and proxies
`/api` and `/auth` to the internal API. Hosted VAuth returns to the registered
`http://localhost:5173/api/auth/oauth2/callback/voss` handler. Configure
`VOSS_CLIENT_ID`, `VOSS_CLIENT_SECRET` and the hosted `VOSS_DISCOVERY_URL`;
legacy `VAUTH_CLIENT_ID`/`VAUTH_CLIENT_SECRET`/`VAUTH_ISSUER` remain supported,
and conflicting aliases are rejected. See [authentication](./docs/authentication.md).

API development/start and Drizzle commands load this repository's root `.env`
even when pnpm runs from a package folder. Existing process variables take
precedence. With `NODE_ENV=production` already set in the host environment,
local `.env` loading is skipped; deploy `scripts/load-env.mjs` with the API and
set all required values in the host. The frontend does not load this secret file.

Environment-specific templates are provided for development, test, and
production. Never commit populated `.env` files.

## Phase 1 foundation

- PostgreSQL/Neon schema: 23 Drizzle tables with a generated initial migration.
- Identity: VAuth authorization-code flow with PKCE S256, state, and nonce.
- Sessions: opaque, signed browser cookies backed by hashed local sessions.
- Authorization: app-owned account types and lab membership permissions,
  enforced in API pre-handlers.
- Verification: `pnpm verify` runs all type checks, tests, and production builds.

See [`docs/authentication.md`](./docs/authentication.md) for the VAuth contract
and [`docs/phase-1-pilot-checklist.md`](./docs/phase-1-pilot-checklist.md) for
the incharge-owned operational inputs required before the real pilot begins.

## Delivery order

The app includes a CSV/Excel (`.csv` / `.xlsx`) returnable-item import screen
with a downloadable CSV template, row preview, validation, and transactional
imports. Imported stock awaits physical verification. See
[`docs/inventory-import.md`](./docs/inventory-import.md) for setup and format.
Real pilot data collection is deferred; development can continue meanwhile.

1. Align hosted VAuth/local callbacks, implement unassigned onboarding and first-admin setup, and verify owner-led access/testing.
2. Implement returnable-equipment checkout and confirmed returns.
3. Add extensions and reliable reminder processing.
4. Pilot the lending workflow before completing inventory accounting.

Actual item/loan collection, the incharge's account, pilot date and formal
sign-off remain required before the live pilot, even while development proceeds.
