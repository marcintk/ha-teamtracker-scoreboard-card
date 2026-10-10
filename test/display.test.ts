import { describe, expect, it } from "vitest";
import {
  colonColor,
  colorVar,
  isSideAheadOrWinning,
  isSideOutrightWinning,
  nameText,
  rankText,
  scoreBg,
  scoreColor,
  scoreText,
  sideRelation,
  teamColor,
} from "../src/display.js";
import { gameView } from "../src/game-view.js";
import type { GameAttr, GameState } from "../src/types.js";

// Sides as the new API takes them, built from an attr set; `self`/`other` by visual side.
const sides = (attr: GameAttr, state = "IN") => gameView({ state, attributes: attr });
const pair = (side: "home" | "away", attr: GameAttr, state = "IN") => {
  const v = sides(attr, state);
  return side === "home" ? ([v.home, v.away] as const) : ([v.away, v.home] as const);
};
const self = (side: "home" | "away", attr: GameAttr) => pair(side, attr)[0];

const homeAttr: GameAttr = {
  team_homeaway: "home",
  team_name: "Lakers",
  opponent_name: "Celtics",
  team_record: "20-10",
  opponent_record: "18-12",
  team_score: "95",
  opponent_score: "90",
  team_winner: true,
  opponent_winner: false,
  team_logo: "https://cdn.example.com/lal.png",
  opponent_logo: "https://cdn.example.com/bos.png",
};

const awayAttr: GameAttr = { ...homeAttr, team_homeaway: "away" };

describe("colorVar", () => {
  it("returns the override when one is given", () => {
    expect(colorVar("gold", "--ttsc-score-winner-color", "orange")).toBe("gold");
  });

  it("falls back to the CSS custom property when no override is given", () => {
    expect(colorVar(undefined, "--ttsc-score-winner-color", "orange")).toBe(
      "var(--ttsc-score-winner-color, orange)"
    );
  });
});

// single source of truth behind both isSideAheadOrWinning (tie counts as "ahead") and
// isSideOutrightWinning (tie counts as "trailing") — see their own doc comments for why
// the two need different tie handling.
describe("sideRelation", () => {
  it("is 'ahead' when the side leads during IN", () => {
    expect(sideRelation(...pair("home", homeAttr), "IN" as GameState)).toBe("ahead");
  });

  it("is 'trailing' when the side is behind during IN", () => {
    expect(sideRelation(...pair("away", homeAttr), "IN" as GameState)).toBe("trailing");
  });

  it("is 'tied' on an exact score tie during IN", () => {
    const tied: GameAttr = { ...homeAttr, team_score: "90", opponent_score: "90" };
    expect(sideRelation(...pair("home", tied), "IN" as GameState)).toBe("tied");
    expect(sideRelation(...pair("away", tied), "IN" as GameState)).toBe("tied");
  });

  it("is 'ahead' or 'trailing' during POST based on the winner flag, never 'tied'", () => {
    expect(sideRelation(...pair("home", homeAttr), "POST" as GameState)).toBe("ahead");
    expect(sideRelation(...pair("away", homeAttr), "POST" as GameState)).toBe("trailing");
    const draw: GameAttr = { ...homeAttr, team_winner: false, opponent_winner: false };
    expect(sideRelation(...pair("home", draw), "POST" as GameState)).toBe("trailing");
  });

  it("parses cricket-style scores like '176/5' with parseFloat", () => {
    const a: GameAttr = { ...homeAttr, team_score: "176/5", opponent_score: "150/3" };
    expect(sideRelation(...pair("home", a), "IN" as GameState)).toBe("ahead");
    expect(sideRelation(...pair("away", a), "IN" as GameState)).toBe("trailing");
  });

  it("backs isSideAheadOrWinning (tie counts as ahead) and isSideOutrightWinning (tie doesn't)", () => {
    const tied: GameAttr = { ...homeAttr, team_score: "90", opponent_score: "90" };
    expect(isSideAheadOrWinning(...pair("home", tied), "IN" as GameState)).toBe(true);
    expect(isSideOutrightWinning(...pair("home", tied), "IN" as GameState)).toBe(false);
  });
});

