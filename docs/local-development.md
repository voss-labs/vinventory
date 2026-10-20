# Run locally with Docker (no credentials)

You can run the whole product on your machine without VAuth or a hosted
database. A Postgres container holds the data, and the app signs you in as one
of several seeded **test users** so you can see what each role can and cannot do.

## Prerequisites

- Docker Desktop (or OrbStack on Mac)
- Node.js 22.12 or newer
- pnpm 11 (`corepack enable`)

## Quick start

```bash
pnpm install
pnpm dev:setup
pnpm dev
```

Then open `http://localhost:5173` exactly and choose someone from
**Development sign-in** in the header.

Development sign-in only works at `http://localhost:5173` exactly. In a
browser-based Codespace, open it in VS Code Desktop so the port forwards to
localhost.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev:setup` | Everything from nothing: creates `.env`, starts Postgres, migrates, seeds. Safe to re-run. |
| `pnpm dev:seed` | Rewrites the mock data (wipes and recreates the development dataset). |
| `pnpm dev:down` | Stops the database container and keeps its data. |
| `pnpm dev:reset` | Destroys the container and its data, then recreates everything. |

`dev:seed` and `dev:reset` wipe all sessions, so sign in again afterwards.

If `dev:setup` fails because a `vinventory-postgres` container already exists
(for example after a shutdown), run `pnpm dev:reset`.

The database container has a fixed name and port (`vinventory-postgres`,
`127.0.0.1:5433`), so only one checkout can run it at a time. To switch to
another checkout, run `pnpm dev:down` in the first one.

If `pnpm dev` reports that port 5173 or 3000 is in use, stop the earlier
development server first. Vite refuses to move to another port because the
browser address has to stay `http://localhost:5173`.

## What `dev:setup` does

1. **Environment.** Creates `.env` from `.env.development.example` with a random
   `COOKIE_SECRET`. An existing `.env` is left alone.
2. **Checks the database is local.** Refuses to continue if `DATABASE_URL` in
   `.env` or your shell points anywhere but the local Docker database.
3. **Starts Postgres.** Runs `docker compose up -d` (see `docker-compose.yml`)
   and waits until the database accepts connections. It listens on
   `127.0.0.1:5433`.
4. **Applies migrations.** Runs `pnpm --filter @vinventory/db db:migrate`.
5. **Seeds the development data.** Runs `pnpm --filter @vinventory/db db:seed`.

## Test users

Every test user is fictional, with email `<key>@dev.vinventory.invalid`. That
domain is reserved and can never belong to a real person. The key is what the
Development sign-in control sends to `POST /auth/dev/login` as `{ persona }`.

