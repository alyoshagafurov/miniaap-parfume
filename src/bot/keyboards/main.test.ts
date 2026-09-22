import { describe, expect, it } from "vitest";

import { mainKeyboard } from "./main";

const BASE = { miniAppUrl: "https://arumi.example.ru", whatsappPhone: "79283144000" };

function labels(kb: ReturnType<typeof mainKeyboard>): string[] {
  return kb.inline_keyboard.flat().map((b) => b.text);
}

describe("mainKeyboard", () => {
  it("offers the catalog, the terms and a human", () => {
    expect(labels(mainKeyboard(BASE))).toEqual([
      "Открыть каталог",
      "Условия и доставка",
      "Написать в WhatsApp",
    ]);
  });

  it("hides the admin panel from clients", () => {
    expect(labels(mainKeyboard(BASE))).not.toContain("Админ-панель");
  });

  it("shows the admin panel only when an admin url is supplied", () => {
    const kb = mainKeyboard({ ...BASE, adminUrl: "https://arumi.example.ru/admin" });
    expect(labels(kb)).toContain("Админ-панель");
  });

  it("opens the catalog as a Mini App, not a browser tab", () => {
    const first = mainKeyboard(BASE).inline_keyboard.flat()[0];
    expect(first && "web_app" in first).toBe(true);
  });

  it("strips non-digits from the phone when building the wa.me link", () => {
    const kb = mainKeyboard({ ...BASE, whatsappPhone: "+7 (928) 314-40-00" });
    const wa = kb.inline_keyboard.flat().find((b) => b.text === "Написать в WhatsApp");
    expect(wa && "url" in wa ? wa.url : "").toBe("https://wa.me/79283144000");
  });

  it("omits WhatsApp entirely when no number is configured", () => {
    expect(labels(mainKeyboard({ ...BASE, whatsappPhone: "" }))).not.toContain(
      "Написать в WhatsApp",
    );
  });

  it("uses no emoji, per the design direction", () => {
    const all = labels(mainKeyboard({ ...BASE, adminUrl: "https://x/admin" })).join("");
    expect(/\p{Extended_Pictographic}/u.test(all)).toBe(false);
  });
});
