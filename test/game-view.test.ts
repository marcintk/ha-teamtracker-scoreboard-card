import { describe, expect, it } from "vitest";
import { gameView } from "../src/game-view.js";
import { makeState } from "./index.fixtures.js";

const st = (attrs: Record<string, unknown>) => makeState("IN", attrs as never);

describe("gameView", () => {
  it("home sensor: team is home, opponent is away", () => {
    const v = gameView(
      st({
        team_homeaway: "home",
        team_abbr: "LAL",
        opponent_abbr: "BOS",
        team_score: 95,
        opponent_score: 90,
      })
    );
    expect(v.home).toMatchObject({ abbr: "LAL", score: 95, own: true });
    expect(v.away).toMatchObject({ abbr: "BOS", score: 90, own: false });
  });

  it("away sensor: opponent is home, team is away", () => {
    const v = gameView(
      st({
        team_homeaway: "away",
        team_abbr: "BOS",
        opponent_abbr: "LAL",
        team_score: 90,
        opponent_score: 95,
      })
    );
    expect(v.home).toMatchObject({ abbr: "LAL", score: 95, own: false });
    expect(v.away).toMatchObject({ abbr: "BOS", score: 90, own: true });
  });

  it("missing team_homeaway behaves as away", () => {
    const v = gameView(st({ team_abbr: "BOS", opponent_abbr: "LAL" }));
    expect(v.home.abbr).toBe("LAL");
    expect(v.home.own).toBe(false);
    expect(v.away.abbr).toBe("BOS");
    expect(v.away.own).toBe(true);
  });

  it("falls back to team/opponent abbrs", () => {
    const v = gameView(st({ team_homeaway: "home" }));
    expect(v.home.abbr).toBe("team");
    expect(v.away.abbr).toBe("opponent");
  });

  it("passes scores through raw, string or number", () => {
    const v = gameView(
      st({
        team_homeaway: "home",
        team_abbr: "A",
        opponent_abbr: "B",
        team_score: "176/5",
        opponent_score: 0,
      })
    );
    expect(v.home.score).toBe("176/5");
    expect(v.away.score).toBe(0);
  });

  const full = {
    team_name: "Lakers",
    team_long_name: "Los Angeles Lakers",
    team_abbr: "LAL",
    team_record: "20-10",
    team_logo: "https://x/lal.png",
    team_winner: true,
    opponent_name: "Celtics",
    opponent_long_name: "Boston Celtics",
    opponent_abbr: "BOS",
    opponent_record: "18-12",
    opponent_logo: "https://x/bos.png",
    opponent_winner: false,
  };
  const lakers = {
    names: { name: "Lakers", long_name: "Los Angeles Lakers", abbr: "LAL" },
    record: "20-10",
    logo: "https://x/lal.png",
    winner: true,
  };
  const celtics = {
    names: { name: "Celtics", long_name: "Boston Celtics", abbr: "BOS" },
    record: "18-12",
    logo: "https://x/bos.png",
    winner: false,
  };

  it("home sensor: carries names, record, logo, winner per side", () => {
    const v = gameView(st({ ...full, team_homeaway: "home" }));
    expect(v.home).toMatchObject(lakers);
    expect(v.away).toMatchObject(celtics);
  });

  it("away sensor: team fields land on the away side", () => {
    const v = gameView(st({ ...full, team_homeaway: "away" }));
    expect(v.away).toMatchObject(lakers);
    expect(v.home).toMatchObject(celtics);
  });

  it("keeps raw names without fallback when attributes are missing", () => {
    const v = gameView(st({ team_homeaway: "home" }));
    expect(v.home.names).toEqual({ name: undefined, long_name: undefined, abbr: undefined });
    expect(v.home.record).toBeUndefined();
    expect(v.home.logo).toBeUndefined();
    expect(v.home.winner).toBeUndefined();
  });

  it.each([null, undefined])("does not throw for %s entity", (e) => {
    const v = gameView(e);
    expect(v.home).toMatchObject({ abbr: "opponent", score: undefined, own: false });
    expect(v.away).toMatchObject({ abbr: "team", score: undefined, own: true });
    for (const side of [v.home, v.away]) {
      expect(side.names).toEqual({ name: undefined, long_name: undefined, abbr: undefined });
      expect(side.record).toBeUndefined();
      expect(side.logo).toBeUndefined();
      expect(side.winner).toBeUndefined();
    }
  });
});
