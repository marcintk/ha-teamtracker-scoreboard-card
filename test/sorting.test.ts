import { describe, expect, it } from "vitest";
import { deduplicate, resolveSortMode, sortKeyFor, winRatio } from "../src/sorting.js";
import type { GameAttr, HassStates, ViewMode } from "../src/types.js";

const s = (attrs: GameAttr): HassStates[string] => ({ state: "", attributes: attrs });

describe("winRatio", () => {
  it("calculates win percentage for win-loss", () => {
    expect(winRatio("30-10", "win-loss")).toBeCloseTo(0.75);
    expect(winRatio("0-10", "win-loss")).toBe(0);
    expect(winRatio("0-0", "win-loss")).toBe(0);
  });

  it("calculates points ratio for win-draw-loss (soccer W=3 D=1 L=0)", () => {
    // 10W 5D 5L → points = 3*10+5 = 35, max = 3*20 = 60
    expect(winRatio("10-5-5", "win-draw-loss")).toBeCloseTo(35 / 60);
    // 10W 3D 7L → points = 3*10+3 = 33, max = 3*20 = 60
    // Guards against swapping draws (pts[1]) with losses (pts[2]) in the formula.
    expect(winRatio("10-3-7", "win-draw-loss")).toBeCloseTo(33 / 60);
    expect(winRatio("0-0-0", "win-draw-loss")).toBe(0);
  });

  it("calculates points ratio for win-loss-otl (NHL W=2 OTL=1 L=0)", () => {
    // Record format: W-L-OTL
    // 40W 28L 14OTL → points = 2*40+14 = 94, max = 2*82 = 164
    expect(winRatio("40-28-14", "win-loss-otl")).toBeCloseTo(94 / 164);
    // 35W 33L 14OTL → points = 2*35+14 = 84, max = 2*82 = 164
    expect(winRatio("35-33-14", "win-loss-otl")).toBeCloseTo(84 / 164);
    expect(winRatio("0-0-0", "win-loss-otl")).toBe(0);
  });

  it("handles missing or malformed record", () => {
    expect(winRatio(undefined, "win-loss")).toBe(0);
    expect(winRatio("", "win-loss")).toBe(0);
  });

  it("treats a non-numeric segment as no games played (0), not NaN", () => {
    // reachable via a forced `view: "standings"` section, which skips the
    // NUMERIC_RECORD guard in resolveSortMode — see the describe below
    expect(winRatio("12-4 (H: 6-2)", "win-loss")).toBe(0);
    expect(winRatio("12-4 (H: 6-2)", "win-draw-loss")).toBe(0);
    expect(winRatio("12-4 (H: 6-2)", "win-loss-otl")).toBe(0);
    expect(Number.isNaN(winRatio("12-4 (H: 6-2)", "win-loss"))).toBe(false);
  });
});

describe("sortKeyFor", () => {
  it("returns timestamp for by-date", () => {
    const date = "2024-03-15T20:00:00Z";
    expect(sortKeyFor({ date }, "by-date")).toBe(new Date(date).getTime());
  });

  it("keys a missing or non-parseable date to `now` instead of the epoch", () => {
    // so it sorts near the top of the schedule band instead of sinking to the
    // bottom, where a `limit` slice could hide it — see the `by-date` sort in render.ts
    const now = Date.parse("2024-03-15T20:00:00Z");
    expect(sortKeyFor({}, "by-date", now)).toBe(now);
    expect(sortKeyFor(undefined, "by-date", now)).toBe(now);
    // Empty string and sentinel values must not leak NaN into the sort comparator.
    expect(sortKeyFor({ date: "" }, "by-date", now)).toBe(now);
    expect(sortKeyFor({ date: "TBD" }, "by-date", now)).toBe(now);
  });

  it("defaults `now` to the current time when not supplied", () => {
    const before = Date.now();
    const key = sortKeyFor({}, "by-date");
    const after = Date.now();
    expect(key).toBeGreaterThanOrEqual(before);
    expect(key).toBeLessThanOrEqual(after);
  });

  it("returns win ratio for win-loss", () => {
    expect(sortKeyFor({ team_record: "30-10" }, "win-loss")).toBeCloseTo(0.75);
  });
});

