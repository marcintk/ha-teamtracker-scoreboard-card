import { describe, expect, it } from "vitest";
import { selectRows } from "../src/section-rows.js";
import type { GameAttr, HassStates } from "../src/types.js";

const g = (state: string, attrs: GameAttr): HassStates[string] => ({ state, attributes: attrs });
const ids = (rows: { entityId: string }[]) => rows.map((r) => r.entityId);

const states: HassStates = {
  "sensor.nba_c": g("PRE", {
    date: "2024-03-17T20:00:00Z",
    team_name: "C",
    team_abbr: "c",
    opponent_abbr: "z",
  }),
  "sensor.nba_a": g("PRE", {
    date: "2024-03-15T20:00:00Z",
    team_name: "A",
    team_abbr: "a",
    opponent_abbr: "y",
  }),
  "sensor.nba_b": g("IN", {
    date: "2024-03-16T20:00:00Z",
    team_name: "B",
    team_abbr: "b",
    opponent_abbr: "x",
  }),
  "sensor.nba_bad": g("unavailable", { date: "2024-03-14T20:00:00Z" }),
  "sensor.nfl_q": g("PRE", { date: "2024-03-10T20:00:00Z", team_name: "Q" }),
};

describe("selectRows", () => {
  it("drops invalid states, orders chronologically with default flags false", () => {
    const rows = selectRows(
      { name: "NBA", prefix: "sensor.nba_" },
      states,
      ["sensor.nba_a", "sensor.nba_b", "sensor.nba_c"],
      {
        liveFirst: false,
      }
    );
    expect(rows).toEqual([
      { entityId: "sensor.nba_a", special: false, opponentSpecial: false },
      { entityId: "sensor.nba_b", special: false, opponentSpecial: false },
      { entityId: "sensor.nba_c", special: false, opponentSpecial: false },
    ]);
  });

  it("uses explicit entityIds instead of the prefix", () => {
    const rows = selectRows({ name: "NBA", prefix: "sensor.nba_" }, states, ["sensor.nfl_q"], {
      liveFirst: false,
    });
    expect(ids(rows)).toEqual(["sensor.nfl_q"]);
  });

  it("limit takes the first N chronological rows", () => {
    const rows = selectRows(
      { name: "NBA", prefix: "sensor.nba_", limit: 2 },
      states,
      ["sensor.nba_a", "sensor.nba_b", "sensor.nba_c"],
      {
        liveFirst: false,
      }
    );
    expect(ids(rows)).toEqual(["sensor.nba_a", "sensor.nba_b"]);
  });

  it("liveFirst pins IN games to the top", () => {
    const rows = selectRows(
      { name: "NBA", prefix: "sensor.nba_" },
      states,
      ["sensor.nba_a", "sensor.nba_b", "sensor.nba_c"],
      {
        liveFirst: true,
      }
    );
    expect(ids(rows)).toEqual(["sensor.nba_b", "sensor.nba_a", "sensor.nba_c"]);
  });

  it("dedups sibling sensors, keeping the special one and flagging opponentSpecial when both are special", () => {
    const date = "2024-03-15T20:00:00Z";
    const st: HassStates = {
      "sensor.wc_fra": g("PRE", {
        date,
        team_homeaway: "home",
        team_abbr: "fra",
        opponent_abbr: "bra",
      }),
      "sensor.wc_bra": g("PRE", {
        date,
        team_homeaway: "away",
        team_abbr: "bra",
        opponent_abbr: "fra",
      }),
    };
    const one = selectRows(
      { name: "WC", prefix: "sensor.wc_", special_teams: ["bra"] },
      st,
      ["sensor.wc_fra", "sensor.wc_bra"],
      { liveFirst: false }
    );
    expect(one).toEqual([{ entityId: "sensor.wc_bra", special: true, opponentSpecial: false }]);
    const both = selectRows(
      { name: "WC", prefix: "sensor.wc_", special_teams: ["fra", "bra"] },
      st,
      ["sensor.wc_fra", "sensor.wc_bra"],
      { liveFirst: false }
    );
    expect(both).toEqual([{ entityId: "sensor.wc_bra", special: true, opponentSpecial: true }]);
  });
});
