import { describe, expect, it, vi } from "vitest";

/**
 * The home screen's «Доделать».
 *
 * With requests out of the menu, the «Новые заявки» row is the panel's only
 * way to a request whose Telegram notice never arrived. So the two things
 * worth pinning are that it is counted from NEW requests and nothing else, and
 * that it shows — first — exactly when there is one.
 */

const orderCount = vi.fn<(args: unknown) => Promise<number>>();

vi.mock("@/server/auth/roles", () => ({
  requireAdminPage: () => Promise.resolve({ adminId: "me", role: "EDITOR" }),
}));
vi.mock("@/server/db", () => ({
  prisma: {
    product: { count: () => Promise.resolve(0) },
    category: { count: () => Promise.resolve(0) },
    order: { count: (args: unknown) => orderCount(args) },
  },
}));

const { attentionRows, getDashboardCounts } = await import("./dashboard");

const NONE = { published: 0, drafts: 0, withoutPhoto: 0, categories: 0, newOrders: 0 };

describe("getDashboardCounts", () => {
  it("counts new requests, and only new ones", async () => {
    orderCount.mockResolvedValue(3);
    const counts = await getDashboardCounts();
    expect(counts.newOrders).toBe(3);
    expect(orderCount).toHaveBeenCalledWith({ where: { status: "NEW" } });
  });
});

describe("attentionRows", () => {
  it("is empty when nothing is waiting", () => {
    expect(attentionRows(NONE)).toEqual([]);
  });

  it("leads with new requests and links to them filtered", () => {
    const rows = attentionRows({ ...NONE, newOrders: 2, drafts: 5 });
    expect(rows[0]).toEqual({
      href: "/admin/orders?status=NEW",
      label: "Новые заявки",
      count: 2,
    });
    expect(rows.map((row) => row.label)).toEqual(["Новые заявки", "Черновики"]);
  });

  it("drops a row at zero", () => {
    const rows = attentionRows({ ...NONE, withoutPhoto: 1 });
    expect(rows.map((row) => row.label)).toEqual(["Без фото"]);
  });
});