describe("deduplicate", () => {
  it("returns list unchanged for non-by-date sort", () => {
    const list = [{ entityId: "a" }, { entityId: "b" }];
    expect(deduplicate(list, "win-loss", {})).toBe(list);
    expect(deduplicate(list, "win-draw-loss", {})).toBe(list);
  });

  it("removes duplicate game from two sensors for the same match", () => {
    const date = "2024-03-15";
    const states: HassStates = {
      "sensor.wc_fra": s({ team_homeaway: "home", date, team_abbr: "fra", opponent_abbr: "bra" }),
      "sensor.wc_bra": s({ team_homeaway: "away", date, team_abbr: "bra", opponent_abbr: "fra" }),
    };
    const list = [{ entityId: "sensor.wc_fra" }, { entityId: "sensor.wc_bra" }];
    const result = deduplicate(list, "by-date", states);
    expect(result).toHaveLength(1);
  });

  it("keeps both entries when games are on different dates", () => {
    const states: HassStates = {
      "sensor.wc_fra": s({
        team_homeaway: "home",
        date: "2024-03-15",
        team_abbr: "fra",
        opponent_abbr: "bra",
      }),
      "sensor.wc_bra": s({
        team_homeaway: "home",
        date: "2024-03-16",
        team_abbr: "bra",
        opponent_abbr: "fra",
      }),
    };
    const list = [{ entityId: "sensor.wc_fra" }, { entityId: "sensor.wc_bra" }];
    expect(deduplicate(list, "by-date", states)).toHaveLength(2);
  });

  it("handles entity missing from states gracefully", () => {
    const list = [
      { entityId: "sensor.wc_fra" },
      { entityId: "sensor.wc_missing" }, // not in states
    ];
    const states: HassStates = {
      "sensor.wc_fra": s({
        team_homeaway: "home",
        date: "2024-03-15",
        team_abbr: "fra",
        opponent_abbr: "bra",
      }),
    };
    const result = deduplicate(list, "by-date", states);
    expect(result).toHaveLength(2);
  });

  it("keeps both rows when two sensors have no date attribute (no false dedup collision)", () => {
    // Both sensors lack a date — previously both produced "undefined_undefined_undefined"
    // and the second was silently dropped by seen.has(key).
    const list = [{ entityId: "sensor.wc_fra" }, { entityId: "sensor.wc_bra" }];
    const states: HassStates = {
      "sensor.wc_fra": s({ team_homeaway: "home" }), // no date/abbr
      "sensor.wc_bra": s({ team_homeaway: "home" }), // no date/abbr
    };
    const result = deduplicate(list, "by-date", states);
    expect(result).toHaveLength(2);
  });

  it("shows away-only game in correct date position when home sensor is missing", () => {
    // Bug: old code called preferHome() on the whole list, moving ALL away sensors to the end.
    // A game whose home sensor is missing/unavailable got pushed past games with home sensors,
    // so the limit slice cut it off and the game was never shown.
    const states: HassStates = {
      "sensor.wc_early_away": s({
        team_homeaway: "away",
        date: "2024-03-14",
        team_abbr: "fra",
        opponent_abbr: "bra",
      }),
      "sensor.wc_later_home": s({
        team_homeaway: "home",
        date: "2024-03-15",
        team_abbr: "gsw",
        opponent_abbr: "lal",
      }),
    };
    // List is already date-sorted (earlier game first)
    const list = [{ entityId: "sensor.wc_early_away" }, { entityId: "sensor.wc_later_home" }];
    const result = deduplicate(list, "by-date", states);
    expect(result).toHaveLength(2);
    // Date order must be preserved: the early away-only game comes before the later home game.
    expect(result[0]?.entityId).toBe("sensor.wc_early_away");
    expect(result[1]?.entityId).toBe("sensor.wc_later_home");
  });

  it("prefers home sensor and marks opponentSpecial when away sensor is special", () => {
    const date = "2024-03-15";
    const states: HassStates = {
      "sensor.wc_fra": s({ team_homeaway: "home", date, team_abbr: "fra", opponent_abbr: "bra" }),
      "sensor.wc_bra": s({ team_homeaway: "away", date, team_abbr: "bra", opponent_abbr: "fra" }),
    };
    const list = [
      { entityId: "sensor.wc_fra", special: false },
      { entityId: "sensor.wc_bra", special: true },
    ];
    const result = deduplicate(list, "by-date", states);
    expect(result).toHaveLength(1);
    expect(result[0]?.entityId).toBe("sensor.wc_fra");
    expect(result[0]?.opponentSpecial).toBe(true);
  });

  it("prefers home sensor and marks opponentSpecial regardless of list order", () => {
    const date = "2024-03-15";
    const states: HassStates = {
      "sensor.wc_fra": s({ team_homeaway: "home", date, team_abbr: "fra", opponent_abbr: "bra" }),
      "sensor.wc_bra": s({ team_homeaway: "away", date, team_abbr: "bra", opponent_abbr: "fra" }),
    };
    // away-special sensor appears first in list
    const list = [
      { entityId: "sensor.wc_bra", special: true },
      { entityId: "sensor.wc_fra", special: false },
    ];
    const result = deduplicate(list, "by-date", states);
    expect(result).toHaveLength(1);
    expect(result[0]?.entityId).toBe("sensor.wc_fra");
    expect(result[0]?.opponentSpecial).toBe(true);
  });

  it("keeps special away sensor when no home sensor exists in the section", () => {
    const date = "2024-03-15";
    const states: HassStates = {
      "sensor.wc_bra": s({ team_homeaway: "away", date, team_abbr: "bra", opponent_abbr: "fra" }),
    };
    const list = [{ entityId: "sensor.wc_bra", special: true }];
    const result = deduplicate(list, "by-date", states);
    expect(result).toHaveLength(1);
    expect(result[0]?.entityId).toBe("sensor.wc_bra");
    expect(result[0]?.opponentSpecial).toBeUndefined();
  });

  it("drops non-special away sensor when home sensor is the special one", () => {
    const date = "2024-03-15";
    const states: HassStates = {
      "sensor.wc_fra": s({ team_homeaway: "home", date, team_abbr: "fra", opponent_abbr: "bra" }),
      "sensor.wc_bra": s({ team_homeaway: "away", date, team_abbr: "bra", opponent_abbr: "fra" }),
    };
    // away-non-special sensor appears first to exercise the drop-non-special branch
    const list = [
      { entityId: "sensor.wc_bra", special: false },
      { entityId: "sensor.wc_fra", special: true },
    ];
    const result = deduplicate(list, "by-date", states);
    expect(result).toHaveLength(1);
    expect(result[0]?.entityId).toBe("sensor.wc_fra");
    expect(result[0]?.opponentSpecial).toBeUndefined();
  });

  it("prefers home sensor when deduplicating", () => {
    const date = "2024-03-15";
    const states: HassStates = {
      "sensor.wc_fra": s({ team_homeaway: "away", date, team_abbr: "fra", opponent_abbr: "bra" }),
      "sensor.wc_bra": s({ team_homeaway: "home", date, team_abbr: "bra", opponent_abbr: "fra" }),
    };
    const list = [{ entityId: "sensor.wc_fra" }, { entityId: "sensor.wc_bra" }];
    const result = deduplicate(list, "by-date", states);
    expect(result[0]?.entityId).toBe("sensor.wc_bra");
  });
});