describe("teamColor", () => {
  it("falls back to the default color during PRE", () => {
    expect(teamColor(...pair("home", homeAttr), "PRE" as GameState)).toBe(
      "var(--ttsc-name-default-color, #777)"
    );
    expect(teamColor(...pair("away", homeAttr), "PRE" as GameState)).toBe(
      "var(--ttsc-name-default-color, #777)"
    );
  });

  it("returns the leading accent colour when the home side is leading during IN", () => {
    // home team scores 95 vs 90 — home is leading
    expect(teamColor(...pair("home", homeAttr), "IN" as GameState)).toBe(
      "var(--ttsc-name-leading-color, var(--primary-text-color))"
    );
  });

  it("returns the default color for the trailing side during IN", () => {
    // away (opponent) trails 90 vs home's 95
    expect(teamColor(...pair("away", homeAttr), "IN" as GameState)).toBe(
      "var(--ttsc-name-default-color, #777)"
    );
  });

  it("returns the winner accent colour for the winning side during POST", () => {
    expect(teamColor(...pair("home", homeAttr), "POST" as GameState)).toBe(
      "var(--ttsc-name-winner-color, var(--primary-text-color))"
    );
  });

  it("returns the default color (not a loser color) for the losing side during POST", () => {
    expect(teamColor(...pair("away", homeAttr), "POST" as GameState)).toBe(
      "var(--ttsc-name-default-color, #777)"
    );
  });

  it("supports the away side leading/winning too", () => {
    expect(teamColor(...pair("away", awayAttr), "IN" as GameState)).toBe(
      "var(--ttsc-name-leading-color, var(--primary-text-color))"
    );
    expect(teamColor(...pair("away", awayAttr), "POST" as GameState)).toBe(
      "var(--ttsc-name-winner-color, var(--primary-text-color))"
    );
  });

  it("leaves both names in the default color on an exact tie during IN (neither side leads)", () => {
    const tied: GameAttr = { ...homeAttr, team_score: "90", opponent_score: "90" };
    expect(teamColor(...pair("home", tied), "IN" as GameState)).toBe(
      "var(--ttsc-name-default-color, #777)"
    );
    expect(teamColor(...pair("away", tied), "IN" as GameState)).toBe(
      "var(--ttsc-name-default-color, #777)"
    );
  });

  it("leaves both names in the default color on a POST draw (neither side wins)", () => {
    const draw: GameAttr = { ...homeAttr, team_winner: false, opponent_winner: false };
    expect(teamColor(...pair("home", draw), "POST" as GameState)).toBe(
      "var(--ttsc-name-default-color, #777)"
    );
    expect(teamColor(...pair("away", draw), "POST" as GameState)).toBe(
      "var(--ttsc-name-default-color, #777)"
    );
  });

  it("treats undefined scores as 0-0 (tied) during IN", () => {
    const noScores = { ...homeAttr, team_score: undefined, opponent_score: undefined };
    expect(teamColor(...pair("home", noScores), "IN" as GameState)).toBe(
      "var(--ttsc-name-default-color, #777)"
    );
    expect(teamColor(...pair("away", noScores), "IN" as GameState)).toBe(
      "var(--ttsc-name-default-color, #777)"
    );
  });

  it("uses config colors when provided, independently for leading (IN) vs winner (POST)", () => {
    const colors = { name_leading: "gold", name_winner: "purple", name_default: "gray" };
    expect(teamColor(...pair("home", homeAttr), "PRE" as GameState, colors)).toBe("gray");
    expect(teamColor(...pair("home", homeAttr), "IN" as GameState, colors)).toBe("gold");
    expect(teamColor(...pair("home", homeAttr), "POST" as GameState, colors)).toBe("purple");
    expect(teamColor(...pair("away", homeAttr), "POST" as GameState, colors)).toBe("gray");
  });
});

describe("scoreBg", () => {
  it("returns dark background for PRE", () => {
    expect(scoreBg("PRE")).toBe("#303030");
  });

  it("returns light background for IN", () => {
    expect(scoreBg("IN")).toBe("lightgray");
  });

  it("returns transparent for POST and other states", () => {
    expect(scoreBg("POST")).toBe("transparent");
    expect(scoreBg("BYE")).toBe("transparent");
  });
});

