import { describe, expect, it } from "vitest";
import {
  colonColor,
  colorVar,
  isSideAheadOrWinning,
  isSideOutrightWinning,
  isTeamSide,
  nameText,
  rankText,
  scoreBg,
  scoreColor,
  scoreText,
  sideRelation,
  teamColor,
} from "../src/display.js";
import type { GameAttr } from "../src/types.js";

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

describe("isTeamSide", () => {
  it("matches home side when team is home", () => {
    expect(isTeamSide("home", homeAttr)).toBe(true);
    expect(isTeamSide("away", homeAttr)).toBe(false);
  });

  it("matches away side when team is away", () => {
    expect(isTeamSide("away", awayAttr)).toBe(true);
    expect(isTeamSide("home", awayAttr)).toBe(false);
  });

  it("handles missing attr gracefully", () => {
    expect(isTeamSide("home", {})).toBe(false);
    expect(isTeamSide("away", {})).toBe(true);
  });
});

// single source of truth behind both isSideAheadOrWinning (tie counts as "ahead") and
// isSideOutrightWinning (tie counts as "trailing") — see their own doc comments for why
// the two need different tie handling.
describe("sideRelation", () => {
  it("is 'ahead' when the side leads during IN", () => {
    expect(sideRelation("home", "IN", homeAttr)).toBe("ahead");
  });

  it("is 'trailing' when the side is behind during IN", () => {
    expect(sideRelation("away", "IN", homeAttr)).toBe("trailing");
  });

  it("is 'tied' on an exact score tie during IN", () => {
    const tied: GameAttr = { ...homeAttr, team_score: "90", opponent_score: "90" };
    expect(sideRelation("home", "IN", tied)).toBe("tied");
    expect(sideRelation("away", "IN", tied)).toBe("tied");
  });

  it("is 'ahead' or 'trailing' during POST based on the winner flag, never 'tied'", () => {
    expect(sideRelation("home", "POST", homeAttr)).toBe("ahead");
    expect(sideRelation("away", "POST", homeAttr)).toBe("trailing");
    const draw: GameAttr = { ...homeAttr, team_winner: false, opponent_winner: false };
    expect(sideRelation("home", "POST", draw)).toBe("trailing");
  });

  it("backs isSideAheadOrWinning (tie counts as ahead) and isSideOutrightWinning (tie doesn't)", () => {
    const tied: GameAttr = { ...homeAttr, team_score: "90", opponent_score: "90" };
    expect(isSideAheadOrWinning("home", "IN", tied)).toBe(true);
    expect(isSideOutrightWinning("home", "IN", tied)).toBe(false);
  });
});

