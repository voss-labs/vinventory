import { describe, expect, it } from "vitest";

import { isLocalDatabaseUrl, LOCAL_DEV_DATABASE_URL } from "./local-url.js";

describe("isLocalDatabaseUrl", () => {
  it.each([
    LOCAL_DEV_DATABASE_URL,
    "postgresql://vinventory:vinventory@localhost:5433/vinventory_dev",
    "postgres://postgres:postgres@127.0.0.1:5432/vinventory_dev",
    "postgresql://postgres:postgres@[::1]:5432/vinventory_dev",
  ])("accepts the loopback URL %s", (value) => {
    expect(isLocalDatabaseUrl(value)).toBe(true);
  });

  it.each([
    "postgresql://u:p@ep-x.ap-southeast-1.aws.neon.tech/neondb?sslmode=require",
    "postgresql://admin:secret@vinventory.abc123xyz.ap-south-1.rds.amazonaws.com:5432/vinventory",
    "",
    "not a database url",
    "mysql://root:root@localhost:3306/vinventory_dev",
  ])("rejects the non-local URL %j", (value) => {
    expect(isLocalDatabaseUrl(value)).toBe(false);
  });
});
