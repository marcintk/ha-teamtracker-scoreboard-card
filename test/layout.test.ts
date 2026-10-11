import { describe, expect, it } from "vitest";
import {
  asPx,
  buildHaCardStyle,
  cardRows,
  resolveVisibleSections,
  rowGeometryPx,
} from "../src/layout.js";
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

describe("buildHaCardStyle vars and height", () => {
  it("emits css vars, height clamp, and skips font_scale 1", () => {
    const style = buildHaCardStyle(
      { team_width: "5px", height: "100px", font_scale: 1 },
      [],
      false
    );
    expect(style).toContain("height:100px;min-height:100px;max-height:100px;overflow:hidden;");
    expect(style).toContain("5px;");
    expect(style).not.toContain("font");
  });

  it("emits font_scale when not 1 and computes slide min-height", () => {
    const style = buildHaCardStyle(
      { font_scale: 1.5, row_height: "10px", row_padding: "2px" },
      [{ limit: 1 }] as SectionConfig[],
      true
    );
    expect(style).toContain("min-height:28px;");
    expect(style).toContain("1.5;");
  });
});

describe("asPx / rowGeometryPx", () => {
  it("parses px and rejects others", () => {
    expect(asPx("34px")).toBe(34);
    expect(asPx("2rem")).toBeNull();
    expect(asPx(undefined)).toBeNull();
  });

  it("uses px values or defaults", () => {
    expect(rowGeometryPx("10px", "2px")).toBe(14);
    expect(rowGeometryPx(undefined, undefined)).toBeGreaterThan(0);
  });
});

describe("resolveVisibleSections", () => {
  const secs = [{ limit: 1 }, { limit: 2 }, { limit: 3 }] as SectionConfig[];

  it("returns all sections with indexes in stack mode", () => {
    expect(resolveVisibleSections(secs, false, 5)).toEqual([
      [0, secs[0]],
      [1, secs[1]],
      [2, secs[2]],
    ]);
  });

  it("wraps slide index in carousel mode, including negatives", () => {
    expect(resolveVisibleSections(secs, true, 4)).toEqual([[1, secs[1]]]);
    expect(resolveVisibleSections(secs, true, -1)).toEqual([[2, secs[2]]]);
  });
});
