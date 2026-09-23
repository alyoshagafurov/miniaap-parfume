import { describe, expect, it } from "vitest";

import { parsePhotoFilename } from "./images";

describe("parsePhotoFilename", () => {
  it("reads the article and the position", () => {
    expect(parsePhotoFilename("ARM-1005-2.jpg")).toEqual({
      candidates: ["ARM-1005-2", "ARM-1005"],
      order: 2,
    });
  });

  it("offers the whole stem first, because an article may end in a number", () => {
    // ARM-1005 is itself an article. Splitting the trailing number off blindly
    // would look for ARM and find nothing.
    const parsed = parsePhotoFilename("ARM-1005.jpg");
    expect(parsed.candidates[0]).toBe("ARM-1005");
    expect(parsed.order).toBe(1);
  });

  it("accepts an underscore or a space before the position", () => {
    expect(parsePhotoFilename("ARM-1005_3.jpeg").order).toBe(3);
    expect(parsePhotoFilename("ARM-1005 4.png").candidates).toContain("ARM-1005");
  });

  it("treats a file with no position as the first photograph", () => {
    expect(parsePhotoFilename("coco.webp")).toEqual({ candidates: ["coco"], order: 1 });
  });

  it("survives a name with several dots", () => {
    expect(parsePhotoFilename("ARM-1005-1.final.jpg").candidates).toContain(
      "ARM-1005-1.final",
    );
  });
});
