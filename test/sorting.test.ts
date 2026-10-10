import { describe, expect, it } from "vitest";
import { comparatorFor, deduplicate, sortKeyFor } from "../src/sorting.js";
import type { GameAttr, HassStates } from "../src/types.js";

const s = (attrs: GameAttr): HassStates[string] => ({ state: "", attributes: attrs });

describe("sortKeyFor", () => {
  it("returns timestamp for a valid date", () => {
    const date = "2024-03-15T20:00:00Z";
    expect(sortKeyFor({ date })).toBe(new Date(date).getTime());
  });

  it("keys a missing or non-parseable date to `now` instead of the epoch", () => {
    // so it sorts near the top of the schedule band instead of sinking to the
    // bottom, where a `limit` slice could hide it — see the sort in render.ts
    const now = Date.parse("2024-03-15T20:00:00Z");
    expect(sortKeyFor({}, now)).toBe(now);
    expect(sortKeyFor(undefined, now)).toBe(now);
    // Empty string and sentinel values must not leak NaN into the sort comparator.
    expect(sortKeyFor({ date: "" }, now)).toBe(now);
    expect(sortKeyFor({ date: "TBD" }, now)).toBe(now);
  });

  it("defaults `now` to the current time when not supplied", () => {
    const before = Date.now();
    const key = sortKeyFor({});
    const after = Date.now();
    expect(key).toBeGreaterThanOrEqual(before);
    expect(key).toBeLessThanOrEqual(after);
  });
});

describe("deduplicate", () => {
  it("removes duplicate game from two sensors for the same match", () => {
    const date = "2024-03-15";
    const states: HassStates = {
      "sensor.wc_fra": s({ team_homeaway: "home", date, team_abbr: "fra", opponent_abbr: "bra" }),
      "sensor.wc_bra": s({ team_homeaway: "away", date, team_abbr: "bra", opponent_abbr: "fra" }),
    };
    const list = [{ entityId: "sensor.wc_fra" }, { entityId: "sensor.wc_bra" }];
    const result = deduplicate(list, states);
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
    expect(deduplicate(list, states)).toHaveLength(2);
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
    const result = deduplicate(list, states);
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
    const result = deduplicate(list, states);
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
    const result = deduplicate(list, states);
    expect(result).toHaveLength(2);
    // Date order must be preserved: the early away-only game comes before the later home game.
    expect(result[0]?.entityId).toBe("sensor.wc_early_away");
    expect(result[1]?.entityId).toBe("sensor.wc_later_home");
  });

  it("keeps the special sensor over the non-special one when the special team plays away", () => {
    // regression: previously the home sensor always won and the away team's own
    // highlight was silently lost — see fadbb0e
    const date = "2024-03-15";
    const states: HassStates = {
      "sensor.wc_fra": s({ team_homeaway: "home", date, team_abbr: "fra", opponent_abbr: "bra" }),
      "sensor.wc_bra": s({ team_homeaway: "away", date, team_abbr: "bra", opponent_abbr: "fra" }),
    };
    const list = [
      { entityId: "sensor.wc_fra", special: false },
      { entityId: "sensor.wc_bra", special: true },
    ];
    const result = deduplicate(list, states);
    expect(result).toHaveLength(1);
    expect(result[0]?.entityId).toBe("sensor.wc_bra");
    expect(result[0]?.special).toBe(true);
  });

  it("keeps the special sensor regardless of list order", () => {
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
    const result = deduplicate(list, states);
    expect(result).toHaveLength(1);
    expect(result[0]?.entityId).toBe("sensor.wc_bra");
  });

  it("keeps special away sensor when no home sensor exists in the section", () => {
    const date = "2024-03-15";
    const states: HassStates = {
      "sensor.wc_bra": s({ team_homeaway: "away", date, team_abbr: "bra", opponent_abbr: "fra" }),
    };
    const list = [{ entityId: "sensor.wc_bra", special: true }];
    const result = deduplicate(list, states);
    expect(result).toHaveLength(1);
    expect(result[0]?.entityId).toBe("sensor.wc_bra");
  });

  it("keeps the special sensor when it's the home one", () => {
    const date = "2024-03-15";
    const states: HassStates = {
      "sensor.wc_fra": s({ team_homeaway: "home", date, team_abbr: "fra", opponent_abbr: "bra" }),
      "sensor.wc_bra": s({ team_homeaway: "away", date, team_abbr: "bra", opponent_abbr: "fra" }),
    };
    const list = [
      { entityId: "sensor.wc_bra", special: false },
      { entityId: "sensor.wc_fra", special: true },
    ];
    const result = deduplicate(list, states);
    expect(result).toHaveLength(1);
    expect(result[0]?.entityId).toBe("sensor.wc_fra");
  });

  it("marks opponentSpecial when both duplicate sensors are independently special", () => {
    // both teams in the matchup are in special_teams — only one row can survive, so
    // the discarded sensor's own specialness has to carry over onto the winner
    const date = "2024-03-15";
    const states: HassStates = {
      "sensor.wc_fra": s({ team_homeaway: "home", date, team_abbr: "fra", opponent_abbr: "bra" }),
      "sensor.wc_bra": s({ team_homeaway: "away", date, team_abbr: "bra", opponent_abbr: "fra" }),
    };
    const list = [
      { entityId: "sensor.wc_fra", special: true },
      { entityId: "sensor.wc_bra", special: true },
    ];
    const result = deduplicate(list, states);
    expect(result).toHaveLength(1);
    expect(result[0]?.entityId).toBe("sensor.wc_fra");
    expect(result[0]?.special).toBe(true);
    expect(result[0]?.opponentSpecial).toBe(true);
  });

  it("keeps whichever sensor is first-seen when neither side is special", () => {
    // no home/away preference left: which sensor "wins" a plain duplicate is now
    // just list order, since both report the same game symmetrically either way
    const date = "2024-03-15";
    const states: HassStates = {
      "sensor.wc_fra": s({ team_homeaway: "away", date, team_abbr: "fra", opponent_abbr: "bra" }),
      "sensor.wc_bra": s({ team_homeaway: "home", date, team_abbr: "bra", opponent_abbr: "fra" }),
    };
    const list = [{ entityId: "sensor.wc_fra" }, { entityId: "sensor.wc_bra" }];
    const result = deduplicate(list, states);
    expect(result[0]?.entityId).toBe("sensor.wc_fra");
  });
});