| Key | Name | Role | What it shows |
|---|---|---|---|
| `admin` | Asha Deshpande | System admin | Global access to every lab |
| `incharge-vlsi` | Ravi Kulkarni | Lab incharge | Full control of DEV-VLSI; **denied in DEV-EMB** |
| `incharge-emb` | Sunita Rane | Lab incharge | Full control of DEV-EMB; **denied in DEV-VLSI** |
| `staff-restricted` | Mandar Patil | Lab staff | Can issue and receive in DEV-VLSI; **cannot import stock** |
| `student` | Neha Bhosale | Student | Browses labs; manages nothing |
| `unassigned` | Rohit Gaikwad | Student (today's default) | What a brand-new sign-in gets: the limited state |
| `deactivated` | Omkar Sawant | Lab staff, inactive | Not listed in Development sign-in; sign-in is refused and an existing session is rejected |

The seeded labs:

| Lab | Active | Contents |
|---|---|---|
| `DEV-VLSI`, VLSI Design Lab | yes | Two loan policies; breadboards, jumper kits, FPGA boards and an oscilloscope |
| `DEV-EMB`, Embedded Systems Lab | yes | One loan policy; microcontroller boards, sensors and a logic analyser |
| `DEV-OLD`, Decommissioned Lab | no | Nothing; it never appears in the lab directory |

## The permissions are real

Development sign-in replaces only the sign-in step. It creates the same
database session and signed cookie that VAuth would, and then every request is
checked exactly as in production: roles, lab memberships and permissions are
read from the database rows. Choosing a test user grants nothing by itself.
`apps/api/src/auth/dev-rbac.test.ts` checks every test user against every
lab and permission, using the production repositories and the real seed.

## If `dev:setup` refuses to run

`dev:setup`, `dev:seed` and `dev:reset` write to a database, so they first check
that the database is local. Your `.env` may still hold a hosted database (for
example the Neon `DATABASE_URL` from real VAuth testing), or your shell may have
`DATABASE_URL` set. The message names the host it found. Fix it with one of:

- Move the old file aside and re-run: `mv .env .env.neon`
  (PowerShell: `Rename-Item .env .env.neon`), then `pnpm dev:setup`.
- Unset the shell variable: `unset DATABASE_URL`
  (PowerShell: `Remove-Item Env:DATABASE_URL`).

## Environment variables

| Variable | Purpose |
|---|---|
| `VINVENTORY_DEV_AUTH` | `1` turns on Development sign-in. Development only; never set it in production (see [authentication](./authentication.md)). |
| `DATABASE_URL` | Locally `postgresql://vinventory:vinventory@127.0.0.1:5433/vinventory_dev`, set by `.env.development.example`. |
| `VOSS_CLIENT_ID`, `VOSS_CLIENT_SECRET` | Optional while `VINVENTORY_DEV_AUTH=1`. Needed only for real VAuth sign-in. |

## Using real VAuth instead

To sign in through VAuth, remove or empty `VINVENTORY_DEV_AUTH` in `.env`, set
the VOSS credentials and the Neon `DATABASE_URL`, and restart `pnpm dev`. The
Development sign-in control then disappears. The notes below are for the
project owner's setup.

### Running and checking the real VAuth flow (moved from the README)

The current local `.env` already contains the registered VAuth settings and
the Neon `neondb` connection. Its initial migration has been applied. Keep this
file; you do not need to recreate the database or copy the template again.

Open PowerShell in the **inner repository folder** that contains `package.json`:

```powershell
cd "D:\Web development\LabInventoryTracker\LabInventoryTracker"
pnpm dev
```

Keep that terminal running. This starts the Vite frontend on
`http://localhost:5173`, the API on `http://127.0.0.1:3000`, and the worker
watcher (currently idle). Stop them with **Ctrl+C**. After editing `.env`, stop
and restart `pnpm dev` to load the new settings.

To check the app manually:

1. Open [VInventory](http://localhost:5173). This is the public landing page,
   introducing the product and its audiences.
2. Select **Sign in with VAuth** and complete the code sent to your college
   mailbox. Internet access is required for hosted VAuth and Neon; neither
   service needs to run on your machine.
3. Sign-in returns to [the labs directory](http://localhost:5173/labs). It
   lists active labs from the database and supports search by name, code or
   location. If you already have a session, use **Go to labs** on the landing
   page; your name/initials and a **Sign out** button appear in the header.
4. To check your identity, open
   [the current user endpoint](http://localhost:5173/api/me) in the same browser.
   A successful login returns your local user as JSON. Before login it returns
   `401` with `authentication_required`.
5. Use **Sign out** in the header to revoke the local session and return to the
   landing page. Sign in again and check that the local user ID stays the same.

The current owner account retains the existing `student` default and has no
lab membership. If no labs have been configured, the directory explicitly says
**No labs have been added yet**. This is a setup state, not a failed login.
Unassigned onboarding, first-admin setup and M201 provisioning remain pending.
Stock imports are now under `/labs/:labId/import`, available from a lab's
overview only to authorized staff. Browsing the directory does not grant stock
permissions. No sample labs or synthetic inventory are added to the real database.

The interface uses the supplied VERP design system's semantic blue/neutral
colors, small corner radii and self-hosted Geist/Geist Mono fonts, with light
and dark themes. Tracked styles live in `apps/web/src/theme.css` and `styles.css`.

Use `localhost:5173` exactly in the browser, including for `/api/me`. Vite
proxies `/api` and `/auth` to the API; opening the API's `127.0.0.1` address
directly does not share the browser's localhost session cookie. If port 5173
or 3000 is already in use, stop the earlier development server before retrying;
keep the registered browser port unchanged. If the API or VAuth cannot be reached,
the page shows a connection error and retry action instead of a silent sign-in.

The owner's registered VAuth credentials and a generated product cookie secret
are already in the ignored repository root `.env`. The selected separate Neon
`neondb` database is configured and migrated. Owner login, `/api/me` and repeat
sign-in passed on 17 October 2026. Keep these values
server-side and preserve this file when following the new-contributor README.

## After logging in to Neon

1. Create a separate project named `vinventory-dev` for this application.
   Use the default PostgreSQL version and a region near your development
   location. This project is for development data only.
2. Open the project's **Connect** dialog. Select its default branch, database
   and database role. The default database name, such as `neondb`, is fine.
3. Select a direct PostgreSQL connection (turn connection pooling off) and copy
   the connection string. Preserve its SSL/channel-binding query parameters.
   VInventory uses `pg` and its own VAuth adapter; Neon Auth is not required.
4. Set `DATABASE_URL` in `LabInventoryTracker/.env` to the complete connection
   string and save. Keep the existing VOSS, callback, origin and cookie values.
   Do not paste the connection string into chat or commit the file.
5. From the inner repository root, run:

   ```powershell
   pnpm --filter @vinventory/db db:migrate
   pnpm dev
   ```

6. Open `http://localhost:5173`, select **Sign in with VAuth**, and use your own
   verified mailbox. After returning, visit `http://localhost:5173/api/me` to
   inspect the authenticated local user. Repeat sign-in should preserve the
   same local user ID. The header shows your signed-in account and a **Sign out**
   button. Live sign-out and the landing-to-labs flow are verified; full
   role-boundary acceptance remains pending.

First-admin setup and unassigned-user onboarding are the next implementation
steps. A successful login does not yet give the owner `system_admin`.

Neon reference: [Connect to Neon](https://neon.com/docs/get-started/connect-neon).
