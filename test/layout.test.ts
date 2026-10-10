import { describe, expect, it } from "vitest";
import { buildHaCardStyle, cardRows } from "../src/layout.js";
import type { SectionConfig } from "../src/types.js";

describe("buildHaCardStyle", () => {
  it("omits min-height in carousel mode when there are no sections", () => {
    const style = buildHaCardStyle({}, [], true);
    expect(style).not.toContain("min-height");
  });

  it("sets min-height from the widest section's row count in carousel mode", () => {
    const sections = [{ limit: 2 }, { limit: 5 }] as SectionConfig[];
    const style = buildHaCardStyle({}, sections, true);
    expect(style).toContain("min-height:");
  });
});

describe("cardRows", () => {
  it("coerces a quoted limit", () => {
    expect(cardRows([{ limit: "5" as unknown as number }], false)).toBe(6);
  });

  const sections = [{ limit: 3 }, { limit: 5 }, {}] as SectionConfig[];

  it("sums header + limit rows per section in stack mode", () => {
    expect(cardRows(sections, false)).toBe(21);
  });

  it("takes the tallest section in carousel mode", () => {
    expect(cardRows(sections, true)).toBe(11);
  });

  it("returns 0 for no sections in both modes", () => {
    expect(cardRows([], false)).toBe(0);
    expect(cardRows([], true)).toBe(0);
  });
});
