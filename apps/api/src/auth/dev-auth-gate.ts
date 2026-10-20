// The one place that decides whether development authentication can exist.
// Imports nothing. Takes the environment as a parameter so tests don't mutate
// globals, and is a function (not a constant) so it reflects the real process.
export function devAuthEnabled(
  env: { NODE_ENV?: string | undefined; VINVENTORY_DEV_AUTH?: string | undefined } = process.env,
): boolean {
  return env.NODE_ENV !== "production" && env.VINVENTORY_DEV_AUTH === "1";
}
