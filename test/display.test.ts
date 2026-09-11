import { describe, expect, it } from "vitest";
import {
  colonColor,
  colorVar,
  isTeamSide,
  nameText,
  rankText,
  scoreBg,
  scoreColor,
  scoreText,
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
    expect(colorVar("gold", "--ttsc-winner-color", "orange")).toBe("gold");
  });

  it("falls back to the CSS custom property when no override is given", () => {
    expect(colorVar(undefined, "--ttsc-winner-color", "orange")).toBe(
      "var(--ttsc-winner-color, orange)"
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

describe("teamColor", () => {
  it("returns team color when side matches", () => {
    expect(teamColor("home", homeAttr, false)).toBe(
      "var(--ttsc-team-color, var(--primary-text-color, white))"
    );
  });

  it("returns special color (blue) when side matches and special is true", () => {
    expect(teamColor("home", homeAttr, true)).toBe("var(--ttsc-special-color, #2196F3)");
  });

  it("returns special color when tracked team is away and special is true", () => {
    expect(teamColor("away", awayAttr, true)).toBe("var(--ttsc-special-color, #2196F3)");
  });

  it("returns opponent color when side does not match", () => {
    expect(teamColor("away", homeAttr, false)).toBe("var(--ttsc-opponent-color, #777)");
    expect(teamColor("away", homeAttr, true)).toBe("var(--ttsc-opponent-color, #777)");
  });

  it("returns special color for opponent side when opponentSpecial is true", () => {
    expect(teamColor("away", homeAttr, false, {}, true)).toBe("var(--ttsc-special-color, #2196F3)");
    const colors = { special: "gold", opponent: "gray" };
    expect(teamColor("away", homeAttr, false, colors, true)).toBe("gold");
  });

  it("uses config colors when provided", () => {
    const colors = { team: "cyan", special: "gold", opponent: "gray" };
    expect(teamColor("home", homeAttr, false, colors)).toBe("cyan");
    expect(teamColor("home", homeAttr, true, colors)).toBe("gold");
    expect(teamColor("away", homeAttr, false, colors)).toBe("gray");
  });

  it("flat: tracked team falls back to opponent color (no highlight)", () => {
    expect(teamColor("home", homeAttr, false, {}, false, true)).toBe(
      "var(--ttsc-opponent-color, #777)"
    );
    expect(
      teamColor("home", homeAttr, false, { team: "cyan", opponent: "gray" }, false, true)
    ).toBe("gray");
  });

  it("flat: special team keeps blue", () => {
    expect(teamColor("home", homeAttr, true, {}, false, true)).toBe(
      "var(--ttsc-special-color, #2196F3)"
    );
    expect(teamColor("away", homeAttr, false, {}, true, true)).toBe(
      "var(--ttsc-special-color, #2196F3)"
    );
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
    expect(scoreColor("home", "IN", homeAttr)).toBe("var(--ttsc-leading-color, brown)");
    expect(scoreColor("away", "IN", homeAttr)).toBe("black");
  });

  it("treats undefined scores as 0 during IN", () => {
    const attr = { ...homeAttr, team_score: undefined, opponent_score: undefined };
    // tied at 0-0: home side ts>=os
    expect(scoreColor("home", "IN", attr)).toBe("var(--ttsc-leading-color, brown)");
  });

  it("returns the winner / loser colours in POST", () => {
    expect(scoreColor("home", "POST", homeAttr)).toBe("var(--ttsc-winner-color, orange)");
    expect(scoreColor("away", "POST", homeAttr)).toBe("var(--ttsc-loser-color, darkgray)");
  });

  it("uses config colors for winner, loser, and leading", () => {
    const colors = { winner: "gold", loser: "silver", leading: "teal" };
    expect(scoreColor("home", "POST", homeAttr, colors)).toBe("gold");
    expect(scoreColor("away", "POST", homeAttr, colors)).toBe("silver");
    expect(scoreColor("home", "IN", homeAttr, colors)).toBe("teal");
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
});

describe("rankText", () => {
  it("returns correct record for each side", () => {
    expect(rankText("home", homeAttr)).toBe("20-10");
    expect(rankText("away", homeAttr)).toBe("18-12");
  });
});
