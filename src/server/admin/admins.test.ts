import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What the owner reads when adding a manager goes wrong.
 *
 * The rules themselves are old; what is tested is that each refusal names its
 * field and says something the owner can act on. The Telegram ID message is
 * the one that mattered: it sent people to /admin, which tells a stranger
 * «only for administrators» and nothing else.
 *
 * The session, the database and the hash are stand-ins. Nothing here is about
 * Prisma; it is about which sentence reaches the screen.
 */

const db = {
  findFirst: vi.fn<(args: unknown) => Promise<{ login: string } | null>>(),
  create: vi.fn<(args: unknown) => Promise<{ id: string }>>(),
  update: vi.fn<(args: unknown) => Promise<unknown>>(),
};

vi.mock("@/server/auth/roles", () => ({
  requirePermission: () => Promise.resolve({ adminId: "me", role: "OWNER" }),
}));
vi.mock("@/server/auth/password", () => ({
  hashPassword: (password: string) => Promise.resolve(`hash:${password.length}`),
}));
vi.mock("@/server/db", () => ({
  prisma: {
    adminUser: {
      findFirst: (args: unknown) => db.findFirst(args),
      create: (args: unknown) => db.create(args),
      update: (args: unknown) => db.update(args),
    },
  },
}));

const { AdminConflict, createAdmin, updateAdmin } = await import("./admins");

const VALID = {
  login: "Manager",
  name: "Менеджер",
  telegramId: "123456789",
  role: "EDITOR" as const,
  password: "длинный-пароль",
};

async function refusal(work: Promise<unknown>) {
  const error: unknown = await work.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AdminConflict);
  return error as InstanceType<typeof AdminConflict>;
}

beforeEach(() => {
  db.findFirst.mockReset().mockResolvedValue(null);
  db.create.mockReset().mockResolvedValue({ id: "new" });
  db.update.mockReset().mockResolvedValue({});
});

describe("Telegram ID", () => {
  it("points to /id, not to /admin", async () => {
    const error = await refusal(createAdmin({ ...VALID, telegramId: "@manager" }));
    expect(error.fields.telegramId).toContain("/id");
    expect(error.fields.telegramId).not.toContain("/admin");
  });

  it("asks for it when it is empty rather than calling it malformed", async () => {
    const error = await refusal(createAdmin({ ...VALID, telegramId: "  " }));
    expect(error.fields.telegramId).toMatch(/^Укажите Telegram ID/);
  });
});

describe("the refusals", () => {
  it("names every wrong field at once, the first in form order as the message", async () => {
    const error = await refusal(
      createAdmin({
        login: "я",
        name: " ",
        telegramId: "12",
        role: "EDITOR",
        password: "short",
      }),
    );
    expect(Object.keys(error.fields).sort()).toEqual(
      ["login", "name", "password", "telegramId"].sort(),
    );
    expect(error.fields.password).toBe("Пароль не короче 10 символов");
    expect(error.message).toBe(error.fields.name);
    expect(db.create).not.toHaveBeenCalled();
  });

  it("puts a taken login under the login", async () => {
    db.findFirst.mockResolvedValue({ login: "manager" });
    const error = await refusal(createAdmin(VALID));
    expect(error.fields).toEqual({ login: "Такой логин уже занят" });
  });

  it("puts a taken Telegram ID under the Telegram ID", async () => {
    db.findFirst.mockResolvedValue({ login: "someone-else" });
    const error = await refusal(createAdmin(VALID));
    expect(error.fields).toEqual({ telegramId: "Этот Telegram ID уже в списке" });
  });

  it("puts a self-demotion under the role", async () => {
    const error = await refusal(updateAdmin("me", { ...VALID, password: "" }));
    expect(error.fields.role).toBe("Нельзя снять с себя роль владельца");
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe("a valid form", () => {
  it("is saved normalised: login lower-cased, name trimmed, id as a BigInt", async () => {
    await createAdmin({ ...VALID, name: "  Менеджер  " });
    expect(db.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          login: "manager",
          name: "Менеджер",
          telegramId: 123456789n,
        }) as unknown,
      }),
    );
  });

  it("leaves the password alone on an edit when the field is empty", async () => {
    await updateAdmin("someone", { ...VALID, password: "" });
    const [args] = db.update.mock.calls[0] ?? [];
    expect(args).toBeDefined();
    expect((args as { data: Record<string, unknown> }).data).not.toHaveProperty(
      "passwordHash",
    );
  });
});
