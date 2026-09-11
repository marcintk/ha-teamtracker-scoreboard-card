import { describe, expect, it } from "vitest";
import { rowHtml, sectionHtml } from "../src/render.js";
import type { GameAttr, SectionConfig } from "../src/types.js";
import { doc } from "./helpers.js";

const makeState = (state: string, attrs: GameAttr) => ({ state, attributes: attrs });

const baseAttrs: GameAttr = {
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
  season: "regular",
};

describe("rowHtml", () => {
  it("renders a game-row div", () => {
    const el = doc(rowHtml(makeState("PRE", baseAttrs), false));
    expect(el.querySelector(".game-row")).not.toBeNull();
  });

  it("renders team names", () => {
    const el = doc(rowHtml(makeState("PRE", baseAttrs), false));
    expect(el.textContent).toContain("Lakers");
    expect(el.textContent).toContain("Celtics");
  });

  it("renders records", () => {
    const el = doc(rowHtml(makeState("PRE", baseAttrs), false));
    expect(el.textContent).toContain("20-10");
    expect(el.textContent).toContain("18-12");
  });

  it("shows dash for scores in PRE state", () => {
    const el = doc(rowHtml(makeState("PRE", baseAttrs), false));
    expect(el.textContent).toContain("–");
  });

  it("shows actual scores in IN state", () => {
    const el = doc(rowHtml(makeState("IN", baseAttrs), false));
    expect(el.textContent).toContain("95");
    expect(el.textContent).toContain("90");
  });

  it("renders colon when game is found", () => {
    const el = doc(rowHtml(makeState("IN", baseAttrs), false));
    expect(el.querySelector(".colon")?.textContent).toBe(":");
  });

  it("renders logo img tag", () => {
    const el = doc(rowHtml(makeState("PRE", baseAttrs), false));
    expect(el.querySelector("img")).not.toBeNull();
    expect(el.querySelector("img")?.getAttribute("src")).toBe("https://cdn.example.com/lal.png");
  });

  it("renders gracefully when stateObj is null", () => {
    const el = doc(rowHtml(null, false));
    expect(el.querySelector(".game-row")).not.toBeNull();
    expect(el.querySelector("img")).toBeNull();
  });

  it("bolds the tracked team by default (standings)", () => {
    const el = doc(rowHtml(makeState("PRE", baseAttrs), false));
    const [home, away] = el.querySelectorAll<HTMLElement>(".team-name");
    expect(home?.style.fontWeight).toBe("bold");
    expect(away?.style.fontWeight).toBe("normal");
    expect(home?.style.color).toContain("--ttsc-team-color");
  });

  it("schedule flag drops the tracked-team highlight — both names normal + opponent color", () => {
    const el = doc(rowHtml(makeState("PRE", baseAttrs), false, {}, false, false, undefined, true));
    const [home, away] = el.querySelectorAll<HTMLElement>(".team-name");
    expect(home?.style.fontWeight).toBe("normal");
    expect(away?.style.fontWeight).toBe("normal");
    expect(home?.style.color).toContain("--ttsc-opponent-color");
    expect(away?.style.color).toContain("--ttsc-opponent-color");
  });

  it("schedule flag keeps the special-team blue", () => {
    const el = doc(rowHtml(makeState("PRE", baseAttrs), true, {}, false, false, undefined, true));
    const [home] = el.querySelectorAll<HTMLElement>(".team-name");
    expect(home?.style.color).toContain("--ttsc-special-color");
    expect(home?.style.fontWeight).toBe("normal");
  });
});

