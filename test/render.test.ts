import { html } from "lit";
import { describe, expect, it } from "vitest";
import { gameKeyFor } from "../src/game-key.js";
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

  it("drops the tracked-team highlight — both names normal + opponent color", () => {
    const el = doc(rowHtml(makeState("PRE", baseAttrs), false));
    const [home, away] = el.querySelectorAll<HTMLElement>(".team-name");
    expect(home?.style.fontWeight).toBe("normal");
    expect(away?.style.fontWeight).toBe("normal");
    expect(home?.style.color).toContain("--ttsc-name-default-color");
    expect(away?.style.color).toContain("--ttsc-name-default-color");
  });

  it("colors a special team's name blue", () => {
    const el = doc(rowHtml(makeState("PRE", baseAttrs), true));
    const [home] = el.querySelectorAll<HTMLElement>(".team-name");
    expect(home?.style.color).toContain("--ttsc-name-special-color");
    expect(home?.style.fontWeight).toBe("normal");
  });

  it("keeps a special team's name blue and bold when it is also leading during IN", () => {
    const el = doc(rowHtml(makeState("IN", baseAttrs), true));
    const [home] = el.querySelectorAll<HTMLElement>(".team-name");
    expect(home?.style.color).toContain("--ttsc-name-special-color");
    expect(home?.style.fontWeight).toBe("bold");
  });

  it("colors and bolds the leading name by default (highlightWinner defaults to true)", () => {
    // home leads 95 vs 90
    const el = doc(rowHtml(makeState("IN", baseAttrs), false));
    const [home, away] = el.querySelectorAll<HTMLElement>(".team-name");
    expect(home?.style.color).toContain("--ttsc-name-leading-color");
    expect(home?.style.fontWeight).toBe("bold");
    expect(away?.style.color).toContain("--ttsc-name-default-color");
    expect(away?.style.fontWeight).toBe("normal");
  });

  it("does not color or bold the leading name when highlightWinner is explicitly off", () => {
    const el = doc(rowHtml(makeState("IN", baseAttrs), false, {}, { highlightWinner: false }));
    const [home, away] = el.querySelectorAll<HTMLElement>(".team-name");
    expect(home?.style.color).toContain("--ttsc-name-default-color");
    expect(home?.style.fontWeight).toBe("normal");
    expect(away?.style.color).toContain("--ttsc-name-default-color");
    expect(away?.style.fontWeight).toBe("normal");
  });

  it("colors and bolds the winning name during POST by default", () => {
    const el = doc(rowHtml(makeState("POST", baseAttrs), false));
    const [home, away] = el.querySelectorAll<HTMLElement>(".team-name");
    expect(home?.style.color).toContain("--ttsc-name-winner-color");
    expect(home?.style.fontWeight).toBe("bold");
    expect(away?.style.color).toContain("--ttsc-name-default-color");
    expect(away?.style.fontWeight).toBe("normal");
  });

  it("colors and bolds the away name when the away side leads/wins", () => {
    const awayAttrs: GameAttr = { ...baseAttrs, team_homeaway: "away" as const };
    const el = doc(rowHtml(makeState("IN", awayAttrs), false));
    const [home, away] = el.querySelectorAll<HTMLElement>(".team-name");
    expect(away?.style.color).toContain("--ttsc-name-leading-color");
    expect(away?.style.fontWeight).toBe("bold");
    expect(home?.style.color).toContain("--ttsc-name-default-color");
    expect(home?.style.fontWeight).toBe("normal");
  });

  it("never bolds or colors the record, even when highlightWinner is on", () => {
    const el = doc(rowHtml(makeState("IN", baseAttrs), false));
    const [homeRank, awayRank] = el.querySelectorAll<HTMLElement>(".team-rank");
    expect(homeRank?.style.color).toContain("--ttsc-name-default-color");
    expect(awayRank?.style.color).toContain("--ttsc-name-default-color");
  });

  it("does not highlight either name on a POST draw", () => {
    const draw: GameAttr = { ...baseAttrs, team_winner: false, opponent_winner: false };
    const el = doc(rowHtml(makeState("POST", draw), false));
    const [home, away] = el.querySelectorAll<HTMLElement>(".team-name");
    expect(home?.style.color).toContain("--ttsc-name-default-color");
    expect(home?.style.fontWeight).toBe("normal");
    expect(away?.style.color).toContain("--ttsc-name-default-color");
    expect(away?.style.fontWeight).toBe("normal");
  });

  it("does not highlight either name on an exact tie during IN", () => {
    const tied: GameAttr = { ...baseAttrs, team_score: "90", opponent_score: "90" };
    const el = doc(rowHtml(makeState("IN", tied), false));
    const [home, away] = el.querySelectorAll<HTMLElement>(".team-name");
    expect(home?.style.color).toContain("--ttsc-name-default-color");
    expect(home?.style.fontWeight).toBe("normal");
    expect(away?.style.color).toContain("--ttsc-name-default-color");
    expect(away?.style.fontWeight).toBe("normal");
  });
});

