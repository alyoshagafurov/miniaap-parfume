import { describe, expect, it } from "vitest";

import { CatalogConflict, Tags } from "./run";

describe("Tags", () => {
  it("collects without repeating", () => {
    const tags = new Tags()
      .add("catalog", "product:a")
      .add("catalog")
      .addAll(["product:b", "product:a"]);
    expect(tags.list).toEqual(["catalog", "product:a", "product:b"]);
  });

  it("keeps the order things were first added in", () => {
    // Not required for correctness, but a stable order makes a failing
    // assertion elsewhere readable instead of flaky.
    expect(new Tags().add("b", "a", "b").list).toEqual(["b", "a"]);
  });

  it("starts empty", () => {
    expect(new Tags().list).toEqual([]);
  });
});

describe("CatalogConflict", () => {
  it("is distinguishable from any other error", () => {
    const error: unknown = new CatalogConflict("Артикул занят");
    expect(error).toBeInstanceOf(CatalogConflict);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe("CatalogConflict");
    expect((error as Error).message).toBe("Артикул занят");
  });
});
