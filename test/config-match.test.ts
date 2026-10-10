import { describe, expect, it } from "vitest";
import {
  buildTrackedIds,
  hasRelevantChange,
  isSpecialTeam,
  sectionBlinkOn,
  sectionMatches,
} from "../src/config-match.js";
import type { HassStates, SectionConfig } from "../src/types.js";

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

describe("isSpecialTeam", () => {
  it("matches by the suffix left after stripping the section's prefix", () => {
    const section: SectionConfig = { prefix: "sensor.nba_", special_teams: ["lal"] };
    expect(isSpecialTeam(section, "sensor.nba_lal")).toBe(true);
    expect(isSpecialTeam(section, "sensor.nba_bos")).toBe(false);
  });

  it("matches by full entity id even when a prefix is set", () => {
    const section: SectionConfig = {
      prefix: "sensor.nba_",
      entities: ["sensor.custom_bos"],
      special_teams: ["sensor.custom_bos"],
    };
    expect(isSpecialTeam(section, "sensor.custom_bos")).toBe(true);
  });

  it("returns false when special_teams is unset or empty", () => {
    expect(isSpecialTeam({}, "sensor.nba_lal")).toBe(false);
    expect(isSpecialTeam({ special_teams: [] }, "sensor.nba_lal")).toBe(false);
  });
});

describe("sectionBlinkOn", () => {
  it('is on unless false, the legacy 0 or the string "false"; legacy non-zero numbers are on', () => {
    const on = (v: unknown) => sectionBlinkOn({ score_blink: v } as unknown as SectionConfig);
    expect([undefined, true, 10].map(on)).toEqual([true, true, true]);
    expect([false, 0, "false"].map(on)).toEqual([false, false, false]);
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

  it("blinkOnById is true if any matching section has blink on; unmatched ids are absent", () => {
    const sections: SectionConfig[] = [
      { prefix: "sensor.a_", score_blink: false },
      { prefix: "sensor.n_", score_blink: true },
      { prefix: "sensor.n_", score_blink: 0 as unknown as boolean },
      { entities: ["sensor.solo"], score_blink: "false" as unknown as boolean },
    ];
    const { blinkOnById } = buildTrackedIds(sections, [
      "sensor.a_x",
      "sensor.n_z",
      "sensor.solo",
      "other.q",
    ]);
    expect(blinkOnById.get("sensor.a_x")).toBe(false);
    expect(blinkOnById.get("sensor.n_z")).toBe(true);
    expect(blinkOnById.get("sensor.solo")).toBe(false);
    expect(blinkOnById.has("other.q")).toBe(false);
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
    expect(hasRelevantChange(new Set(["sensor.nba_lal"]), states, undefined)).toBe(true);
  });

  it("returns true when there are no tracked ids", () => {
    expect(hasRelevantChange(null, states, states)).toBe(true);
  });

  it("returns false when no tracked entity's state object changed", () => {
    expect(hasRelevantChange(new Set(["sensor.nba_lal"]), states, states)).toBe(false);
  });

  it("returns true when a tracked entity's state object changed", () => {
    const nextStates: HassStates = { "sensor.nba_lal": { state: "IN", attributes: {} } };
    expect(hasRelevantChange(new Set(["sensor.nba_lal"]), nextStates, states)).toBe(true);
  });

  it("returns false when a new entity appears that is not yet tracked (fixed refresh picks it up)", () => {
    const nextStates: HassStates = {
      ...states,
      "sensor.nba_bos": { state: "PRE", attributes: {} },
    };
    expect(hasRelevantChange(new Set(["sensor.nba_lal"]), nextStates, states)).toBe(false);
  });
});
