import { describe, expect, it, vi } from "vitest";

const store = { value: new Map<string, string>() };

vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve({ get: (k: string) => store.value.get(k.toLowerCase()) ?? null }),
}));

const { clientIp } = await import("./client-ip");

function withHeaders(h: Record<string, string>) {
  store.value = new Map(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));
}

/**
 * The finding this closes: reading the LEFTMOST x-forwarded-for is correct only
 * under a proxy that OVERWRITES the header. nginx's own documented idiom
 * appends, and under that the leftmost value is whatever the client typed — so
 * every IP rate limit in the application silently stops working, with no error
 * and nothing in a log.
 */
describe("clientIp", () => {
  it("prefers X-Real-IP, which a client cannot extend", async () => {
    withHeaders({
      "x-real-ip": "203.0.113.7",
      "x-forwarded-for": "10.0.0.1, 198.51.100.9",
    });
    expect(await clientIp()).toBe("203.0.113.7");
  });

  it("counts x-forwarded-for from the right, not the left", async () => {
    // A forged value at the front, the relay's real observation at the back.
    withHeaders({ "x-forwarded-for": "10.0.0.1, 10.0.0.2, 198.51.100.9" });
    expect(await clientIp()).toBe("198.51.100.9");
  });

  it("ignores a forged single value the way it ignores a forged chain", async () => {
    withHeaders({ "x-forwarded-for": "10.0.0.1" });
    // One hop, one entry: this IS the proxy's observation.
    expect(await clientIp()).toBe("10.0.0.1");
  });

  it("returns null rather than a shared bucket when nothing identifies the caller", async () => {
    // The previous code answered "unknown", which put every unattributable
    // request on one five-per-ten-minutes budget — a missing header would have
    // stopped the shop taking orders at all.
    withHeaders({});
    expect(await clientIp()).toBeNull();
  });

  it("returns null when the chain is shorter than the configured hops", async () => {
    const previous = process.env.TRUSTED_PROXY_HOPS;
    process.env.TRUSTED_PROXY_HOPS = "3";
    withHeaders({ "x-forwarded-for": "10.0.0.1, 10.0.0.2" });
    expect(await clientIp()).toBeNull();
    process.env.TRUSTED_PROXY_HOPS = previous;
  });
});
