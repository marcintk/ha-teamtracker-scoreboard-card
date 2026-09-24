import { describe, expect, it } from "vitest";
import { gameKeyFor } from "../src/game-key.js";
import type { GameAttr, HassStates } from "../src/types.js";

const s = (attrs: GameAttr): HassStates[string] => ({ state: "", attributes: attrs });

describe("gameKeyFor", () => {
  it("produces the same key for two sibling sensors describing the same game from opposite perspectives", () => {
    const date = "2024-03-15";
    const states: HassStates = {
      "sensor.wc_fra": s({ team_homeaway: "home", date, team_abbr: "fra", opponent_abbr: "bra" }),
      "sensor.wc_bra": s({ team_homeaway: "away", date, team_abbr: "bra", opponent_abbr: "fra" }),
    };
    expect(gameKeyFor("sensor.wc_fra", states)).toBe(gameKeyFor("sensor.wc_bra", states));
  });

  it("falls back to the entityId when the sensor has no date attribute", () => {
    const states: HassStates = {
      "sensor.wc_fra": s({ team_homeaway: "home" }), // no date/abbr
    };
    expect(gameKeyFor("sensor.wc_fra", states)).toBe("sensor.wc_fra");
  });
});
