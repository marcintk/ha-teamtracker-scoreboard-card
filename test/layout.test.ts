import { describe, expect, it } from "vitest";
import { buildHaCardStyle } from "../src/layout.js";
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
