import { beforeAll, describe, expect, it } from "vitest";

import { normalizePhone, parseOrderInput } from "./create";

const VALID = {
  name: "Алишер",
  phone: "+7 928 314 40 00",
  city: "Хасавюрт",
  delivery: "CDEK",
  comment: "",
  consent: true,
  items: [{ productId: "p1", qty: 6 }],
};

describe("normalizePhone", () => {
  it.each([
    ["+7 928 314 40 00", "+79283144000"],
    ["8 928 314 40 00", "+79283144000"],
    ["89283144000", "+79283144000"],
    ["79283144000", "+79283144000"],
    ["+7(928)314-40-00", "+79283144000"],
    ["  +7 928 314 40 00  ", "+79283144000"],
  ])("normalises %j to %j", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(["", "123", "+1 555 0100", "не телефон", "+7 928 314 40 0", "+7 928 314 40 000"])(
    "rejects %j",
    (input) => {
      expect(normalizePhone(input)).toBeNull();
    },
  );
});

describe("parseOrderInput", () => {
  it("accepts a filled form", () => {
    const r = parseOrderInput(VALID);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.data.phone).toBe("+79283144000");
    expect(r.data.name).toBe("Алишер");
  });

  it("requires consent to process personal data", () => {
    const r = parseOrderInput({ ...VALID, consent: false });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected failure");
    expect(r.fieldErrors.consent).toBeTruthy();
  });

  it.each([
    ["name", ""],
    ["name", "А"],
    ["city", ""],
    ["phone", "123"],
  ])("rejects a bad %s", (field, value) => {
    const r = parseOrderInput({ ...VALID, [field]: value });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected failure");
    expect(r.fieldErrors[field]).toBeTruthy();
  });

  it("rejects an unknown delivery method", () => {
    expect(parseOrderInput({ ...VALID, delivery: "TELEPORT" }).ok).toBe(false);
  });

  it("rejects an empty basket", () => {
    expect(parseOrderInput({ ...VALID, items: [] }).ok).toBe(false);
  });

  it("ignores any price the client sends", () => {
    // The form has no price field at all. If one arrives it is stripped, so it
    // can never reach the total — the server prices from the catalog.
    const r = parseOrderInput({
      ...VALID,
      items: [{ productId: "p1", qty: 6, priceKop: 1 }],
      totalKop: 1,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(JSON.stringify(r.data)).not.toContain("priceKop");
    expect(JSON.stringify(r.data)).not.toContain("totalKop");
  });

  it.each([0, -1, 1.5, 100000])("rejects quantity %s", (qty) => {
    expect(parseOrderInput({ ...VALID, items: [{ productId: "p1", qty }] }).ok).toBe(false);
  });

  it("caps the comment rather than storing an essay", () => {
    const r = parseOrderInput({ ...VALID, comment: "x".repeat(5000) });
    expect(r.ok).toBe(false);
  });

  it("treats a filled honeypot as a bot, without saying so", () => {
    const r = parseOrderInput({ ...VALID, website: "http://spam.example" });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected failure");
    expect(r.honeypot).toBe(true);
  });

  it("accepts an empty honeypot, which is what a human leaves", () => {
    expect(parseOrderInput({ ...VALID, website: "" }).ok).toBe(true);
  });

  it("refuses a basket with absurdly many lines", () => {
    const items = Array.from({ length: 500 }, (_, i) => ({ productId: `p${i}`, qty: 1 }));
    expect(parseOrderInput({ ...VALID, items }).ok).toBe(false);
  });
});

// ── Persistence ─────────────────────────────────────────────────────────────

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("createOrder", () => {
  let productId = "";
  let packSize = 1;
  let priceKop = 0;

  beforeAll(async () => {
    const { prisma } = await import("@/server/db");
    const p = await prisma.product.findFirst({
      where: { status: "PUBLISHED", stock: "IN_STOCK" },
      select: { id: true, packSize: true, priceKop: true },
      orderBy: { priceKop: "desc" },
    });
    if (!p) throw new Error("seed the database first: pnpm seed");
    productId = p.id;
    packSize = p.packSize;
    priceKop = p.priceKop;
  });

  it("records a request and returns its number", async () => {
    const { createOrder } = await import("./create");
    const { prisma } = await import("@/server/db");

    // Enough to clear the 5 000 ₽ minimum.
    const qty = Math.max(packSize, Math.ceil(500_000 / priceKop / packSize) * packSize);
    const r = await createOrder(
      { ...VALID, items: [{ productId, qty }] },
      { ip: `test-${Math.random()}`, initDataRaw: null, botToken: null },
    );

    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(r.number).toMatch(/^ARM-\d{6}$/);

    const saved = await prisma.order.findUnique({
      where: { id: r.orderId },
      include: { items: true },
    });
    expect(saved?.source).toBe("WEB");
    expect(saved?.phone).toBe("+79283144000");
    expect(saved?.items).toHaveLength(1);
    // Finding 4: the stored total must equal the sum of its own items.
    const sum = saved!.items.reduce((a, i) => a + i.priceKop * i.qty, 0);
    expect(saved?.totalKop).toBe(sum);
    // The snapshot must survive the product being renamed or deleted.
    expect(saved?.items[0]?.sku).toBeTruthy();
    expect(saved?.items[0]?.title).toBeTruthy();
    expect(saved?.items[0]?.brandName).toBeTruthy();
  });

  it("prices from the catalog, not from the request", async () => {
    const { createOrder } = await import("./create");
    const { prisma } = await import("@/server/db");
    const qty = Math.max(packSize, Math.ceil(500_000 / priceKop / packSize) * packSize);

    const r = await createOrder(
      { ...VALID, items: [{ productId, qty, priceKop: 1 }] },
      { ip: `test-${Math.random()}`, initDataRaw: null, botToken: null },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const saved = await prisma.order.findUnique({ where: { id: r.orderId }, include: { items: true } });
    expect(saved?.items[0]?.priceKop).toBe(priceKop);
  });

  it("refuses below the minimum order", async () => {
    const { createOrder } = await import("./create");
    const r = await createOrder(
      { ...VALID, items: [{ productId, qty: packSize }] },
      { ip: `test-${Math.random()}`, initDataRaw: null, botToken: null },
    );
    // One pack of anything is under 5 000 ₽ in this catalog.
    if (priceKop * packSize < 500_000) {
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toBe("BELOW_MINIMUM");
    }
  });

  it("gives consecutive requests different numbers", async () => {
    const { createOrder } = await import("./create");
    const qty = Math.max(packSize, Math.ceil(500_000 / priceKop / packSize) * packSize);
    const mk = () =>
      createOrder(
        { ...VALID, items: [{ productId, qty }] },
        { ip: `test-${Math.random()}`, initDataRaw: null, botToken: null },
      );
    const [a, b] = await Promise.all([mk(), mk()]);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.number).not.toBe(b.number);
  });

  it("refuses a product that does not exist", async () => {
    const { createOrder } = await import("./create");
    const r = await createOrder(
      { ...VALID, items: [{ productId: "no-such-product", qty: 10 }] },
      { ip: `test-${Math.random()}`, initDataRaw: null, botToken: null },
    );
    expect(r.ok).toBe(false);
  });
});
