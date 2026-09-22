import { describe, it, expect } from "vitest";
const kopecks = (rub: number) => Math.round(rub * 100);
describe("money", () => {
  it("rounds to kopecks", () => {
    expect(kopecks(19.99)).toBe(1999);
    expect(kopecks(0.1 + 0.2)).toBe(30);
  });
});