describe("scoreColor", () => {
  it("returns black for PRE regardless of side", () => {
    expect(scoreColor(...pair("home", homeAttr), "PRE" as GameState)).toBe("black");
    expect(scoreColor(...pair("away", homeAttr), "PRE" as GameState)).toBe("black");
  });

  it("returns the leading colour for the leading team during IN", () => {
    // home team scores 95 vs 90 — home is leading
    expect(scoreColor(...pair("home", homeAttr), "IN" as GameState)).toBe(
      "var(--ttsc-score-leading-color, brown)"
    );
    expect(scoreColor(...pair("away", homeAttr), "IN" as GameState)).toBe("black");
  });

  it("treats undefined scores as 0 during IN", () => {
    const attr = { ...homeAttr, team_score: undefined, opponent_score: undefined };
    // tied at 0-0: home side ts>=os
    expect(scoreColor(...pair("home", attr), "IN" as GameState)).toBe(
      "var(--ttsc-score-leading-color, brown)"
    );
  });

  it("returns the winner / loser colours in POST", () => {
    expect(scoreColor(...pair("home", homeAttr), "POST" as GameState)).toBe(
      "var(--ttsc-score-winner-color, orange)"
    );
    expect(scoreColor(...pair("away", homeAttr), "POST" as GameState)).toBe(
      "var(--ttsc-score-loser-color, darkgray)"
    );
  });

  it("uses config colors for winner, loser, and leading", () => {
    const colors = { score_winner: "gold", score_loser: "silver", score_leading: "teal" };
    expect(scoreColor(...pair("home", homeAttr), "POST" as GameState, colors)).toBe("gold");
    expect(scoreColor(...pair("away", homeAttr), "POST" as GameState, colors)).toBe("silver");
    expect(scoreColor(...pair("home", homeAttr), "IN" as GameState, colors)).toBe("teal");
  });

  it("returns black for BYE regardless of side", () => {
    expect(scoreColor(...pair("home", homeAttr), "BYE" as GameState)).toBe("black");
    expect(scoreColor(...pair("away", homeAttr), "BYE" as GameState)).toBe("black");
  });
});

describe("colonColor", () => {
  it("is black for active game states", () => {
    expect(colonColor("PRE")).toBe("black");
    expect(colonColor("IN")).toBe("black");
  });

  it("is muted for POST and transparent for unknown", () => {
    expect(colonColor("POST")).toBe("#777");
    expect(colonColor("BYE")).toBe("transparent");
  });
});

describe("scoreText", () => {
  it("returns dash for PRE", () => {
    expect(scoreText(self("home", homeAttr), "PRE" as GameState)).toBe("–");
    expect(scoreText(self("away", homeAttr), "PRE" as GameState)).toBe("–");
  });

  it("returns correct score for home sensor during IN", () => {
    expect(scoreText(self("home", homeAttr), "IN" as GameState)).toBe("95");
    expect(scoreText(self("away", homeAttr), "IN" as GameState)).toBe("90");
  });

  it("returns empty string when score is undefined in IN state", () => {
    const attr: GameAttr = {
      team_homeaway: "home",
      team_score: undefined,
      opponent_score: undefined,
    };
    expect(scoreText(self("home", attr), "IN" as GameState)).toBe("");
    expect(scoreText(self("away", attr), "IN" as GameState)).toBe("");
  });
});

describe("nameText", () => {
  it("returns team name on the tracked side", () => {
    expect(nameText(self("home", homeAttr))).toBe("Lakers");
    expect(nameText(self("away", homeAttr))).toBe("Celtics");
  });

  it("returns raw team name (HTML escaping delegated to Lit template)", () => {
    const attr: GameAttr = { team_homeaway: "home", team_name: "<script>", opponent_name: "Safe" };
    expect(nameText(self("home", attr))).toBe("<script>");
  });

  it("falls back to an empty string when the name is undefined", () => {
    const attr: GameAttr = {
      team_homeaway: "home",
      team_name: undefined,
      opponent_name: undefined,
    };
    expect(nameText(self("home", attr))).toBe("");
    expect(nameText(self("away", attr))).toBe("");
  });

  it("honors the format argument on both sides and falls back to name", () => {
    const attr = {
      ...homeAttr,
      team_long_name: "Los Angeles Lakers",
      opponent_long_name: "Boston Celtics",
      team_abbr: "LAL",
      opponent_abbr: "BOS",
    } as GameAttr;
    expect(nameText(self("home", attr), "name")).toBe("Lakers");
    expect(nameText(self("home", attr), "long_name")).toBe("Los Angeles Lakers");
    expect(nameText(self("away", attr), "long_name")).toBe("Boston Celtics");
    expect(nameText(self("home", attr), "abbr")).toBe("LAL");
    expect(nameText(self("away", attr), "abbr")).toBe("BOS");
    const blank = { ...attr, team_long_name: "  " } as GameAttr;
    expect(nameText(self("home", blank), "long_name")).toBe("Lakers");
    const sparse = { ...attr, team_long_name: "", opponent_abbr: undefined } as GameAttr;
    expect(nameText(self("home", sparse), "long_name")).toBe("Lakers");
    expect(nameText(self("away", sparse), "abbr")).toBe("Celtics");
  });
});

describe("rankText", () => {
  it("returns correct record for each side", () => {
    expect(rankText(self("home", homeAttr))).toBe("20-10");
    expect(rankText(self("away", homeAttr))).toBe("18-12");
  });

  it("falls back to an empty string when the record is undefined", () => {
    const attr: GameAttr = {
      team_homeaway: "home",
      team_record: undefined,
      opponent_record: undefined,
    };
    expect(rankText(self("home", attr))).toBe("");
    expect(rankText(self("away", attr))).toBe("");
  });
});
