import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db";

import { listOrdersFor, repeatOrderFor } from "./history";

/**
 * «Мои заявки» outside Telegram: the browser's key decides, and nothing else.
 * Against the development database; skipped without one.
 */
const reachable = Boolean(process.env.DATABASE_URL);
const MARK = "zz-history-test";

afterAll(async () => {
  if (reachable)
    await prisma.order.deleteMany({ where: { number: { startsWith: MARK } } });
});

async function order(suffix: string, webBuyerHash: string | null) {
  return prisma.order.create({
    data: {
      number: `${MARK}-${suffix}`,
      source: "WEB",
      name: "Тест",
      phone: "+79280000000",
      city: "Махачкала",
      delivery: "PICKUP",
      totalKop: 100_000,
      webBuyerHash,
    },
    select: { id: true },
  });
}

describe.skipIf(!reachable)("история заявок на сайте", () => {
  it("показывает браузеру его заявки и только их", async () => {
    const mine = await order("a", "hash-mine");
    await order("b", "hash-someone-else");

    const seen = await listOrdersFor({ telegramId: null, webBuyerHash: "hash-mine" });
    expect(seen.map((o) => o.id)).toEqual([mine.id]);
  });

  it("без метки и без Telegram не показывает ничего, а не всё подряд", async () => {
    await order("c", null);
    expect(await listOrdersFor({ telegramId: null, webBuyerHash: null })).toEqual([]);
  });

  it("не даёт повторить чужую заявку, зная её номер", async () => {
    const theirs = await order("d", "hash-someone-else");
    expect(
      await repeatOrderFor(theirs.id, { telegramId: null, webBuyerHash: "hash-mine" }),
    ).toBeNull();
  });
});
