import { describe, expect, it } from "vitest";
import { resolveRenderOptions } from "../src/config";

const resolve = (extra: Record<string, unknown> = {}) =>
  resolveRenderOptions({ sections: [], ...extra } as never);

describe("resolveRenderOptions", () => {
  it("returns all defaults for null and undefined config", () => {
    const defaults = {
      tvBadge: 4,
      nameFormat: "name",
      highlightWinner: true,
      liveFirst: false,
      colors: {},
    };
    expect(resolveRenderOptions(null)).toEqual(defaults);
    expect(resolveRenderOptions(undefined)).toEqual(defaults);
  });

  describe("tvBadge", () => {
    it("defaults to 4 when unset", () => expect(resolve().tvBadge).toBe(4));
    it("keeps 0 (hide badge)", () => expect(resolve({ tv_badge: 0 }).tvBadge).toBe(0));
    it("keeps a custom count", () => expect(resolve({ tv_badge: 6 }).tvBadge).toBe(6));
    it("falls back when negative", () => expect(resolve({ tv_badge: -1 }).tvBadge).toBe(4));
    it("falls back when not a number", () => expect(resolve({ tv_badge: "6" }).tvBadge).toBe(4));
  });

  describe("nameFormat", () => {
    it("defaults to name", () => expect(resolve().nameFormat).toBe("name"));
    it("passes long_name", () =>
      expect(resolve({ name_format: "long_name" }).nameFormat).toBe("long_name"));
    it("passes abbr", () => expect(resolve({ name_format: "abbr" }).nameFormat).toBe("abbr"));
    it("falls back to name for invalid", () =>
      expect(resolve({ name_format: "bogus" }).nameFormat).toBe("name"));
  });

  describe("highlightWinner", () => {
    it("defaults to true", () => expect(resolve().highlightWinner).toBe(true));
    it("keeps false", () =>
      expect(resolve({ highlight_winner: false }).highlightWinner).toBe(false));
    it("keeps true", () => expect(resolve({ highlight_winner: true }).highlightWinner).toBe(true));
  });

  describe("liveFirst", () => {
    it("is false when unset", () => expect(resolve().liveFirst).toBe(false));
    it("is true only for literal true", () => {
      expect(resolve({ live_first: true }).liveFirst).toBe(true);
      expect(resolve({ live_first: "true" }).liveFirst).toBe(false);
      expect(resolve({ live_first: 1 }).liveFirst).toBe(false);
    });
  });

  describe("colors", () => {
    it("defaults to {}", () => expect(resolve().colors).toEqual({}));
    it("passes config.colors through", () => {
      const colors = { live: "#ff0000" };
      expect(resolve({ colors }).colors).toEqual(colors);
    });
  });
});
