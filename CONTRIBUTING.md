# Contributing to VInventory

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

Open `http://localhost:5173` and choose someone from **Development sign-in** in
the header. No VAuth credentials are needed. See
[`docs/local-development.md`](./docs/local-development.md) for the commands,
the test users and troubleshooting.

## Before every commit

Run `pnpm verify`. It type-checks, runs every test and builds everything.

## Branches and commits

- Name branches `feat/<topic>` or `fix/<topic>`.
- Write [Conventional Commit](https://www.conventionalcommits.org/) messages,
  for example `feat(api): add lab policy endpoint` or `fix(web): keep search on retry`.
- Never commit `.env` or any file holding real credentials.