describe("sectionHtml", () => {
  const section: SectionConfig = {
    name: "NBA",
    prefix: "sensor.nba_",
    limit: 10,
    special_teams: [],
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

  it("marks special teams with the special color", () => {
    const states = { "sensor.nba_lal": makeState("PRE", baseAttrs) };
    const el = doc(sectionHtml({ ...section, special_teams: ["lal"] }, states));
    expect(el.innerHTML).toContain("ttsc-name-special-color");
  });

  it("matches special_teams by full entity ID when the section also has entities", () => {
    const states = { "sensor.nba_lal": makeState("PRE", baseAttrs) };
    const el = doc(
      sectionHtml(
        { ...section, entities: ["sensor.nba_lal"], special_teams: ["sensor.nba_lal"] },
        states
      )
    );
    expect(el.innerHTML).toContain("ttsc-name-special-color");
  });

  it("resolves only the listed entities when prefix is absent", () => {
    const states = {
      "sensor.nba_lal": makeState("PRE", baseAttrs),
      "sensor.custom_renamed_bos": makeState("PRE", { ...baseAttrs, team_name: "Celtics" }),
    };
    const el = doc(
      sectionHtml(
        { name: "Custom", special_teams: [], entities: ["sensor.custom_renamed_bos"] },
        states
      )
    );
    expect(el.textContent).not.toContain("Lakers");
    expect(el.textContent).toContain("Celtics");
  });

  it("unions prefix matches with explicit entities when both are set", () => {
    const states = {
      "sensor.nba_lal": makeState("PRE", baseAttrs),
      "sensor.nba_gsw": makeState("PRE", { ...baseAttrs, team_name: "Warriors" }),
      "sensor.custom_renamed_bos": makeState("PRE", { ...baseAttrs, team_name: "Celtics" }),
    };
    const el = doc(sectionHtml({ ...section, entities: ["sensor.custom_renamed_bos"] }, states));
    expect(el.textContent).toContain("Lakers");
    expect(el.textContent).toContain("Warriors");
    expect(el.textContent).toContain("Celtics");
  });

  it("matches all entities when the section has neither prefix nor entities", () => {
    const states = { "sensor.nba_lal": makeState("PRE", baseAttrs) };
    const el = doc(sectionHtml({ name: "All", special_teams: [] }, states));
    expect(el.textContent).toContain("Lakers");
  });

  it("accepts pre-filtered entity IDs without colors", () => {
    const states = { "sensor.nba_lal": makeState("PRE", baseAttrs) };
    const el = doc(sectionHtml(section, states, Object.keys(states)));
    expect(el.querySelector(".game-row")).not.toBeNull();
  });

  it("accepts pre-filtered entity IDs and still marks special teams", () => {
    const states = { "sensor.nba_lal": makeState("PRE", baseAttrs) };
    const el = doc(
      sectionHtml({ ...section, special_teams: ["lal"] }, states, Object.keys(states))
    );
    expect(el.innerHTML).toContain("ttsc-name-special-color");
  });

  it("applies config default name color to both team names (no highlight)", () => {
    const states = { "sensor.nba_lal": makeState("PRE", baseAttrs) };
    const el = doc(sectionHtml(section, states, Object.keys(states), { name_default: "dimgray" }));
    expect(el.innerHTML).toContain("dimgray");
  });

  it("renders both team names normal-weight in the default name color", () => {
    const states = { "sensor.nba_lal": makeState("PRE", baseAttrs) };
    const el = doc(
      sectionHtml(section, states, Object.keys(states), {
        name_default: "dimgray",
      })
    );
    const names = [...el.querySelectorAll<HTMLElement>(".team-name")];
    expect(names).toHaveLength(2);
    for (const n of names) {
      expect(n.style.fontWeight).toBe("normal");
      expect(n.style.color).toBe("dimgray");
    }
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
    };
    const text = doc(sectionHtml(wcSection, states)).textContent ?? "";
    expect(text.indexOf("France")).toBeLessThan(text.indexOf("Brazil"));
  });

  const H = 3600_000;
  const iso = (ms: number) => new Date(Date.now() + ms).toISOString();

  it("live_first puts live games above everything else", () => {
    const states = {
      "sensor.nba_fin": makeState("POST", { ...baseAttrs, team_name: "Finished", date: iso(-H) }),
      "sensor.nba_soon": makeState("PRE", { ...baseAttrs, team_name: "Upcoming", date: iso(H) }),
      // Live is the furthest from now by date, yet still first — it's its own group
      "sensor.nba_live": makeState("IN", { ...baseAttrs, team_name: "Live", date: iso(-5 * H) }),
    };
    const s: SectionConfig = { name: "NBA", prefix: "sensor.nba_", limit: 10, special_teams: [] };
    const text =
      doc(sectionHtml(s, states, undefined, {}, new Map(), { liveFirst: true })).textContent ?? "";
    expect(text.indexOf("Live")).toBeLessThan(text.indexOf("Finished"));
    expect(text.indexOf("Live")).toBeLessThan(text.indexOf("Upcoming"));
  });

  it("orders PRE and POST oldest to newest", () => {
    const states = {
      "sensor.nba_recent": makeState("POST", { ...baseAttrs, team_name: "Recent", date: iso(-H) }),
      "sensor.nba_soon": makeState("PRE", { ...baseAttrs, team_name: "Soon", date: iso(3 * H) }),
      "sensor.nba_far": makeState("PRE", { ...baseAttrs, team_name: "Far", date: iso(20 * H) }),
      "sensor.nba_old": makeState("POST", { ...baseAttrs, team_name: "Old", date: iso(-40 * H) }),
    };
    const s: SectionConfig = { name: "NBA", prefix: "sensor.nba_", limit: 10, special_teams: [] };
    const text = doc(sectionHtml(s, states)).textContent ?? "";
    expect(text.indexOf("Old")).toBeLessThan(text.indexOf("Recent"));
    expect(text.indexOf("Recent")).toBeLessThan(text.indexOf("Soon"));
    expect(text.indexOf("Soon")).toBeLessThan(text.indexOf("Far"));
  });

  it("renders by-date order with no bold highlight and blank position cells even when every tracked team has a numeric win-loss record", () => {
    // Alphas has the best record but the latest kick-off; Gammas has the worst record but
    // plays soonest. If ranking still existed (old `auto`/`standings` behavior), Alphas would
    // sort first; by-date order instead puts Gammas first.
    const states = {
      "sensor.nba_aaa": makeState("PRE", {
        ...baseAttrs,
        team_name: "Alphas",
        team_record: "30-5",
        date: iso(20 * H),
      }),
      "sensor.nba_bbb": makeState("PRE", {
        ...baseAttrs,
        team_name: "Betas",
        team_record: "20-15",
        date: iso(10 * H),
      }),
      "sensor.nba_ccc": makeState("PRE", {
        ...baseAttrs,
        team_name: "Gammas",
        team_record: "10-25",
        date: iso(1 * H),
      }),
    };
    const s: SectionConfig = {
      name: "NBA",
      prefix: "sensor.nba_",
      limit: 10,
      special_teams: [],
    };
    const el = doc(sectionHtml(s, states));
    const text = el.textContent ?? "";
    expect(text.indexOf("Gammas")).toBeLessThan(text.indexOf("Betas"));
    expect(text.indexOf("Betas")).toBeLessThan(text.indexOf("Alphas"));

    const names = [...el.querySelectorAll<HTMLElement>(".team-name")];
    for (const n of names) {
      expect(n.style.fontWeight).toBe("normal");
    }
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
    };
    const el1 = doc(sectionHtml(wcSection, states));
    const el2 = doc(sectionHtml(wcSection, states));
    expect(el1.innerHTML).toBe(el2.innerHTML);
    const text = el1.textContent ?? "";
    expect(text.indexOf("AAA")).toBeLessThan(text.indexOf("ZZZ"));
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
    const el = doc(sectionHtml({ ...section, special_teams: ["lal"] }, states));
    expect(el.innerHTML).toContain("ttsc-name-special-color");
    // PRE has no leading/winning side, so nothing is bold — special or not
    expect(el.innerHTML).not.toContain("font-weight:bold");
  });

  it("skips entity IDs that are no longer present in states", () => {
    const states = { "sensor.nba_lal": makeState("PRE", baseAttrs) };
    const el = doc(sectionHtml(section, states, ["sensor.stale_id", "sensor.nba_lal"]));
    expect(el.querySelector(".game-row")).not.toBeNull();
  });

  it("applies the configured header color when no carousel controls are present", () => {
    const states = { "sensor.nba_lal": makeState("PRE", baseAttrs) };
    const el = doc(sectionHtml(section, states, undefined, { header: "gold" }, new Map()));
    const header = el.querySelector<HTMLElement>(".section-header");
    expect(header?.classList.contains("has-controls")).toBe(false);
    expect(header?.style.color).toBe("gold");
  });

  it("renders carousel controls in the header with the configured header color", () => {
    const states = { "sensor.nba_lal": makeState("PRE", baseAttrs) };
    const el = doc(
      sectionHtml(section, states, undefined, { header: "gold" }, new Map(), {
        controls: html`<button class="my-control">•</button>`,
      })
    );
    const header = el.querySelector<HTMLElement>(".section-header");
    expect(header?.classList.contains("has-controls")).toBe(true);
    expect(header?.style.color).toBe("gold");
    expect(el.querySelector(".my-control")).not.toBeNull();
  });

  it("renders carousel controls in the header without a configured header color", () => {
    const states = { "sensor.nba_lal": makeState("PRE", baseAttrs) };
    const el = doc(
      sectionHtml(section, states, undefined, {}, new Map(), {
        controls: html`<button class="my-control">•</button>`,
      })
    );
    const header = el.querySelector<HTMLElement>(".section-header");
    expect(header?.classList.contains("has-controls")).toBe(true);
    expect(header?.style.color).toBe("");
  });

  it("renders an empty-state message with the header when carousel is true and no entities match", () => {
    const el = doc(sectionHtml(section, {}, undefined, {}, new Map(), { carousel: true }));
    expect(el.querySelector(".section-header")).not.toBeNull();
    expect(el.querySelector(".empty")?.textContent).toContain("No games found");
  });

  it("renders an empty-state message with the header when carousel is true and the limit yields no rows", () => {
    const states = { "sensor.nba_lal": makeState("PRE", baseAttrs) };
    const el = doc(
      sectionHtml({ ...section, limit: 0 }, states, undefined, {}, new Map(), { carousel: true })
    );
    expect(el.querySelector(".section-header")).not.toBeNull();
    expect(el.querySelector(".empty")?.textContent).toContain("No games found");
  });

  describe("card sort", () => {
    const H = 3600_000;
    const at = (ms: number) => new Date(Date.now() + ms).toISOString();
    const game = (state: string, name: string, abbr: string, date?: string) =>
      makeState(state, {
        ...baseAttrs,
        team_name: name,
        team_abbr: abbr,
        opponent_abbr: `x${abbr}`,
        ...(date ? { date } : {}),
      });
    // distance from now: Bye 0, Recent 1h, Soon 3h, Live 5h, Far 20h, Old 40h
    const states = {
      "sensor.s_far": game("PRE", "Far", "far", at(20 * H)),
      "sensor.s_old": game("POST", "Old", "old", at(-40 * H)),
      "sensor.s_bye": game("BYE", "Bye", "bye"),
      "sensor.s_live": game("IN", "Live", "liv", at(-5 * H)),
      "sensor.s_soon": game("PRE", "Soon", "soo", at(3 * H)),
      "sensor.s_recent": game("POST", "Recent", "rec", at(-1 * H)),
    };
    const sec: SectionConfig = { name: "S", prefix: "sensor.s_", limit: 10, special_teams: [] };
    // home column carries team_name (team_homeaway: "home")
    const order = (cfg: SectionConfig, liveFirst?: boolean, st: typeof states = states) =>
      [
        ...doc(sectionHtml(cfg, st, undefined, {}, new Map(), { liveFirst })).querySelectorAll(
          ".game-row"
        ),
      ].map((r) => r.querySelector(".team-name")?.textContent?.trim() ?? "");

    it("defaults to oldest-to-newest, live not pinned, undated last", () => {
      const expected = ["Old", "Live", "Recent", "Soon", "Far", "Bye"];
      expect(order(sec)).toEqual(expected);
      expect(order(sec, false)).toEqual(expected);
    });

    it("live_first pins live games, the rest stay oldest-to-newest", () => {
      expect(order(sec, true)).toEqual(["Live", "Old", "Recent", "Soon", "Far", "Bye"]);
    });

    it("limit keeps the games nearest to now, then applies the display order", () => {
      const nearest = ["Live", "Bye", "Recent"];
      for (const liveFirst of [false, true]) {
        expect([...order({ ...sec, limit: 3 }, liveFirst)].sort()).toEqual([...nearest].sort());
      }
      expect(order({ ...sec, limit: 3 })).toEqual(["Live", "Recent", "Bye"]);
      // the stale "Old" final never crowds out a live / upcoming game
      expect(order({ ...sec, limit: 3 })).not.toContain("Old");
    });

    it("dedups after sorting, before applying limit", () => {
      // sibling sensor reporting the same Old game from the other side
      const dupDate = at(-40 * H);
      const withDup = {
        ...states,
        "sensor.s_old": makeState("POST", {
          ...baseAttrs,
          team_name: "Old",
          team_abbr: "old",
          opponent_abbr: "xold",
          date: dupDate,
        }),
        "sensor.s_old2": makeState("POST", {
          ...baseAttrs,
          team_name: "OldMirror",
          team_abbr: "xold",
          opponent_abbr: "old",
          date: dupDate,
        }),
      };
      // the duplicate must not consume a limit slot: Old appears once and the
      // sixth game still fits within limit 6
      const rows = order({ ...sec, limit: 6 }, false, withDup);
      expect(rows.filter((n) => n === "Old" || n === "OldMirror")).toHaveLength(1);
      expect(rows).toHaveLength(6);
    });
  });
});