describe("sectionHtml", () => {
  const section: SectionConfig = {
    name: "NBA",
    prefix: "sensor.nba_",
    limit: 10,
    special_teams: [],
    rank_type: "win-loss",
    view: "standings",
  };

  it("returns empty when no matching entities", () => {
    expect(doc(sectionHtml(section, {})).querySelector(".section-header")).toBeNull();
  });

  it("returns empty when entities are in invalid states", () => {
    const states = { "sensor.nba_lal": makeState("UNKNOWN", baseAttrs) };
    expect(doc(sectionHtml(section, states)).querySelector(".section-header")).toBeNull();
  });

  it("returns empty when limit produces no rows", () => {
    const states = { "sensor.nba_lal": makeState("PRE", baseAttrs) };
    expect(
      doc(sectionHtml({ ...section, limit: 0 }, states)).querySelector(".section-header")
    ).toBeNull();
  });

  it("renders section header with name", () => {
    const states = { "sensor.nba_lal": makeState("PRE", baseAttrs) };
    const el = doc(sectionHtml(section, states));
    expect(el.querySelector(".section-header")).not.toBeNull();
    expect(el.querySelector(".section-title")?.textContent).toBe("NBA");
  });

  it("renders a row for each matching entity", () => {
    const states = {
      "sensor.nba_lal": makeState("PRE", baseAttrs),
      "sensor.nba_gsw": makeState("IN", { ...baseAttrs, team_name: "Warriors" }),
    };
    const el = doc(sectionHtml(section, states));
    expect(el.textContent).toContain("Lakers");
    expect(el.textContent).toContain("Warriors");
  });

  it("respects the limit", () => {
    const states = Object.fromEntries(
      Array.from({ length: 5 }, (_, i) => [
        `sensor.nba_team${i}`,
        makeState("PRE", { ...baseAttrs, team_name: `Team${i}`, team_record: `${i}-10` }),
      ])
    );
    const el = doc(sectionHtml({ ...section, limit: 2 }, states));
    expect(el.querySelectorAll(".game-row").length).toBe(2);
  });

  it("does not inject raw HTML in section name", () => {
    const states = { "sensor.nba_lal": makeState("PRE", baseAttrs) };
    const el = doc(sectionHtml({ ...section, name: "<b>NBA</b>" }, states));
    expect(el.querySelector(".section-header b")).toBeNull();
    expect(el.querySelector(".section-title")?.textContent).toBe("<b>NBA</b>");
  });

  it("marks special teams correctly using default CSS var color", () => {
    const states = { "sensor.nba_lal": makeState("PRE", baseAttrs) };
    const el = doc(sectionHtml({ ...section, special_teams: ["lal"] }, states));
    expect(el.innerHTML).toContain("ttsc-special-color");
  });

  it("applies config colors to special teams", () => {
    const states = { "sensor.nba_lal": makeState("PRE", baseAttrs) };
    const el = doc(
      sectionHtml({ ...section, special_teams: ["lal"] }, states, Object.keys(states), {
        special: "gold",
      })
    );
    expect(el.innerHTML).toContain("gold");
    expect(el.innerHTML).not.toContain("ttsc-special-color");
  });

  it("accepts pre-filtered entity IDs without colors", () => {
    const states = { "sensor.nba_lal": makeState("PRE", baseAttrs) };
    const el = doc(sectionHtml(section, states, Object.keys(states)));
    expect(el.querySelector(".game-row")).not.toBeNull();
  });

  it("accepts pre-filtered entity IDs and still applies colors", () => {
    const states = { "sensor.nba_lal": makeState("PRE", baseAttrs) };
    const el = doc(
      sectionHtml({ ...section, special_teams: ["lal"] }, states, Object.keys(states), {
        special: "gold",
      })
    );
    expect(el.innerHTML).toContain("gold");
    expect(el.innerHTML).not.toContain("ttsc-special-color");
  });

  it("applies config colors to team and opponent", () => {
    const states = { "sensor.nba_lal": makeState("PRE", baseAttrs) };
    const el = doc(
      sectionHtml(section, states, Object.keys(states), { team: "cyan", opponent: "dimgray" })
    );
    expect(el.innerHTML).toContain("cyan");
    expect(el.innerHTML).toContain("dimgray");
  });

  it("schedule view renders both team names normal-weight in the opponent color", () => {
    const states = { "sensor.nba_lal": makeState("PRE", baseAttrs) };
    const el = doc(
      sectionHtml({ ...section, view: "schedule" }, states, Object.keys(states), {
        team: "cyan",
        opponent: "dimgray",
      })
    );
    const names = [...el.querySelectorAll<HTMLElement>(".team-name")];
    expect(names).toHaveLength(2);
    for (const n of names) {
      expect(n.style.fontWeight).toBe("normal");
      expect(n.style.color).toBe("dimgray");
    }
    expect(el.innerHTML).not.toContain("cyan");
  });

  it("sorts upcoming games by soonest kick-off first", () => {
    const soon = new Date(Date.now() + 2 * 3600_000).toISOString();
    const later = new Date(Date.now() + 5 * 3600_000).toISOString();
    const states = {
      "sensor.wc_bra": makeState("PRE", { ...baseAttrs, date: later, team_name: "Brazil" }),
      "sensor.wc_fra": makeState("PRE", { ...baseAttrs, date: soon, team_name: "France" }),
    };
    const wcSection: SectionConfig = {
      name: "WC",
      prefix: "sensor.wc_",
      limit: 10,
      special_teams: [],
      rank_type: "by-date",
    };
    const text = doc(sectionHtml(wcSection, states)).textContent ?? "";
    expect(text.indexOf("France")).toBeLessThan(text.indexOf("Brazil"));
  });

  it("defaults a section with no `view` to the schedule (no position numbers)", () => {
    // baseAttrs carries a record, so the old `auto` default would have ranked it
    const states = {
      "sensor.nba_lal": makeState("PRE", { ...baseAttrs, date: "2024-04-20T00:00:00Z" }),
    };
    const s: SectionConfig = { name: "NBA", prefix: "sensor.nba_", limit: 10, special_teams: [] };
    const el = doc(sectionHtml(s, states));
    expect(el.querySelector(".team-pos")).toBeNull();
  });

  const H = 3600_000;
  const iso = (ms: number) => new Date(Date.now() + ms).toISOString();

  it("schedule puts live games above everything else", () => {
    const states = {
      "sensor.nba_fin": makeState("POST", { ...baseAttrs, team_name: "Finished", date: iso(-H) }),
      "sensor.nba_soon": makeState("PRE", { ...baseAttrs, team_name: "Upcoming", date: iso(H) }),
      // Live is the furthest from now by date, yet still first — it's its own group
      "sensor.nba_live": makeState("IN", { ...baseAttrs, team_name: "Live", date: iso(-5 * H) }),
    };
    const s: SectionConfig = { name: "NBA", prefix: "sensor.nba_", limit: 10, special_teams: [] };
    const text = doc(sectionHtml(s, states)).textContent ?? "";
    expect(text.indexOf("Live")).toBeLessThan(text.indexOf("Finished"));
    expect(text.indexOf("Live")).toBeLessThan(text.indexOf("Upcoming"));
  });

  it("interleaves PRE and POST by distance from now", () => {
    const states = {
      "sensor.nba_recent": makeState("POST", { ...baseAttrs, team_name: "Recent", date: iso(-H) }),
      "sensor.nba_soon": makeState("PRE", { ...baseAttrs, team_name: "Soon", date: iso(3 * H) }),
      "sensor.nba_far": makeState("PRE", { ...baseAttrs, team_name: "Far", date: iso(20 * H) }),
      "sensor.nba_old": makeState("POST", { ...baseAttrs, team_name: "Old", date: iso(-40 * H) }),
    };
    const s: SectionConfig = { name: "NBA", prefix: "sensor.nba_", limit: 10, special_teams: [] };
    const text = doc(sectionHtml(s, states)).textContent ?? "";
    // |Δ from now|: Recent 1h, Soon 3h, Far 20h, Old 40h — a POST outranks a PRE here
    expect(text.indexOf("Recent")).toBeLessThan(text.indexOf("Soon"));
    expect(text.indexOf("Soon")).toBeLessThan(text.indexOf("Far"));
    expect(text.indexOf("Far")).toBeLessThan(text.indexOf("Old"));
  });

  it("produces stable order when two teams have the same win ratio", () => {
    const states = {
      "sensor.nba_zzz": makeState("PRE", { ...baseAttrs, team_name: "ZZZ", team_record: "5-5" }),
      "sensor.nba_aaa": makeState("PRE", { ...baseAttrs, team_name: "AAA", team_record: "5-5" }),
    };
    const el1 = doc(sectionHtml(section, states));
    const el2 = doc(sectionHtml(section, states));
    expect(el1.innerHTML).toBe(el2.innerHTML);
    const text = el1.textContent ?? "";
    expect(text.indexOf("AAA")).toBeLessThan(text.indexOf("ZZZ"));
  });

  it("produces stable order when two by-date games have the same kick-off time", () => {
    const sameTime = "2024-04-20T15:00:00Z";
    const states = {
      "sensor.wc_zzz": makeState("PRE", {
        ...baseAttrs,
        team_name: "ZZZ",
        team_abbr: "zzz",
        opponent_abbr: "yyy",
        date: sameTime,
        season: "postseason",
      }),
      "sensor.wc_aaa": makeState("PRE", {
        ...baseAttrs,
        team_name: "AAA",
        team_abbr: "aaa",
        opponent_abbr: "bbb",
        date: sameTime,
        season: "postseason",
      }),
    };
    const wcSection: SectionConfig = {
      name: "WC",
      prefix: "sensor.wc_",
      limit: 10,
      special_teams: [],
      rank_type: "by-date",
    };
    const el1 = doc(sectionHtml(wcSection, states));
    const el2 = doc(sectionHtml(wcSection, states));
    expect(el1.innerHTML).toBe(el2.innerHTML);
    const text = el1.textContent ?? "";
    expect(text.indexOf("AAA")).toBeLessThan(text.indexOf("ZZZ"));
  });

  it("keeps configured rank_type when first entity has no season attribute yet", () => {
    const states = {
      "sensor.nba_aaa": makeState("PRE", { team_name: "Team A", team_record: "5-25" }),
      "sensor.nba_zzz": makeState("PRE", {
        ...baseAttrs,
        team_name: "Team Z",
        team_record: "25-5",
      }),
    };
    const text =
      doc(sectionHtml({ ...section, rank_type: "win-loss" as const }, states)).textContent ?? "";
    expect(text.indexOf("Team Z")).toBeLessThan(text.indexOf("Team A"));
  });

  it("falls back to entityId as teamName when team_name attribute is absent", () => {
    const states = {
      "sensor.nba_lal": makeState("PRE", { ...baseAttrs, team_name: undefined }),
    };
    expect(() => doc(sectionHtml(section, states))).not.toThrow();
    expect(doc(sectionHtml(section, states)).querySelector(".game-row")).not.toBeNull();
  });

  it("uses entityId as final tie-breaker when team names and sort keys are equal", () => {
    const states = {
      "sensor.nba_zzz": makeState("PRE", {
        ...baseAttrs,
        team_name: "Lakers",
        team_record: "10-10",
        opponent_name: "Opp-Z",
      }),
      "sensor.nba_aaa": makeState("PRE", {
        ...baseAttrs,
        team_name: "Lakers",
        team_record: "10-10",
        opponent_name: "Opp-A",
      }),
    };
    const text = doc(sectionHtml(section, states)).textContent ?? "";
    expect(text.indexOf("Opp-A")).toBeLessThan(text.indexOf("Opp-Z"));
  });

  it("preserves special-team highlight when special team plays away against a tracked home opponent", () => {
    const date = "2024-04-20T00:00:00Z";
    const states = {
      "sensor.nba_lal": makeState("PRE", {
        ...baseAttrs,
        team_homeaway: "away" as const,
        team_abbr: "LAL",
        opponent_abbr: "BOS",
        date,
      }),
      "sensor.nba_bos": makeState("PRE", {
        ...baseAttrs,
        team_homeaway: "home" as const,
        team_name: "Celtics",
        team_abbr: "BOS",
        opponent_abbr: "LAL",
        date,
      }),
    };
    const el = doc(sectionHtml({ ...section, special_teams: ["lal"], view: "schedule" }, states));
    expect(el.innerHTML).toContain("ttsc-special-color");
    // schedule view drops the tracked-team bold/colour, but the special team stays blue
    expect(el.innerHTML).not.toContain("font-weight:bold");
  });

  it("preserves the special-team highlight in standings view (bold tracked team)", () => {
    const states = {
      "sensor.nba_lal": makeState("PRE", { ...baseAttrs, team_abbr: "LAL" }),
    };
    const el = doc(sectionHtml({ ...section, special_teams: ["lal"] }, states));
    expect(el.innerHTML).toContain("ttsc-special-color");
    expect(el.innerHTML).toContain("font-weight:bold");
  });

  it("auto-switches to the date-sorted list when a tracked team has no record", () => {
    const states = {
      "sensor.nba_lal": makeState("PRE", {
        ...baseAttrs,
        team_record: undefined,
        date: "2024-04-20T00:00:00Z",
      }),
    };
    expect(() => doc(sectionHtml(section, states))).not.toThrow();
  });

  it("skips entity IDs that are no longer present in states", () => {
    const states = { "sensor.nba_lal": makeState("PRE", baseAttrs) };
    const el = doc(sectionHtml(section, states, ["sensor.stale_id", "sensor.nba_lal"]));
    expect(el.querySelector(".game-row")).not.toBeNull();
  });
});

