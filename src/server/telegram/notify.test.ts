import { Api } from "grammy";
import { describe, expect, it, vi } from "vitest";

import { notifyNewOrder, sendLoginCode, type NotifyDeps } from "./notify";

/**
 * grammY's documented mocking hook: a transformer that answers without calling
 * `prev` performs no network I/O at all. These tests therefore exercise the
 * real Api object and the real payload it would have sent.
 */
function recordingApi() {
  const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];
  const api = new Api("1:test", { apiRoot: "https://relay.example.net" });
  api.config.use((_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    return Promise.resolve({ ok: true, result: { message_id: 1 } } as never);
  });
  return { api, calls };
}

const ORDER = {
  number: "ARM-000042",
  name: "Алишер",
  phone: "+79283144000",
  city: "Хасавюрт",
  delivery: "CDEK" as const,
  comment: null,
  totalKop: 1_240_000,
  username: null as string | null,
  telegramId: null as bigint | null,
  lines: [
    {
      title: "Chanel Coco Mademoiselle",
      sku: "ARM-1001",
      qty: 10,
      lineTotalKop: 1_240_000,
    },
  ],
};

const SETTINGS = { showPrices: true };

function deps(over: Partial<NotifyDeps> = {}): NotifyDeps {
  return {
    adminChatId: "-1001234567890",
    adminOrderUrl: (id) => `https://arumi.example.ru/admin/orders/${id}`,
    markBlocked: vi.fn(async () => {}),
    ...over,
  };
}

describe("notifyNewOrder", () => {
  it("sends the manager the contents, the total and the contacts", async () => {
    const { api, calls } = recordingApi();
    await notifyNewOrder(api, deps(), { orderId: "o1", ...ORDER }, SETTINGS);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("sendMessage");
    const text = String(calls[0]?.payload.text);
    expect(calls[0]?.payload.chat_id).toBe("-1001234567890");
    expect(text).toContain("ARM-000042");
    expect(text).toContain("Chanel Coco Mademoiselle");
    expect(text).toContain("Алишер");
    expect(text).toContain("+79283144000");
    // Non-breaking space: formatRub groups with U+00A0 so a price never wraps
    // between its digits and the ₽.
    expect(text).toContain("12\u00a0400");
  });

  it("offers a button straight to the request in the admin panel", async () => {
    const { api, calls } = recordingApi();
    await notifyNewOrder(api, deps(), { orderId: "o1", ...ORDER }, SETTINGS);
    const markup = calls[0]?.payload.reply_markup as {
      inline_keyboard: Array<Array<{ url?: string }>>;
    };
    expect(markup.inline_keyboard[0]?.[0]?.url).toBe(
      "https://arumi.example.ru/admin/orders/o1",
    );
  });

  it("omits sums when the client has hidden prices", async () => {
    const { api, calls } = recordingApi();
    await notifyNewOrder(
      api,
      deps(),
      { orderId: "o1", ...ORDER },
      { showPrices: false },
    );
    expect(String(calls[0]?.payload.text)).not.toContain("12\u00a0400");
  });

  it("does nothing, quietly, when no admin chat is configured", async () => {
    // A missing ADMIN_CHAT_ID must not fail the buyer's submission — their
    // request is already recorded.
    const { api, calls } = recordingApi();
    const r = await notifyNewOrder(
      api,
      deps({ adminChatId: null }),
      { orderId: "o1", ...ORDER },
      SETTINGS,
    );
    expect(calls).toHaveLength(0);
    expect(r.managerNotified).toBe(false);
  });

  it("also confirms to the buyer when Telegram vouched for them", async () => {
    const { api, calls } = recordingApi();
    await notifyNewOrder(
      api,
      deps(),
      { orderId: "o1", ...ORDER, telegramId: 501n },
      SETTINGS,
    );
    expect(calls).toHaveLength(2);
    const buyer = calls.find((c) => c.payload.chat_id === "501");
    expect(String(buyer?.payload.text)).toContain("ARM-000042");
  });

  it("sends no confirmation to a web buyer, who has no Telegram to send it to", async () => {
    const { api, calls } = recordingApi();
    await notifyNewOrder(
      api,
      deps(),
      { orderId: "o1", ...ORDER, telegramId: null },
      SETTINGS,
    );
    expect(calls).toHaveLength(1);
  });

  it("marks a buyer who blocked the bot, and still reports the manager was told", async () => {
    const markBlocked = vi.fn(async () => {});
    const api = new Api("1:test", { apiRoot: "https://relay.example.net" });
    let call = 0;
    api.config.use((_prev, _method, payload) => {
      call++;
      // Second call is the buyer confirmation; Telegram answers 403.
      if (call === 2) {
        return Promise.reject(
          Object.assign(new Error("Forbidden: bot was blocked by the user"), {
            error_code: 403,
            description: "Forbidden: bot was blocked by the user",
          }),
        );
      }
      return Promise.resolve({ ok: true, result: { message_id: 1, payload } } as never);
    });

    const r = await notifyNewOrder(
      api,
      deps({ markBlocked }),
      { orderId: "o1", ...ORDER, telegramId: 501n },
      SETTINGS,
    );
    expect(markBlocked).toHaveBeenCalledWith(501n);
    // The manager still got it — that is the part the business depends on.
    expect(r.managerNotified).toBe(true);
    expect(r.buyerNotified).toBe(false);
  });

  it("never lets a Telegram failure lose the request", async () => {
    const api = new Api("1:test", { apiRoot: "https://relay.example.net" });
    api.config.use(() => Promise.reject(new Error("relay unreachable")));
    const r = await notifyNewOrder(api, deps(), { orderId: "o1", ...ORDER }, SETTINGS);
    expect(r.managerNotified).toBe(false);
    expect(r.error).toBeTruthy();
  });
});

describe("sendLoginCode", () => {
  it("sends the code to the administrator", async () => {
    const { api, calls } = recordingApi();
    const ok = await sendLoginCode(api, 777n, "012345", 5);
    expect(ok).toBe(true);
    expect(calls[0]?.payload.chat_id).toBe("777");
    expect(String(calls[0]?.payload.text)).toContain("012345");
  });

  it("reports failure rather than throwing, so login can say why", async () => {
    const api = new Api("1:test", { apiRoot: "https://relay.example.net" });
    api.config.use(() => Promise.reject(new Error("blocked")));
    expect(await sendLoginCode(api, 777n, "012345", 5)).toBe(false);
  });
});
