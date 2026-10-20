// Third lock on development authentication. Reads only the build process's
// environment, not the repository .env: every contributor's .env enables dev
// auth, and `pnpm verify` must still build. Hosts and CI set real environment
// variables, which is where a production build happens.
export function assertNoDevAuthInBuild(
  command: "build" | "serve",
  env: Record<string, string | undefined>,
): void {
  if (command === "build" && (env.VINVENTORY_DEV_AUTH || env.VITE_DEV_AUTH)) {
    throw new Error(
      "VINVENTORY_DEV_AUTH is set for a production build. It bypasses sign-in, so it must never be " +
      "present in anything deployable. To check that your change compiles, build without it.",
    );
  }
}
