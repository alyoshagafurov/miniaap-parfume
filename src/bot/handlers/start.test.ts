import { describe, expect, it } from "vitest";

import { miniAppUrlFor } from "./start";

const BASE = "https://arumi.example.ru";

describe("miniAppUrlFor — the start payload is attacker-controlled", () => {
  it("opens the catalog when there is no payload", () => {
    expect(miniAppUrlFor(BASE, "")).toBe(BASE);
    expect(miniAppUrlFor(BASE, "   ")).toBe(BASE);
  });

  it("opens a shared product", () => {
    expect(miniAppUrlFor(BASE, "p_chanel-coco-mademoiselle-100ml")).toBe(
      `${BASE}/p/chanel-coco-mademoiselle-100ml`,
    );
  });

  it("opens a shared category", () => {
    expect(miniAppUrlFor(BASE, "c_parfyum-100-ml")).toBe(`${BASE}/c/parfyum-100-ml`);
  });

  it.each([
    ["path traversal", "p_../../admin"],
    ["absolute url", "p_https://evil.example/x"],
    ["protocol-relative", "p_//evil.example"],
    ["query injection", "p_slug?next=https://evil.example"],
    ["fragment", "p_slug#@evil.example"],
    ["backslash", "p_slug\\@evil.example"],
    ["uppercase escape", "p_SLUG"],
    ["unicode", "p_слаг"],
    ["null byte", "p_slug%00"],
    ["unknown prefix", "x_slug"],
    ["bare text", "slug"],
    ["too long", `p_${"a".repeat(200)}`],
  ])("falls back to the catalog for %s rather than following it", (_label, payload) => {
    expect(miniAppUrlFor(BASE, payload)).toBe(BASE);
  });

  it("never emits a url outside the configured origin", () => {
    for (const payload of ["p_a", "c_b", "", "p_../x", "p_//evil.example"]) {
      expect(miniAppUrlFor(BASE, payload).startsWith(BASE)).toBe(true);
    }
  });

  it("tolerates a trailing slash on the configured url", () => {
    expect(miniAppUrlFor(`${BASE}/`, "p_slug")).toBe(`${BASE}/p/slug`);
  });
});
