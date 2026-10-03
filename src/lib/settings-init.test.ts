import { describe, expect, it } from "vitest";

import { emptyFieldsToFill, type FillableSettings } from "./settings-init";

const WANTED: FillableSettings = {
  companyName: "ÁRUMI Parfum & Care",
  address: "Хасавюрт",
  phone: "8 928 314 40 00",
  whatsappPhone: "79283144000",
  deliveryTerms: "Условия",
  botGreeting: "Добро пожаловать",
};

const EMPTY: FillableSettings = {
  companyName: "",
  address: "",
  phone: "",
  whatsappPhone: "",
  deliveryTerms: "",
  botGreeting: "",
};

describe("emptyFieldsToFill", () => {
  it("fills everything on a row that is entirely empty", () => {
    expect(emptyFieldsToFill(EMPTY, WANTED)).toEqual(WANTED);
  });

  it("never touches a field the owner has typed", () => {
    const existing = { ...EMPTY, botGreeting: "Наш текст", phone: "8 800 000 00 00" };
    const fill = emptyFieldsToFill(existing, WANTED);
    expect(fill).not.toHaveProperty("botGreeting");
    expect(fill).not.toHaveProperty("phone");
    expect(fill.address).toBe("Хасавюрт");
  });

  it("treats a field holding only whitespace as empty", () => {
    const fill = emptyFieldsToFill({ ...EMPTY, botGreeting: "  \n " }, WANTED);
    expect(fill.botGreeting).toBe("Добро пожаловать");
  });

  it("writes nothing when everything is already filled", () => {
    expect(emptyFieldsToFill(WANTED, WANTED)).toEqual({});
  });

  it("does not write an empty wanted value over an empty field", () => {
    expect(emptyFieldsToFill(EMPTY, { ...WANTED, address: "" })).not.toHaveProperty(
      "address",
    );
  });
});
