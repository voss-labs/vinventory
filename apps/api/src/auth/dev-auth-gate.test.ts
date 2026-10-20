import { describe, expect, it } from "vitest";

import { devAuthEnabled } from "./dev-auth-gate.js";

describe("devAuthEnabled", () => {
  // The most important case: the flag alone must never enable dev auth in production.
  it("is off in production even with the flag set", () => {
    expect(devAuthEnabled({ NODE_ENV: "production", VINVENTORY_DEV_AUTH: "1" })).toBe(false);
  });

  it.each(["development", "test"])("is off in %s without the flag", (NODE_ENV) => {
    expect(devAuthEnabled({ NODE_ENV })).toBe(false);
  });

  it("is on in development with the flag set to exactly 1", () => {
    expect(devAuthEnabled({ NODE_ENV: "development", VINVENTORY_DEV_AUTH: "1" })).toBe(true);
  });

  it.each(["true", "yes", "0", "on", " 1", "1 "])("is off in development when the flag is %j", (flag) => {
    expect(devAuthEnabled({ NODE_ENV: "development", VINVENTORY_DEV_AUTH: flag })).toBe(false);
  });
});