describe("rowHtml score-fresh class", () => {
  const awayAttrs: GameAttr = { ...baseAttrs, team_homeaway: "away" };

  it("adds score-fresh to .score-a only when freshHome is true (home side)", () => {
    const el = doc(rowHtml(makeState("IN", baseAttrs), false, {}, { freshHome: true }));
    expect(el.querySelector(".score-a")?.classList.contains("score-fresh")).toBe(true);
    expect(el.querySelector(".score-b")?.classList.contains("score-fresh")).toBe(false);
    expect(el.querySelector(".colon")?.classList.contains("score-fresh")).toBe(false);
    expect(el.querySelectorAll(".score-fresh").length).toBe(1);
  });

  it("adds score-fresh to .score-b only when freshAway is true (away side)", () => {
    const el = doc(rowHtml(makeState("IN", awayAttrs), false, {}, { freshAway: true }));
    expect(el.querySelector(".score-b")?.classList.contains("score-fresh")).toBe(true);
    expect(el.querySelector(".score-a")?.classList.contains("score-fresh")).toBe(false);
    expect(el.querySelector(".colon")?.classList.contains("score-fresh")).toBe(false);
    expect(el.querySelectorAll(".score-fresh").length).toBe(1);
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
  };

  it("marks the home score cell as fresh when the team side changed", () => {
    const states = { "sensor.nba_lal": makeState("IN", baseAttrs) };
    const scoreChangedAt = new Map([[gameKeyFor("sensor.nba_lal", states), { team: Date.now() }]]);
    const el = doc(sectionHtml(section, states, Object.keys(states), {}, scoreChangedAt));
    expect(el.querySelector(".score-a")?.classList.contains("score-fresh")).toBe(true);
    expect(el.querySelector(".score-b")?.classList.contains("score-fresh")).toBe(false);
  });

  it("marks the away score cell as fresh when the tracked entity plays away and its side changed", () => {
    const awayAttrs: GameAttr = { ...baseAttrs, team_homeaway: "away" };
    const states = { "sensor.nba_lal": makeState("IN", awayAttrs) };
    const scoreChangedAt = new Map([[gameKeyFor("sensor.nba_lal", states), { team: Date.now() }]]);
    const el = doc(sectionHtml(section, states, Object.keys(states), {}, scoreChangedAt));
    expect(el.querySelector(".score-b")?.classList.contains("score-fresh")).toBe(true);
    expect(el.querySelector(".score-a")?.classList.contains("score-fresh")).toBe(false);
  });

  it("does not mark as fresh when scoreChangedAt is past the blink window", () => {
    const states = { "sensor.nba_lal": makeState("IN", baseAttrs) };
    const scoreChangedAt = new Map([
      [gameKeyFor("sensor.nba_lal", states), { team: Date.now() - 10_000 }],
    ]);
    const el = doc(
      sectionHtml({ ...section, score_blink: 5 }, states, Object.keys(states), {}, scoreChangedAt)
    );
    expect(el.querySelector(".score-fresh")).toBeNull();
  });

  it("does not mark as fresh when score_blink is 0", () => {
    const states = { "sensor.nba_lal": makeState("IN", baseAttrs) };
    const scoreChangedAt = new Map([[gameKeyFor("sensor.nba_lal", states), { team: Date.now() }]]);
    const el = doc(
      sectionHtml({ ...section, score_blink: 0 }, states, Object.keys(states), {}, scoreChangedAt)
    );
    expect(el.querySelector(".score-fresh")).toBeNull();
  });

  it("keeps the home side fresh on its own window when only the opponent changes afterward", () => {
    // a later opponent-side change must not cancel a still-running home-side blink —
    // each side's freshness is gated by its own timestamp, not a shared one
    const states = { "sensor.nba_lal": makeState("IN", baseAttrs) };
    const scoreChangedAt = new Map([
      [gameKeyFor("sensor.nba_lal", states), { team: Date.now() - 1000, opponent: Date.now() }],
    ]);
    const el = doc(
      sectionHtml({ ...section, score_blink: 5 }, states, Object.keys(states), {}, scoreChangedAt)
    );
    expect(el.querySelector(".score-a")?.classList.contains("score-fresh")).toBe(true);
    expect(el.querySelector(".score-b")?.classList.contains("score-fresh")).toBe(true);
  });

  it("blinks a row even though the blink was armed against its dedup-discarded sibling sensor", () => {
    // regression: sorting.ts's dedup can display either team's own sensor for a game, and
    // which one it picks can flip between renders — a blink armed while the OTHER sensor
    // was displayed must still surface once this one is. scoreChangedAt is keyed by game
    // (gameKeyFor) + team_abbr, not by the displayed sensor's own raw id.
    const date = "2024-03-15";
    const states = {
      "sensor.nba_lal": makeState("IN", {
        ...baseAttrs,
        team_abbr: "LAL",
        opponent_abbr: "BOS",
        date,
      }),
    };
    const key = gameKeyFor("sensor.nba_lal", states);
    const scoreChangedAt = new Map([[key, { LAL: Date.now() }]]);
    const el = doc(
      sectionHtml({ ...section, score_blink: 5 }, states, Object.keys(states), {}, scoreChangedAt)
    );
    expect(el.querySelector(".score-a")?.classList.contains("score-fresh")).toBe(true);
    expect(el.querySelector(".score-b")?.classList.contains("score-fresh")).toBe(false);
  });
});

describe("nameFormat", () => {
  const attrs: GameAttr = {
    ...baseAttrs,
    team_long_name: "Los Angeles Lakers",
    opponent_long_name: "Boston Celtics",
    team_abbr: "LAL",
    opponent_abbr: "BOS",
  };
  const names = (nameFormat: "name" | "long_name" | "abbr") =>
    [
      ...doc(rowHtml(makeState("PRE", attrs), false, {}, { nameFormat })).querySelectorAll(
        ".team-name"
      ),
    ].map((e) => e.textContent?.trim());

  it("rowHtml renders long_name on both sides", () => {
    expect(names("long_name")).toEqual(["Los Angeles Lakers", "Boston Celtics"]);
  });

  it("rowHtml renders abbr on both sides", () => {
    expect(names("abbr")).toEqual(["LAL", "BOS"]);
  });

  it("sectionHtml sorts on team_name even when abbr is displayed", () => {
    const states = {
      "sensor.nba_1": makeState("PRE", { ...attrs, team_name: "Alphas", team_abbr: "ZZZ" }),
      "sensor.nba_2": makeState("PRE", { ...attrs, team_name: "Betas", team_abbr: "AAA" }),
    };
    const s: SectionConfig = { name: "NBA", prefix: "sensor.nba_", limit: 10, special_teams: [] };
    const shown = [
      ...doc(
        sectionHtml(s, states, undefined, {}, undefined, { nameFormat: "abbr" })
      ).querySelectorAll(".game-row .team-name:first-of-type"),
    ].map((e) => e.textContent?.trim());
    expect(shown.indexOf("ZZZ")).toBeLessThan(shown.indexOf("AAA"));
  });
});
