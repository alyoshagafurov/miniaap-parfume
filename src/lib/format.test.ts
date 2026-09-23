import { describe, expect, it } from "vitest";

import { formatDateRu, formatDateTimeRu } from "./format";

describe("formatDateRu", () => {
  it("renders a Russian date", () => {
    expect(formatDateRu(new Date("2026-09-23T10:32:00Z"))).toBe("23 сентября 2026");
  });

  it("renders Moscow time, not the reader's", () => {
    // 22:30 UTC is already the next day in Moscow, and that is the day the
    // warehouse means.
    expect(formatDateRu(new Date("2026-09-23T22:30:00Z"))).toBe("24 сентября 2026");
    expect(formatDateTimeRu(new Date("2026-09-23T22:30:00Z"))).toBe(
      "24 сентября 2026, 01:30",
    );
  });

  it("pads the clock", () => {
    expect(formatDateTimeRu(new Date("2026-01-05T02:04:00Z"))).toBe("5 января 2026, 05:04");
  });

  it("covers every month", () => {
    const names = Array.from({ length: 12 }, (_, m) =>
      formatDateRu(new Date(Date.UTC(2026, m, 15, 12))).split(" ")[1],
    );
    expect(names).toEqual([
      "января", "февраля", "марта", "апреля", "мая", "июня",
      "июля", "августа", "сентября", "октября", "ноября", "декабря",
    ]);
  });
});
