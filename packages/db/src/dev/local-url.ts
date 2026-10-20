// Destructive dev commands (migrate, seed, reset) only ever run against a
// database on this machine. A developer's .env may point at a real hosted
// database (the owner's points at Neon), so this check runs first.
export const LOCAL_DEV_DATABASE_URL =
  "postgresql://vinventory:vinventory@127.0.0.1:5433/vinventory_dev";

const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function isLocalDatabaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ["postgres:", "postgresql:"].includes(url.protocol)
      && loopbackHosts.has(url.hostname);
  } catch {
    return false;
  }
}
