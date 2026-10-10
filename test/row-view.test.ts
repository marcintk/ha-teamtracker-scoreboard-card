import { describe, expect, it } from "vitest";
import { colorVar, scoreBg, scoreColor, teamColor } from "../src/display.js";
import { gameView } from "../src/game-view.js";
import { buildRowView } from "../src/row-view.js";
import type { GameAttr } from "../src/types.js";
import { baseAttrs, makeState } from "./index.fixtures.js";

const DEFAULT_NAME = "var(--ttsc-name-default-color, #777)";
const none = {};
const sidesOf = (attr: GameAttr, self: "home" | "away" = "home") => {
  const v = gameView({ state: "IN", attributes: attr });
  return self === "home" ? ([v.home, v.away] as const) : ([v.away, v.home] as const);
};
const mk = (homeaway?: "home" | "away"): GameAttr => ({
  team_homeaway: homeaway,
  team_score: "10",
  opponent_score: "20",
});
const inGame = makeState("IN", baseAttrs);

describe("buildRowView", () => {
  it("IN game with home leading: leader colour on home, default gray on away", () => {
    const v = buildRowView(inGame, false);
    expect(v.state).toBe("IN");
    expect(v.home).toMatchObject({ name: "Lakers", rank: "20-10", score: "95", liveScore: "95" });
    expect(v.away).toMatchObject({ name: "Celtics", rank: "18-12", score: "90", liveScore: "90" });
    expect(v.home.nameColor).toBe(teamColor(...sidesOf(baseAttrs), "IN", none));
    expect(v.home.nameColor).not.toBe(v.away.nameColor);
    expect(v.away.nameColor).toBe(colorVar(undefined, "--ttsc-name-default-color", "#777"));
    expect(v.away.nameColor).toBe(DEFAULT_NAME);
    expect(v.home.scoreColor).toBe(scoreColor(...sidesOf(baseAttrs), "IN", none));
    expect(v.bg).toBe(scoreBg("IN"));
  });

  it("held score: displays held value, keys on live value, colours follow held", () => {
    const v = buildRowView(inGame, false, {}, { heldHome: 80, freshHome: true });
    const heldAttr = { ...baseAttrs, team_score: 80 };
    expect(v.home.score).toBe("80");
    expect(v.home.liveScore).toBe("95");
    expect(v.home.fresh).toBe(true);
    expect(v.away.fresh).toBe(false);
    // held 80 < 90: away leads in the displayed state
    expect(v.away.nameColor).toBe(teamColor(...sidesOf(heldAttr, "away"), "IN", none));
    expect(v.home.nameColor).toBe(DEFAULT_NAME);
    expect(v.home.scoreColor).toBe(scoreColor(...sidesOf(heldAttr), "IN", none));
    expect(v.away.scoreColor).toBe(scoreColor(...sidesOf(heldAttr, "away"), "IN", none));
  });

  it("special colours the entity's own side, opponentSpecial the other, regardless of leading", () => {
    const special = "var(--ttsc-name-special-color, #2196F3)";
    const own = buildRowView(makeState("IN", { ...baseAttrs, team_score: "70" }), true);
    expect(own.home.nameColor).toBe(special);
    expect(own.away.nameColor).toBe(
      teamColor(...sidesOf({ ...baseAttrs, team_score: "70" }, "away"), "IN")
    );
    const opp = buildRowView(inGame, false, {}, { opponentSpecial: true });
    expect(opp.away.nameColor).toBe(special);
    expect(opp.home.nameColor).toBe(teamColor(...sidesOf(baseAttrs), "IN"));
    const both = buildRowView(inGame, true, {}, { opponentSpecial: true });
    expect(both.home.nameColor).toBe(special);
    expect(both.away.nameColor).toBe(special);
  });

  it("highlightWinner false gives default names; PRE shows dash and PRE bg", () => {
    const v = buildRowView(inGame, false, {}, { highlightWinner: false });
    expect(v.home.nameColor).toBe(DEFAULT_NAME);
    expect(v.away.nameColor).toBe(DEFAULT_NAME);
    const pre = buildRowView(makeState("PRE", baseAttrs), false);
    expect(pre.home.score).toBe("–");
    expect(pre.away.score).toBe("–");
    expect(pre.bg).toBe(scoreBg("PRE"));
  });

  // moved from row-display.test.ts: held scores are overlaid per visual side
  describe("held score overlay", () => {
    it("nothing held: live values shown and kept", () => {
      const v = buildRowView(makeState("IN", mk("home")), false);
      expect(v.home).toMatchObject({ score: "10", liveScore: "10" });
      expect(v.away).toMatchObject({ score: "20", liveScore: "20" });
    });

    it("heldHome with team=home replaces the team score", () => {
      const v = buildRowView(makeState("IN", mk("home")), false, {}, { heldHome: 3 });
      expect(v.home.score).toBe("3");
      expect(v.away.score).toBe("20");
    });

    it("heldHome with team=away replaces the opponent score", () => {
      const v = buildRowView(makeState("IN", mk("away")), false, {}, { heldHome: 3 });
      expect(v.home.score).toBe("3");
      expect(v.away.score).toBe("10");
    });

    it("both sides held", () => {
      const v = buildRowView(makeState("IN", mk("home")), false, {}, { heldHome: 1, heldAway: 2 });
      expect(v.home.score).toBe("1");
      expect(v.away.score).toBe("2");
    });

    it("missing team_homeaway behaves as away", () => {
      const v = buildRowView(
        makeState("IN", mk(undefined)),
        false,
        {},
        { heldHome: 1, heldAway: 2 }
      );
      expect(v.home).toMatchObject({ score: "1", liveScore: "20" });
      expect(v.away).toMatchObject({ score: "2", liveScore: "10" });
    });

    it("liveScore stays raw and the input entity is not mutated", () => {
      const e = makeState("IN", mk("away"));
      const v = buildRowView(e, false, {}, { heldHome: 7, heldAway: 8 });
      expect(v.home.liveScore).toBe("20");
      expect(v.away.liveScore).toBe("10");
      expect(e.attributes).toEqual(mk("away"));
      expect(v.attr).toEqual(mk("away"));
    });

    it("held score follows the leader colour", () => {
      // live: away leads 20-10; holding home at 30 makes home the displayed leader
      const v = buildRowView(makeState("IN", mk("home")), false, {}, { heldHome: 30 });
      expect(v.home.scoreColor).toBe("var(--ttsc-score-leading-color, brown)");
      expect(v.away.scoreColor).toBe("black");
    });

    it("exposes the overlaid sides as homeSide/awaySide", () => {
      const v = buildRowView(makeState("IN", mk("away")), false, {}, { heldHome: 3 });
      expect(v.homeSide).toMatchObject({ score: 3, own: false });
      expect(v.awaySide).toMatchObject({ score: "10", own: true });
    });

    it("special/opponentSpecial land on the correct visual side for an away sensor", () => {
      const sp = "var(--ttsc-name-special-color, #2196F3)";
      const own = buildRowView(makeState("IN", mk("away")), true);
      expect(own.away.nameColor).toBe(sp);
      expect(own.home.nameColor).not.toBe(sp);
      const opp = buildRowView(makeState("IN", mk("away")), false, {}, { opponentSpecial: true });
      expect(opp.home.nameColor).toBe(sp);
      expect(opp.away.nameColor).not.toBe(sp);
    });
  });
});
