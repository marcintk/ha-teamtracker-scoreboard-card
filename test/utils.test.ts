import { describe, expect, it } from "vitest";
import type { HassStates, SectionConfig } from "../src/types.js";
import {
  blinkMsForId,
  buildTrackedIds,
  DEFAULT_LIMIT,
  DEFAULT_ROW_HEIGHT,
  DEFAULT_ROW_PADDING,
  DEFAULT_SCORE_BLINK,
  DEFAULT_SLIDE_SEC,
  firstSegment,
  hasRelevantChange,
  safeLogoUrl,
  sectionMatches,
  VALID_STATES,
} from "../src/utils.js";

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

describe("shared defaults", () => {
  it("matches the documented fallback values", () => {
    expect(DEFAULT_LIMIT).toBe(10);
    expect(DEFAULT_SCORE_BLINK).toBe(5);
    expect(DEFAULT_SLIDE_SEC).toBe(45);
    expect(DEFAULT_ROW_HEIGHT).toBe(28);
    expect(DEFAULT_ROW_PADDING).toBe(5);
  });
});

// case table over the union (not either/or) precedence rule: a section matches an id
// via prefix OR its explicit entities list, but once entities is set without a prefix,
// the "match everything" default no longer applies.
describe("sectionMatches", () => {
  it("prefix set, entities unset: matches by prefix only", () => {
    const section: SectionConfig = { prefix: "sensor.nba_" };
    expect(sectionMatches(section, "sensor.nba_lal")).toBe(true);
    expect(sectionMatches(section, "sensor.custom_bos")).toBe(false);
  });

  it("prefix unset, entities set: matches only the listed entities", () => {
    const section: SectionConfig = { entities: ["sensor.custom_bos"] };
    expect(sectionMatches(section, "sensor.custom_bos")).toBe(true);
    expect(sectionMatches(section, "sensor.anything_else")).toBe(false);
  });

  it("both set: unions prefix matches with the explicit entities list", () => {
    const section: SectionConfig = { prefix: "sensor.nba_", entities: ["sensor.custom_bos"] };
    expect(sectionMatches(section, "sensor.nba_lal")).toBe(true);
    expect(sectionMatches(section, "sensor.custom_bos")).toBe(true);
    expect(sectionMatches(section, "sensor.other")).toBe(false);
  });

  it("neither set: matches everything (prefix defaults to empty string)", () => {
    const section: SectionConfig = {};
    expect(sectionMatches(section, "sensor.anything")).toBe(true);
  });
});

describe("blinkMsForId", () => {
  it("uses the longer score_blink among every section the id matches", () => {
    const sections: SectionConfig[] = [
      { name: "All", score_blink: 0 },
      { name: "NBA", prefix: "sensor.nba_", score_blink: 5 },
    ];
    expect(blinkMsForId(sections, "sensor.nba_lal")).toBe(5000);
  });

  it("returns 0 when every matching section has blink disabled", () => {
    expect(blinkMsForId([{ name: "All", score_blink: 0 }], "sensor.nba_lal")).toBe(0);
  });

  it("uses the 5s default when the id matches no section", () => {
    expect(blinkMsForId([{ prefix: "sensor.nba_" }], "sensor.unknown_x")).toBe(5000);
  });

  it("uses the 5s default when there are no sections at all", () => {
    expect(blinkMsForId([], "sensor.nba_lal")).toBe(5000);
  });
});

describe("buildTrackedIds", () => {
  it("assigns an id to every matching section, not just the first", () => {
    const sections: SectionConfig[] = [
      { name: "NBA", prefix: "sensor.nba_" },
      { name: "My teams", entities: ["sensor.nba_lal"] },
    ];
    const { trackedIds, trackedBySection } = buildTrackedIds(sections, [
      "sensor.nba_lal",
      "sensor.nba_bos",
    ]);
    expect(trackedIds.has("sensor.nba_lal")).toBe(true);
    expect(trackedIds.has("sensor.nba_bos")).toBe(true);
    expect(trackedBySection.get(0)).toEqual(["sensor.nba_lal", "sensor.nba_bos"]);
    expect(trackedBySection.get(1)).toEqual(["sensor.nba_lal"]);
  });

  it("produces an empty result when there are no sections", () => {
    const { trackedIds, trackedBySection } = buildTrackedIds([], ["sensor.nba_lal"]);
    expect(trackedIds.size).toBe(0);
    expect(trackedBySection.size).toBe(0);
  });
});

describe("hasRelevantChange", () => {
  const states: HassStates = { "sensor.nba_lal": { state: "PRE", attributes: {} } };

  it("returns true when there is no previous snapshot", () => {
    expect(hasRelevantChange(new Set(["sensor.nba_lal"]), {}, states, undefined)).toBe(true);
  });

  it("returns true when there is no config", () => {
    expect(hasRelevantChange(new Set(["sensor.nba_lal"]), null, states, states)).toBe(true);
  });

  it("returns true when there are no tracked ids", () => {
    expect(hasRelevantChange(null, {}, states, states)).toBe(true);
  });

  it("returns false when no tracked entity's state object changed", () => {
    expect(hasRelevantChange(new Set(["sensor.nba_lal"]), {}, states, states)).toBe(false);
  });

  it("returns true when a tracked entity's state object changed", () => {
    const nextStates: HassStates = { "sensor.nba_lal": { state: "IN", attributes: {} } };
    expect(hasRelevantChange(new Set(["sensor.nba_lal"]), {}, nextStates, states)).toBe(true);
  });
});