describe("teamColor", () => {
  it("falls back to the default color during PRE", () => {
    expect(teamColor("home", "PRE", homeAttr)).toBe("var(--ttsc-name-default-color, #777)");
    expect(teamColor("away", "PRE", homeAttr)).toBe("var(--ttsc-name-default-color, #777)");
  });

  it("returns the leading accent colour when the home side is leading during IN", () => {
    // home team scores 95 vs 90 — home is leading
    expect(teamColor("home", "IN", homeAttr)).toBe(
      "var(--ttsc-name-leading-color, var(--primary-text-color))"
    );
  });

  it("returns the default color for the trailing side during IN", () => {
    // away (opponent) trails 90 vs home's 95
    expect(teamColor("away", "IN", homeAttr)).toBe("var(--ttsc-name-default-color, #777)");
  });

  it("returns the winner accent colour for the winning side during POST", () => {
    expect(teamColor("home", "POST", homeAttr)).toBe(
      "var(--ttsc-name-winner-color, var(--primary-text-color))"
    );
  });

  it("returns the default color (not a loser color) for the losing side during POST", () => {
    expect(teamColor("away", "POST", homeAttr)).toBe("var(--ttsc-name-default-color, #777)");
  });

  it("supports the away side leading/winning too", () => {
    expect(teamColor("away", "IN", awayAttr)).toBe(
      "var(--ttsc-name-leading-color, var(--primary-text-color))"
    );
    expect(teamColor("away", "POST", awayAttr)).toBe(
      "var(--ttsc-name-winner-color, var(--primary-text-color))"
    );
  });

  it("leaves both names in the default color on an exact tie during IN (neither side leads)", () => {
    const tied: GameAttr = { ...homeAttr, team_score: "90", opponent_score: "90" };
    expect(teamColor("home", "IN", tied)).toBe("var(--ttsc-name-default-color, #777)");
    expect(teamColor("away", "IN", tied)).toBe("var(--ttsc-name-default-color, #777)");
  });

  it("leaves both names in the default color on a POST draw (neither side wins)", () => {
    const draw: GameAttr = { ...homeAttr, team_winner: false, opponent_winner: false };
    expect(teamColor("home", "POST", draw)).toBe("var(--ttsc-name-default-color, #777)");
    expect(teamColor("away", "POST", draw)).toBe("var(--ttsc-name-default-color, #777)");
  });

  it("treats undefined scores as 0-0 (tied) during IN", () => {
    const noScores = { ...homeAttr, team_score: undefined, opponent_score: undefined };
    expect(teamColor("home", "IN", noScores)).toBe("var(--ttsc-name-default-color, #777)");
    expect(teamColor("away", "IN", noScores)).toBe("var(--ttsc-name-default-color, #777)");
  });

  it("uses config colors when provided, independently for leading (IN) vs winner (POST)", () => {
    const colors = { name_leading: "gold", name_winner: "purple", name_default: "gray" };
    expect(teamColor("home", "PRE", homeAttr, colors)).toBe("gray");
    expect(teamColor("home", "IN", homeAttr, colors)).toBe("gold");
    expect(teamColor("home", "POST", homeAttr, colors)).toBe("purple");
    expect(teamColor("away", "POST", homeAttr, colors)).toBe("gray");
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
    expect(scoreColor("home", "PRE", homeAttr)).toBe("black");
    expect(scoreColor("away", "PRE", homeAttr)).toBe("black");
  });

  it("returns the leading colour for the leading team during IN", () => {
    // home team scores 95 vs 90 — home is leading
    expect(scoreColor("home", "IN", homeAttr)).toBe("var(--ttsc-score-leading-color, brown)");
    expect(scoreColor("away", "IN", homeAttr)).toBe("black");
  });

  it("treats undefined scores as 0 during IN", () => {
    const attr = { ...homeAttr, team_score: undefined, opponent_score: undefined };
    // tied at 0-0: home side ts>=os
    expect(scoreColor("home", "IN", attr)).toBe("var(--ttsc-score-leading-color, brown)");
  });

  it("returns the winner / loser colours in POST", () => {
    expect(scoreColor("home", "POST", homeAttr)).toBe("var(--ttsc-score-winner-color, orange)");
    expect(scoreColor("away", "POST", homeAttr)).toBe("var(--ttsc-score-loser-color, darkgray)");
  });

  it("uses config colors for winner, loser, and leading", () => {
    const colors = { score_winner: "gold", score_loser: "silver", score_leading: "teal" };
    expect(scoreColor("home", "POST", homeAttr, colors)).toBe("gold");
    expect(scoreColor("away", "POST", homeAttr, colors)).toBe("silver");
    expect(scoreColor("home", "IN", homeAttr, colors)).toBe("teal");
  });

  it("returns black for BYE regardless of side", () => {
    expect(scoreColor("home", "BYE", homeAttr)).toBe("black");
    expect(scoreColor("away", "BYE", homeAttr)).toBe("black");
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
    expect(scoreText("home", "PRE", homeAttr)).toBe("–");
    expect(scoreText("away", "PRE", homeAttr)).toBe("–");
  });

  it("returns correct score for home sensor during IN", () => {
    expect(scoreText("home", "IN", homeAttr)).toBe("95");
    expect(scoreText("away", "IN", homeAttr)).toBe("90");
  });

  it("returns empty string when score is undefined in IN state", () => {
    const attr: GameAttr = {
      team_homeaway: "home",
      team_score: undefined,
      opponent_score: undefined,
    };
    expect(scoreText("home", "IN", attr)).toBe("");
    expect(scoreText("away", "IN", attr)).toBe("");
  });
});

describe("nameText", () => {
  it("returns team name on the tracked side", () => {
    expect(nameText("home", homeAttr)).toBe("Lakers");
    expect(nameText("away", homeAttr)).toBe("Celtics");
  });

  it("returns raw team name (HTML escaping delegated to Lit template)", () => {
    const attr: GameAttr = { team_homeaway: "home", team_name: "<script>", opponent_name: "Safe" };
    expect(nameText("home", attr)).toBe("<script>");
  });

  it("falls back to an empty string when the name is undefined", () => {
    const attr: GameAttr = {
      team_homeaway: "home",
      team_name: undefined,
      opponent_name: undefined,
    };
    expect(nameText("home", attr)).toBe("");
    expect(nameText("away", attr)).toBe("");
  });
});

describe("rankText", () => {
  it("returns correct record for each side", () => {
    expect(rankText("home", homeAttr)).toBe("20-10");
    expect(rankText("away", homeAttr)).toBe("18-12");
  });

  it("falls back to an empty string when the record is undefined", () => {
    const attr: GameAttr = {
      team_homeaway: "home",
      team_record: undefined,
      opponent_record: undefined,
    };
    expect(rankText("home", attr)).toBe("");
    expect(rankText("away", attr)).toBe("");
  });
});