describe("standings position column", () => {
  const section: SectionConfig = {
    name: "NBA",
    prefix: "sensor.nba_",
    limit: 10,
    special_teams: [],
    rank_type: "win-loss",
    view: "standings",
    show_position: true,
  };

  const threeTeams = () => ({
    "sensor.nba_aaa": makeState("PRE", {
      ...baseAttrs,
      team_name: "Alphas",
      team_record: "30-5",
    }),
    "sensor.nba_bbb": makeState("PRE", {
      ...baseAttrs,
      team_name: "Betas",
      team_record: "20-15",
    }),
    "sensor.nba_ccc": makeState("PRE", {
      ...baseAttrs,
      team_name: "Gammas",
      team_record: "10-25",
    }),
  });

  it("numbers rows in standings order", () => {
    const el = doc(sectionHtml(section, threeTeams()));
    const positions = [...el.querySelectorAll(".game-row .team-pos")].map((n) =>
      (n.textContent ?? "").trim()
    );
    expect(positions).toEqual(["1", "2", "3"]);
    const firstRow = el.querySelectorAll(".game-row")[0];
    expect(firstRow?.textContent).toContain("Alphas");
  });

  it("renders .team-pos as the first child of .game-row", () => {
    const el = doc(sectionHtml(section, threeTeams()));
    const firstRow = el.querySelector(".game-row");
    expect(firstRow?.firstElementChild?.classList.contains("team-pos")).toBe(true);
  });

  it("omits .team-pos cells entirely when show_position is false", () => {
    const el = doc(sectionHtml({ ...section, show_position: false }, threeTeams()));
    expect(el.querySelectorAll(".game-row .team-pos").length).toBe(0);
  });

  it("renders empty .team-pos cells in schedule (by-date) view", () => {
    const el = doc(sectionHtml({ ...section, view: "schedule" }, threeTeams()));
    const cells = [...el.querySelectorAll(".game-row .team-pos")];
    expect(cells.length).toBe(3);
    for (const cell of cells) {
      expect((cell.textContent ?? "").trim()).toBe("");
    }
  });

  it("colours the position number like a special team", () => {
    const el = doc(sectionHtml({ ...section, special_teams: ["aaa"] }, threeTeams()));
    const firstRow = el.querySelector(".game-row");
    const posCell = firstRow?.querySelector(".team-pos");
    expect(posCell?.getAttribute("style") ?? "").toContain("ttsc-special-color");
  });

  it("rowHtml omits .team-pos when position is undefined", () => {
    const el = doc(rowHtml(makeState("PRE", baseAttrs), false));
    expect(el.querySelector(".team-pos")).toBeNull();
  });

  it("rowHtml renders an empty .team-pos cell when position is null", () => {
    const el = doc(rowHtml(makeState("PRE", baseAttrs), false, {}, false, false, null));
    const cell = el.querySelector(".team-pos");
    expect(cell).not.toBeNull();
    expect((cell?.textContent ?? "").trim()).toBe("");
  });

  it("rowHtml renders the position number when given", () => {
    const el = doc(rowHtml(makeState("PRE", baseAttrs), false, {}, false, false, 4));
    const cell = el.querySelector(".team-pos");
    expect((cell?.textContent ?? "").trim()).toBe("4");
  });
});

