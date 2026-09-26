import type { Settings } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  TELEGRAM_MESSAGE_LIMIT,
  chatTelegramId,
  contacts,
  orderForManager,
  yourTelegramId,
} from "./ru";

const SETTINGS: Settings = {
  id: 1,
  companyName: "ÁRUMI Parfum & Care",
  address: "Хасавюрт, рынок «Восток», павильон 12",
  phone: "+7 928 314-40-00",
  whatsappPhone: "79283144000",
  minOrderKop: 500_000,
  showPrices: true,
  deliveryTerms: "",
  botGreeting: "",
  bannerKey: null,
  bannerFileId: null,
  updatedAt: new Date(0),
};

describe("contacts", () => {
  it("keeps one line when the phone and WhatsApp are the same number", () => {
    const text = contacts(SETTINGS);
    expect(text).toContain("Телефон и WhatsApp: +7 928 314-40-00");
    expect(text.match(/WhatsApp/g)).toHaveLength(1);
  });

  it("shows WhatsApp on its own line, as the button dials it, when it differs", () => {
    const text = contacts({ ...SETTINGS, whatsappPhone: "+7 (928) 000-11-22" });
    expect(text).toContain("Телефон: +7 928 314-40-00");
    expect(text).toContain("WhatsApp: +79280001122");
    expect(text).not.toContain("Телефон и WhatsApp");
  });

  it("does not claim WhatsApp when none is set", () => {
    const text = contacts({ ...SETTINGS, whatsappPhone: "" });
    expect(text).toContain("Телефон: +7 928 314-40-00");
    expect(text).not.toContain("WhatsApp");
  });

  it("shows WhatsApp alone when there is no phone", () => {
    const text = contacts({ ...SETTINGS, phone: "" });
    expect(text).not.toContain("Телефон");
    expect(text).toContain("WhatsApp: +79283144000");
  });
});

describe("/id texts", () => {
  it("tells a person their own id", () => {
    expect(yourTelegramId("123456789")).toContain("Ваш Telegram ID: 123456789");
  });

  it("tells a group its id, minus sign included, and what it is for", () => {
    const text = chatTelegramId("-1001234567890", "group");
    expect(text).toContain("ID этой группы: -1001234567890");
    expect(text).toContain("ADMIN_CHAT_ID");
  });
});

describe("orderForManager", () => {
  const BASE = {
    number: "ARM-000042",
    name: "Алишер",
    phone: "+79283144000",
    city: "Хасавюрт",
    delivery: "СДЭК",
    comment: "Позвоните после обеда",
    totalKop: 1_240_000,
    showPrices: true,
    username: "alisher",
  };

  const line = (i: number) => ({
    title: `Chanel Coco Mademoiselle Eau de Parfum Intense ${i}`,
    sku: `ARM-${1000 + i}`,
    qty: 12,
    lineTotalKop: 1_240_000,
  });

  it("lists every line of an ordinary request", () => {
    const text = orderForManager({ ...BASE, lines: [line(1), line(2), line(3)] });
    expect(text).toContain("ARM-1001");
    expect(text).toContain("ARM-1003");
    expect(text).not.toContain("и ещё");
  });

  it("fits a 200-line request into one Telegram message, contacts intact", () => {
    // Unbounded, this is ~16 000 characters, and Telegram refuses the whole
    // message — the manager would hear nothing about the largest request.
    const lines = Array.from({ length: 200 }, (_, i) => line(i + 1));
    const text = orderForManager({ ...BASE, lines });

    expect(text.length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_LIMIT);
    expect(text).toMatch(/…и ещё \d+ позици(я|и|й) — полностью в админке/);
    expect(text).toContain("ARM-1001");
    expect(text).toContain("Итого:");
    expect(text).toContain("Имя: Алишер");
    expect(text).toContain("Телефон: +79283144000");
    expect(text).toContain("Комментарий: Позвоните после обеда");
  });

  it("counts what it left out", () => {
    const lines = Array.from({ length: 200 }, (_, i) => line(i + 1));
    const text = orderForManager({ ...BASE, lines });
    const shown = text.split("\n").filter((l) => l.startsWith("• ")).length;
    const rest = Number(/и ещё (\d+)/.exec(text)?.[1]);
    expect(shown + rest).toBe(200);
  });
});
