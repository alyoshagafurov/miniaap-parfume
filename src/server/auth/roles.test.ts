import { describe, expect, it } from "vitest";

import { ALL_PERMISSIONS, can, type Permission } from "./roles";

describe("permission matrix", () => {
  it("OWNER can do everything", () => {
    for (const p of ALL_PERMISSIONS) expect(can("OWNER", p), p).toBe(true);
  });

  it("EDITOR manages the catalog and requests", () => {
    expect(can("EDITOR", "catalog:write")).toBe(true);
    expect(can("EDITOR", "orders:write")).toBe(true);
  });

  it("EDITOR cannot change settings or other administrators", () => {
    // The brief: OWNER is everything, EDITOR is catalog and requests. Settings
    // carries the contacts and the order minimum; admins carries the allow-list.
    expect(can("EDITOR", "settings:write")).toBe(false);
    expect(can("EDITOR", "admins:write")).toBe(false);
  });

  it("refuses an unknown role rather than defaulting to permissive", () => {
    // A role read from a tampered cookie or a future migration must not fall
    // through to "allowed".
    expect(can("SUPERUSER" as never, "catalog:write")).toBe(false);
    expect(can(undefined as never, "catalog:write")).toBe(false);
  });

  it("refuses an unknown permission", () => {
    expect(can("OWNER", "nuclear:launch" as Permission)).toBe(false);
  });
});
