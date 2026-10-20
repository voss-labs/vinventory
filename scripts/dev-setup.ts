// Local development commands: `pnpm dev:setup`, `dev:seed`, `dev:down`, `dev:reset`.
// No interactive prompts, because CI runs these too. Every command that can
// write to a database checks the target is local first, before Docker or a
// migration runs: a developer's .env may point at a real hosted database.
import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { isLocalDatabaseUrl, LOCAL_DEV_DATABASE_URL } from "../packages/db/src/dev/local-url.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const envFile = fileURLToPath(new URL("../.env", import.meta.url));
const envExample = fileURLToPath(new URL("../.env.development.example", import.meta.url));
const cookieSecretPlaceholder = "replace-with-at-least-32-random-characters";
const totalSteps = 5;

const spawnOptions: SpawnSyncOptions = { cwd: root, stdio: "inherit", shell: process.platform === "win32" };
// Child commands always get the Docker URL, so a remote URL in .env is never used
// (scripts/load-env.mjs lets an existing process variable win over .env).
const localEnv = { ...process.env, DATABASE_URL: LOCAL_DEV_DATABASE_URL };

function step(number: number, message: string): void {
  console.log(`\n[${number}/${totalSteps}] ${message}`);
}

function fail(...lines: string[]): never {
  for (const line of lines) console.error(line);
  process.exit(1);
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv = process.env): void {
  const result = spawnSync(command, args, { ...spawnOptions, env });
  if (result.status !== 0) fail(`\nCommand failed: ${command} ${args.join(" ")}`);
}

// Names the host without echoing credentials from the URL.
function describeHost(value: string): string {
  try {
    return new URL(value).host || "no host";
  } catch {
    return "not a valid URL";
  }
}

// Reads simple KEY=value lines; enough to find DATABASE_URL without loading the file.
function readEnvValue(path: string, key: string): string | undefined {
  if (!existsSync(path)) return undefined;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (match?.[1] !== key) continue;
    return (match[2] ?? "").trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  return undefined;
}

function ensureEnvFile(): void {
  step(1, "Environment");
  if (existsSync(envFile)) {
    console.log(".env already exists; leaving it alone.");
    return;
  }
  copyFileSync(envExample, envFile);
  const secret = randomBytes(36).toString("base64url");
  writeFileSync(envFile, readFileSync(envFile, "utf8").replace(cookieSecretPlaceholder, secret));
  console.log("Created .env from .env.development.example with a random COOKIE_SECRET.");
}

function assertLocalTarget(): void {
  step(2, "Checking the database is local");
  const fromFile = readEnvValue(envFile, "DATABASE_URL");
  if (fromFile && !isLocalDatabaseUrl(fromFile)) {
    fail(
      `Refusing: DATABASE_URL in .env is not a local database (host ${describeHost(fromFile)}).`,
      "Move it aside: `mv .env .env.neon` (PowerShell: `Rename-Item .env .env.neon`), then re-run `pnpm dev:setup`.",
    );
  }
  const fromShell = process.env.DATABASE_URL;
  if (fromShell && !isLocalDatabaseUrl(fromShell)) {
    fail(
      `Refusing: DATABASE_URL in your shell is not a local database (host ${describeHost(fromShell)}).`,
      "Unset it: `unset DATABASE_URL` (PowerShell: `Remove-Item Env:DATABASE_URL`).",
    );
  }
  console.log(`Using the local database at ${describeHost(LOCAL_DEV_DATABASE_URL)}.`);
}

let composePrefix: [string, ...string[]] | undefined;

// `docker compose` (v2) or the older standalone `docker-compose`, detected once.
function compose(args: string[]): [string, string[]] {
  if (!composePrefix) {
    const quiet: SpawnSyncOptions = { ...spawnOptions, stdio: "ignore" };
    if (spawnSync("docker", ["compose", "version"], quiet).status === 0) composePrefix = ["docker", "compose"];
    else if (spawnSync("docker-compose", ["version"], quiet).status === 0) composePrefix = ["docker-compose"];
    else fail("Docker Compose is not available. Start Docker Desktop (or OrbStack) and re-run.");
  }
  const [command, ...prefix] = composePrefix;
  return [command, [...prefix, ...args]];
}

async function startContainer(): Promise<void> {
  step(3, "Starting the Postgres container");
  run(...compose(["up", "-d"]));
  const [command, args] = compose(["exec", "-T", "postgres", "pg_isready", "-U", "vinventory", "-d", "vinventory_dev"]);
  const deadline = Date.now() + 60_000;
  while (spawnSync(command, args, { ...spawnOptions, stdio: "ignore" }).status !== 0) {
    if (Date.now() > deadline) fail("Postgres did not become ready within 60 seconds. Check `docker compose logs postgres`.");
    await sleep(1000);
  }
  console.log("Postgres is ready.");
}

function migrate(): void {
  step(4, "Applying migrations");
  run("pnpm", ["--filter", "@vinventory/db", "db:migrate"], localEnv);
}

function seed(): void {
  step(5, "Seeding development data");
  run("pnpm", ["--filter", "@vinventory/db", "db:seed"], localEnv);
}

function down(removeVolume: boolean): void {
  run(...compose(removeVolume ? ["down", "-v"] : ["down"]));
}

async function setup(): Promise<void> {
  ensureEnvFile();
  assertLocalTarget();
  await startContainer();
  migrate();
  seed();
  console.log("\nDone. Run `pnpm dev`, open http://localhost:5173 and choose someone from Development sign-in in the header.");
}

const subcommand = process.argv[2];
switch (subcommand) {
  case "setup":
    await setup();
    break;
  case "seed":
    assertLocalTarget();
    seed();
    break;
  case "down":
    down(false);
    break;
  case "reset":
    assertLocalTarget();
    console.log("\nRemoving the container and its data volume");
    down(true);
    await setup();
    break;
  default:
    fail(`Unknown command: ${subcommand ?? "(none)"}. Use setup, seed, down or reset.`);
}