describe("rowHtml score-fresh class", () => {
  it("adds score-fresh to score and colon elements when isFresh is true", () => {
    const el = doc(rowHtml(makeState("IN", baseAttrs), false, {}, false, true));
    expect(el.querySelectorAll(".score-fresh").length).toBe(3);
  });

  it("does not add score-fresh by default", () => {
    const el = doc(rowHtml(makeState("IN", baseAttrs), false));
    expect(el.querySelector(".score-fresh")).toBeNull();
  });
});

describe("sectionHtml scoreChangedAt", () => {
  const section = {
    name: "NBA",
    prefix: "sensor.nba_",
    limit: 10,
    special_teams: [] as string[],
    rank_type: "win-loss" as const,
    view: "standings" as const,
  };

  it("marks entity as fresh when scoreChangedAt is recent", () => {
    const states = { "sensor.nba_lal": makeState("IN", baseAttrs) };
    const scoreChangedAt = new Map([["sensor.nba_lal", Date.now()]]);
    const el = doc(sectionHtml(section, states, Object.keys(states), {}, scoreChangedAt));
    expect(el.querySelector(".score-fresh")).not.toBeNull();
  });

  it("does not mark as fresh when scoreChangedAt is past the blink window", () => {
    const states = { "sensor.nba_lal": makeState("IN", baseAttrs) };
    const scoreChangedAt = new Map([["sensor.nba_lal", Date.now() - 10_000]]);
    const el = doc(
      sectionHtml({ ...section, score_blink: 5 }, states, Object.keys(states), {}, scoreChangedAt)
    );
    expect(el.querySelector(".score-fresh")).toBeNull();
  });

  it("does not mark as fresh when score_blink is 0", () => {
    const states = { "sensor.nba_lal": makeState("IN", baseAttrs) };
    const scoreChangedAt = new Map([["sensor.nba_lal", Date.now()]]);
    const el = doc(
      sectionHtml({ ...section, score_blink: 0 }, states, Object.keys(states), {}, scoreChangedAt)
    );
    expect(el.querySelector(".score-fresh")).toBeNull();
  });
});
