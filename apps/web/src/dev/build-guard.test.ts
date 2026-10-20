import { describe, expect, it } from "vitest";

import { assertNoDevAuthInBuild } from "./build-guard";

describe("assertNoDevAuthInBuild", () => {
  it("refuses a build with VINVENTORY_DEV_AUTH set", () => {
    expect(() => assertNoDevAuthInBuild("build", { VINVENTORY_DEV_AUTH: "1" }))
      .toThrow("VINVENTORY_DEV_AUTH is set for a production build");
  });

  it("refuses a build with VITE_DEV_AUTH set", () => {
    expect(() => assertNoDevAuthInBuild("build", { VITE_DEV_AUTH: "1" }))
      .toThrow("VINVENTORY_DEV_AUTH is set for a production build");
  });

  it("allows a build without either flag", () => {
    expect(() => assertNoDevAuthInBuild("build", {})).not.toThrow();
  });

  it("allows the dev server with the flag set", () => {
    expect(() => assertNoDevAuthInBuild("serve", { VINVENTORY_DEV_AUTH: "1" })).not.toThrow();
  });
});
