import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

import { assertNoDevAuthInBuild } from "./src/dev/build-guard.ts";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig(({ command, mode }) => {
  assertNoDevAuthInBuild(command, process.env);
  // Only the dev server (mode "development") ever sees the flag. Vitest runs in
  // mode "test", so existing tests never render the switcher by accident.
  const devAuthClient = command === "serve" && mode === "development"
    && loadEnv(mode, repoRoot, "").VINVENTORY_DEV_AUTH === "1";
  return {
    plugins: [react()],
    define: { "import.meta.env.VITE_DEV_AUTH": JSON.stringify(devAuthClient ? "1" : "") },
    server: {
      host: "localhost",
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": "http://127.0.0.1:3000",
        "/auth": "http://127.0.0.1:3000",
      },
    },
  };
});