describe("resolveSortMode", () => {
  it("returns rank_type when every entity has a numeric win-loss record", () => {
    const states: HassStates = { "sensor.a": s({ team_record: "12-4" }) };
    expect(resolveSortMode(["sensor.a"], states, "win-loss")).toBe("win-loss");
  });

  it("accepts W-D-L and W-L-OTL shaped records", () => {
    const states: HassStates = {
      "sensor.a": s({ team_record: "0-1-2" }),
      "sensor.b": s({ team_record: "5-2-1" }),
    };
    expect(resolveSortMode(["sensor.a", "sensor.b"], states, "win-draw-loss")).toBe(
      "win-draw-loss"
    );
  });

  it("returns by-date when any entity is missing a numeric record", () => {
    const states: HassStates = {
      "sensor.a": s({ team_record: "12-4" }),
      "sensor.b": s({ team_record: "" }),
    };
    expect(resolveSortMode(["sensor.a", "sensor.b"], states, "win-loss")).toBe("by-date");
  });

  it("returns by-date when the record attribute is absent (HA startup, cup fixtures)", () => {
    const states: HassStates = { "sensor.a": s({}) };
    expect(resolveSortMode(["sensor.a"], states, "win-draw-loss")).toBe("by-date");
  });

  it("returns by-date for a non-numeric record string", () => {
    const states: HassStates = { "sensor.a": s({ team_record: "12-4 (H: 6-2)" }) };
    expect(resolveSortMode(["sensor.a"], states, "win-loss")).toBe("by-date");
  });

  it("returns rank_type for an empty entity list", () => {
    expect(resolveSortMode([], {}, "win-loss-otl")).toBe("win-loss-otl");
  });

  describe("view override (4th parameter)", () => {
    it("view='standings' forces rank_type even when records are missing", () => {
      const states: HassStates = { "sensor.a": s({}) };
      expect(resolveSortMode(["sensor.a"], states, "win-draw-loss", "standings")).toBe(
        "win-draw-loss"
      );
    });

    it("view='schedule' forces by-date even when every entity has a record", () => {
      const states: HassStates = {
        "sensor.a": s({ team_record: "12-4" }),
        "sensor.b": s({ team_record: "9-7" }),
      };
      expect(resolveSortMode(["sensor.a", "sensor.b"], states, "win-loss", "schedule")).toBe(
        "by-date"
      );
    });

    it("view='auto' passed explicitly runs the record heuristic", () => {
      const states: HassStates = {
        "sensor.a": s({ team_record: "12-4" }),
        "sensor.b": s({}),
      };
      expect(resolveSortMode(["sensor.a", "sensor.b"], states, "win-loss", "auto")).toBe("by-date");
    });

    it("an unrecognised view value (config typo) falls through to the auto heuristic", () => {
      const view = "fixtures" as ViewMode; // no validation layer — mirrors rank_type
      const allRanked: HassStates = { "sensor.a": s({ team_record: "12-4" }) };
      const someMissing: HassStates = {
        "sensor.a": s({ team_record: "12-4" }),
        "sensor.b": s({}),
      };
      expect(resolveSortMode(["sensor.a"], allRanked, "win-loss", view)).toBe("win-loss");
      expect(resolveSortMode(["sensor.a", "sensor.b"], someMissing, "win-loss", view)).toBe(
        "by-date"
      );
    });
  });
});