describe("comparatorFor", () => {
  const H = 3_600_000;
  const now = Date.parse("2024-03-15T20:00:00Z");
  const st = (state: string): HassStates[string] => ({ state, attributes: {} });
  // distance from now: bye 0, recent 1h, soon 3h, live 5h, far 20h, old 40h
  const states: HassStates = {
    "sensor.live": st("IN"),
    "sensor.recent": st("POST"),
    "sensor.old": st("POST"),
    "sensor.soon": st("PRE"),
    "sensor.far": st("PRE"),
    "sensor.bye": st("BYE"),
  };
  const items = [
    { entityId: "sensor.far", teamName: "Far", key: now + 20 * H },
    { entityId: "sensor.old", teamName: "Old", key: now - 40 * H },
    { entityId: "sensor.bye", teamName: "Bye", key: sortKeyFor({}, now) },
    { entityId: "sensor.live", teamName: "Live", key: now - 5 * H },
    { entityId: "sensor.soon", teamName: "Soon", key: now + 3 * H },
    { entityId: "sensor.recent", teamName: "Recent", key: now - 1 * H },
  ];
  const order = (liveFirst: boolean, byDistance = false) =>
    [...items].sort(comparatorFor({ liveFirst, byDistance }, now, states)).map((i) => i.teamName);

  it("liveFirst + byDistance: live first, then by distance from now", () => {
    expect(order(true, true)).toEqual(["Live", "Bye", "Recent", "Soon", "Far", "Old"]);
  });

  it("liveFirst: live first, then oldest to newest", () => {
    expect(order(true)).toEqual(["Live", "Old", "Recent", "Bye", "Soon", "Far"]);
  });

  it("neither: pure oldest to newest, live not pinned", () => {
    expect(order(false)).toEqual(["Old", "Live", "Recent", "Bye", "Soon", "Far"]);
  });

  it("a BYE with no date is keyed to now, so it lands between past and future games", () => {
    expect(order(false).indexOf("Bye")).toBe(3);
    expect(order(true).indexOf("Bye")).toBe(3);
  });

  it.each([
    [true, true],
    [true, false],
    [false, false],
  ])(
    "liveFirst=%s byDistance=%s: equal keys tie-break by team name, then entity id",
    (liveFirst, byDistance) => {
      const tied = [
        { entityId: "sensor.z", teamName: "Same", key: now },
        { entityId: "sensor.a", teamName: "Same", key: now },
        { entityId: "sensor.m", teamName: "Alpha", key: now },
      ];
      const ids = tied
        .sort(comparatorFor({ liveFirst, byDistance }, now, {}))
        .map((i) => i.entityId);
      expect(ids).toEqual(["sensor.m", "sensor.a", "sensor.z"]);
    }
  );
});
