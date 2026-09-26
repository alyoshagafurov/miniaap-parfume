import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The action between the form and admins.ts.
 *
 * It used to answer every schema failure with «Проверьте заполнение формы»,
 * and two of the rules lived in the schema — so a nine-character password or
 * an empty Telegram ID produced that sentence and no reason. What is asserted
 * is that the reason now reaches the result, under the field it belongs to,
 * whichever layer refused.
 */

const create = vi.fn<(args: unknown) => Promise<{ id: string }>>();

vi.mock("@/server/auth/roles", () => ({
  requirePermission: () => Promise.resolve({ adminId: "me", role: "OWNER" }),
}));
vi.mock("@/server/auth/password", () => ({
  hashPassword: () => Promise.resolve("hash"),
}));
vi.mock("@/server/db", () => ({
  prisma: {
    adminUser: {
      findFirst: () => Promise.resolve(null),
      create: (args: unknown) => create(args),
      update: () => Promise.resolve({}),
    },
  },
}));

const { saveAdmin } = await import("./actions");

const VALID = {
  login: "manager",
  name: "Менеджер",
  telegramId: "123456789",
  role: "EDITOR",
  password: "длинный-пароль",
};

beforeEach(() => {
  create.mockReset().mockResolvedValue({ id: "new" });
});

describe("saveAdmin", () => {
  it("says why a short password was refused, under the password", async () => {
    const result = await saveAdmin({
      id: null,
      fields: { ...VALID, password: "123456789" },
    });
    expect(result).toEqual({
      ok: false,
      message: "Пароль не короче 10 символов",
      fields: { password: "Пароль не короче 10 символов" },
    });
  });

  it("says where a Telegram ID comes from when it is missing", async () => {
    const result = await saveAdmin({ id: null, fields: { ...VALID, telegramId: "" } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fields?.telegramId).toContain("/id");
  });

  it("names the field a length cap stopped, in Russian", async () => {
    const result = await saveAdmin({
      id: null,
      fields: { ...VALID, name: "я".repeat(121) },
    });
    expect(result).toEqual({
      ok: false,
      message: "Не длиннее 120 символов",
      fields: { name: "Не длиннее 120 символов" },
    });
  });

  it("never falls back to the old sentence", async () => {
    const results = await Promise.all([
      saveAdmin({ id: null, fields: { ...VALID, telegramId: "@manager" } }),
      saveAdmin({ id: null, fields: { ...VALID, login: "x" } }),
      saveAdmin({ id: null, fields: { ...VALID, role: "ROOT" } }),
    ]);
    for (const result of results) {
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.message).not.toBe("Проверьте заполнение формы");
      expect(Object.keys(result.fields ?? {})).toHaveLength(1);
    }
  });

  it("saves a valid form", async () => {
    expect(await saveAdmin({ id: null, fields: VALID })).toEqual({ ok: true });
    expect(create).toHaveBeenCalledOnce();
  });
});
