import { describe, expect, it } from "vitest";
import { firstSegment, safeLogoUrl, VALID_STATES } from "../src/utils.js";

describe("safeLogoUrl", () => {
  it("returns https URLs unchanged", () => {
    expect(safeLogoUrl("https://example.com/logo.png")).toBe("https://example.com/logo.png");
  });

  it("rejects http URLs", () => {
    expect(safeLogoUrl("http://example.com/logo.png")).toBe("");
  });

  it("returns empty string for null, undefined, and empty string", () => {
    expect(safeLogoUrl(null)).toBe("");
    expect(safeLogoUrl(undefined)).toBe("");
    expect(safeLogoUrl("")).toBe("");
  });
});

describe("VALID_STATES", () => {
  it("contains PRE, IN, POST, and BYE", () => {
    expect(VALID_STATES.has("PRE")).toBe(true);
    expect(VALID_STATES.has("IN")).toBe(true);
    expect(VALID_STATES.has("POST")).toBe(true);
    expect(VALID_STATES.has("BYE")).toBe(true);
  });

  it("does not contain unrecognised states", () => {
    const states = VALID_STATES as ReadonlySet<string>;
    expect(states.has("UNKNOWN")).toBe(false);
    expect(states.has("")).toBe(false);
  });
});

describe("firstSegment", () => {
  it("returns the text before the first separator", () => {
    expect(firstSegment("ESPN/ESPN2", "/")).toBe("ESPN");
    expect(firstSegment("Houston, Texas, USA", ",")).toBe("Houston");
  });

  it("returns the whole string when the separator is absent", () => {
    expect(firstSegment("ESPN", "/")).toBe("ESPN");
  });

  it("returns an empty string for an empty input", () => {
    expect(firstSegment("", "/")).toBe("");
  });
});
