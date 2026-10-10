import { html, nothing } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlinkTracker, type RowBlink } from "../src/blink.js";
import { buildCardTemplate, rowHtml, type SectionFlags, sectionHtml } from "../src/render.js";
import type { GameAttr, HassStates, SectionConfig } from "../src/types.js";
import { BLINK_MS } from "../src/utils.js";
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
    expect(home?.style.color).toContain("--ttsc-name-default-color");
    expect(away?.style.color).toContain("--ttsc-name-default-color");
  });

  it("colors a special team's name blue", () => {
    const el = doc(rowHtml(makeState("PRE", baseAttrs), true));
    const [home] = el.querySelectorAll<HTMLElement>(".team-name");
    expect(home?.style.color).toContain("--ttsc-name-special-color");
  });

  it("keeps a special team's name blue when it is also leading during IN", () => {
    const el = doc(rowHtml(makeState("IN", baseAttrs), true));
    const [home] = el.querySelectorAll<HTMLElement>(".team-name");
    expect(home?.style.color).toContain("--ttsc-name-special-color");
  });

  it("colors the leading name by default (highlightWinner defaults to true)", () => {
    // home leads 95 vs 90
    const el = doc(rowHtml(makeState("IN", baseAttrs), false));
    const [home, away] = el.querySelectorAll<HTMLElement>(".team-name");
    expect(home?.style.color).toContain("--ttsc-name-leading-color");
    expect(away?.style.color).toContain("--ttsc-name-default-color");
  });

  it("does not color the leading name when highlightWinner is explicitly off", () => {
    const el = doc(rowHtml(makeState("IN", baseAttrs), false, {}, { highlightWinner: false }));
    const [home, away] = el.querySelectorAll<HTMLElement>(".team-name");
    expect(home?.style.color).toContain("--ttsc-name-default-color");
    expect(away?.style.color).toContain("--ttsc-name-default-color");
  });

  it("colors the winning name during POST by default", () => {
    const el = doc(rowHtml(makeState("POST", baseAttrs), false));
    const [home, away] = el.querySelectorAll<HTMLElement>(".team-name");
    expect(home?.style.color).toContain("--ttsc-name-winner-color");
    expect(away?.style.color).toContain("--ttsc-name-default-color");
  });

  it("colors the away name when the away side leads/wins", () => {
    const awayAttrs: GameAttr = { ...baseAttrs, team_homeaway: "away" as const };
    const el = doc(rowHtml(makeState("IN", awayAttrs), false));
    const [home, away] = el.querySelectorAll<HTMLElement>(".team-name");
    expect(away?.style.color).toContain("--ttsc-name-leading-color");
    expect(home?.style.color).toContain("--ttsc-name-default-color");
  });

  it("never colors the record, even when highlightWinner is on", () => {
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
    expect(away?.style.color).toContain("--ttsc-name-default-color");
  });

  it("does not highlight either name on an exact tie during IN", () => {
    const tied: GameAttr = { ...baseAttrs, team_score: "90", opponent_score: "90" };
    const el = doc(rowHtml(makeState("IN", tied), false));
    const [home, away] = el.querySelectorAll<HTMLElement>(".team-name");
    expect(home?.style.color).toContain("--ttsc-name-default-color");
    expect(away?.style.color).toContain("--ttsc-name-default-color");
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
    expect(doc(sectionHtml(section, {}, [])).querySelector(".section-header")).toBeNull();
  });

  it("returns empty when entities are in invalid states", () => {
    const states = { "sensor.nba_lal": makeState("UNKNOWN", baseAttrs) };
    expect(
      doc(sectionHtml(section, states, Object.keys(states))).querySelector(".section-header")
    ).toBeNull();
  });

  it("returns empty when limit produces no rows", () => {
    const states = { "sensor.nba_lal": makeState("PRE", baseAttrs) };
    expect(
      doc(sectionHtml({ ...section, limit: 0 }, states, Object.keys(states))).querySelector(
        ".section-header"
      )
    ).toBeNull();
  });

  it("renders section header with name", () => {
    const states = { "sensor.nba_lal": makeState("PRE", baseAttrs) };
    const el = doc(sectionHtml(section, states, Object.keys(states)));
    expect(el.querySelector(".section-header")).not.toBeNull();
    expect(el.querySelector(".section-title")?.textContent).toBe("NBA");
  });

  it("renders a row for each matching entity", () => {
    const states = {
      "sensor.nba_lal": makeState("PRE", baseAttrs),
      "sensor.nba_gsw": makeState("IN", { ...baseAttrs, team_name: "Warriors" }),
    };
    const el = doc(sectionHtml(section, states, Object.keys(states)));
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
    const el = doc(sectionHtml({ ...section, limit: 2 }, states, Object.keys(states)));
    expect(el.querySelectorAll(".game-row").length).toBe(2);
  });

  it("does not inject raw HTML in section name", () => {
    const states = { "sensor.nba_lal": makeState("PRE", baseAttrs) };
    const el = doc(sectionHtml({ ...section, name: "<b>NBA</b>" }, states, Object.keys(states)));
    expect(el.querySelector(".section-header b")).toBeNull();
    expect(el.querySelector(".section-title")?.textContent).toBe("<b>NBA</b>");
  });

  it("marks special teams with the special color", () => {
    const states = { "sensor.nba_lal": makeState("PRE", baseAttrs) };
    const el = doc(
      sectionHtml({ ...section, special_teams: ["lal"] }, states, Object.keys(states))
    );
    expect(el.innerHTML).toContain("ttsc-name-special-color");
  });

  it("matches special_teams by full entity ID when the section also has entities", () => {
    const states = { "sensor.nba_lal": makeState("PRE", baseAttrs) };
    const el = doc(
      sectionHtml(
        { ...section, entities: ["sensor.nba_lal"], special_teams: ["sensor.nba_lal"] },
        states,
        Object.keys(states)
      )
    );
    expect(el.innerHTML).toContain("ttsc-name-special-color");
  });

  it("matches all entities when the section has neither prefix nor entities", () => {
    const states = { "sensor.nba_lal": makeState("PRE", baseAttrs) };
    const el = doc(sectionHtml({ name: "All", special_teams: [] }, states, Object.keys(states)));
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
    const text = doc(sectionHtml(wcSection, states, Object.keys(states))).textContent ?? "";
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
      doc(sectionHtml(s, states, Object.keys(states), {}, { liveFirst: true })).textContent ?? "";
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
    const text = doc(sectionHtml(s, states, Object.keys(states))).textContent ?? "";
    expect(text.indexOf("Old")).toBeLessThan(text.indexOf("Recent"));
    expect(text.indexOf("Recent")).toBeLessThan(text.indexOf("Soon"));
    expect(text.indexOf("Soon")).toBeLessThan(text.indexOf("Far"));
  });

  it("renders by-date order with no highlight and blank position cells even when every tracked team has a numeric win-loss record", () => {
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
    const el = doc(sectionHtml(s, states, Object.keys(states)));
    const text = el.textContent ?? "";
    expect(text.indexOf("Gammas")).toBeLessThan(text.indexOf("Betas"));
    expect(text.indexOf("Betas")).toBeLessThan(text.indexOf("Alphas"));
  });

  it("produces stable order when two teams have the same win ratio", () => {
    const states = {
      "sensor.nba_zzz": makeState("PRE", { ...baseAttrs, team_name: "ZZZ", team_record: "5-5" }),
      "sensor.nba_aaa": makeState("PRE", { ...baseAttrs, team_name: "AAA", team_record: "5-5" }),
    };
    const el1 = doc(sectionHtml(section, states, Object.keys(states)));
    const el2 = doc(sectionHtml(section, states, Object.keys(states)));
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
    const el1 = doc(sectionHtml(wcSection, states, Object.keys(states)));
    const el2 = doc(sectionHtml(wcSection, states, Object.keys(states)));
    expect(el1.innerHTML).toBe(el2.innerHTML);
    const text = el1.textContent ?? "";
    expect(text.indexOf("AAA")).toBeLessThan(text.indexOf("ZZZ"));
  });

  it("falls back to entityId as teamName when team_name attribute is absent", () => {
    const states = {
      "sensor.nba_lal": makeState("PRE", { ...baseAttrs, team_name: undefined }),
    };
    expect(() => doc(sectionHtml(section, states, Object.keys(states)))).not.toThrow();
    expect(
      doc(sectionHtml(section, states, Object.keys(states))).querySelector(".game-row")
    ).not.toBeNull();
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
    const text = doc(sectionHtml(section, states, Object.keys(states))).textContent ?? "";
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
    const el = doc(
      sectionHtml({ ...section, special_teams: ["lal"] }, states, Object.keys(states))
    );
    expect(el.innerHTML).toContain("ttsc-name-special-color");
    // PRE has no leading/winning side, so nothing is highlighted — special or not
    expect(el.innerHTML).not.toContain("font-weight:bold");
  });

  it("skips entity IDs that are no longer present in states", () => {
    const states = { "sensor.nba_lal": makeState("PRE", baseAttrs) };
    const el = doc(sectionHtml(section, states, ["sensor.stale_id", "sensor.nba_lal"]));
    expect(el.querySelector(".game-row")).not.toBeNull();
  });

  it("applies the configured header color when no carousel controls are present", () => {
    const states = { "sensor.nba_lal": makeState("PRE", baseAttrs) };
    const el = doc(sectionHtml(section, states, Object.keys(states), { header: "gold" }));
    const header = el.querySelector<HTMLElement>(".section-header");
    expect(header?.classList.contains("has-controls")).toBe(false);
    expect(header?.style.color).toBe("gold");
  });

  it("renders carousel controls in the header with the configured header color", () => {
    const states = { "sensor.nba_lal": makeState("PRE", baseAttrs) };
    const el = doc(
      sectionHtml(
        section,
        states,
        Object.keys(states),
        { header: "gold" },
        {
          controls: html`<button class="my-control">•</button>`,
        }
      )
    );
    const header = el.querySelector<HTMLElement>(".section-header");
    expect(header?.classList.contains("has-controls")).toBe(true);
    expect(header?.style.color).toBe("gold");
    expect(el.querySelector(".my-control")).not.toBeNull();
  });

  it("renders carousel controls in the header without a configured header color", () => {
    const states = { "sensor.nba_lal": makeState("PRE", baseAttrs) };
    const el = doc(
      sectionHtml(
        section,
        states,
        Object.keys(states),
        {},
        {
          controls: html`<button class="my-control">•</button>`,
        }
      )
    );
    const header = el.querySelector<HTMLElement>(".section-header");
    expect(header?.classList.contains("has-controls")).toBe(true);
    expect(header?.style.color).toBe("");
  });

  it("renders an empty-state message with the header when carousel is true and no entities match", () => {
    const el = doc(sectionHtml(section, {}, [], {}, { carousel: true }));
    expect(el.querySelector(".section-header")).not.toBeNull();
    expect(el.querySelector(".empty")?.textContent).toContain("No games found");
  });

  it("renders an empty-state message with the header when carousel is true and the limit yields no rows", () => {
    const states = { "sensor.nba_lal": makeState("PRE", baseAttrs) };
    const el = doc(
      sectionHtml({ ...section, limit: 0 }, states, Object.keys(states), {}, { carousel: true })
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
        ...doc(sectionHtml(cfg, st, Object.keys(st), {}, { liveFirst })).querySelectorAll(
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

    it("limit takes the first N rows of the display order", () => {
      expect(order({ ...sec, limit: 3 })).toEqual(["Old", "Live", "Recent"]);
      expect(order({ ...sec, limit: 3 }, true)).toEqual(["Live", "Old", "Recent"]);
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

describe("sectionHtml blink", () => {
  const section: SectionConfig = {
    name: "NBA",
    prefix: "sensor.nba_",
    limit: 10,
    special_teams: [] as string[],
  };
  const ID = "sensor.nba_lal";
  const fresh = (el: Element, sel: string) =>
    el.querySelector(sel)?.classList.contains("score-fresh");
  const noBlink = { freshHome: false, freshAway: false };
  const stub = (view: Partial<RowBlink>) => ({
    blink: { rowView: () => ({ ...noBlink, ...view }) },
  });
  const render = (states: HassStates, flags: SectionFlags, sec = section) =>
    doc(sectionHtml(sec, states, Object.keys(states), {}, flags));
  /** real tracker: baseline score 85 (team) then the live 95 */
  const changed = (attrs: GameAttr = baseAttrs) => {
    const tracker = new BlinkTracker();
    const before = { [ID]: makeState("IN", { ...attrs, team_score: "85" }) };
    tracker.update({
      states: before,
      trackedIds: Object.keys(before),
      blinkOnById: new Map(),
      reducedMotion: false,
      onExpire: vi.fn(),
    });
    const states = { [ID]: makeState("IN", attrs) };
    tracker.update({
      states,
      trackedIds: Object.keys(states),
      blinkOnById: new Map(),
      reducedMotion: false,
      onExpire: vi.fn(),
    });
    return { tracker, states };
  };

  afterEach(() => vi.useRealTimers());

  it("marks the home score cell as fresh and holds the old score when the team side changed", () => {
    const { tracker, states } = changed();
    const el = render(states, { blink: tracker });
    expect(fresh(el, ".score-a")).toBe(true);
    expect(fresh(el, ".score-b")).toBe(false);
    expect(el.querySelector(".score-a .score-value")?.textContent).toBe("85");
  });

  it("marks the away score cell as fresh when the tracked entity plays away", () => {
    const { tracker, states } = changed({ ...baseAttrs, team_homeaway: "away" });
    const el = render(states, { blink: tracker });
    expect(fresh(el, ".score-b")).toBe(true);
    expect(fresh(el, ".score-a")).toBe(false);
  });

  it("reveals the live score once the blink window has passed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const { tracker, states } = changed();
    vi.setSystemTime(1_010_000);
    const el = render(states, { blink: tracker });
    expect(el.querySelector(".score-fresh")).toBeNull();
    expect(el.querySelector(".score-a .score-value")?.textContent).toBe("95");
  });

  it("shows the held score while fresh and the live score when no longer fresh", () => {
    const states = { [ID]: makeState("IN", baseAttrs) };
    const held = render(states, stub({ freshHome: true, heldHome: 1 }));
    expect(held.querySelector(".score-a .score-value")?.textContent).toBe("1");
    const live = render(states, stub({}));
    expect(live.querySelector(".score-a .score-value")?.textContent).toBe("95");
  });

  it("does not mark as fresh or hold the old score when section score_blink is false", () => {
    const { tracker, states } = changed();
    // the section's score_blink: false is passed as blinkOnById (off for this id)
    tracker.update({
      states,
      trackedIds: Object.keys(states),
      blinkOnById: new Map([[ID, false]]),
      reducedMotion: false,
      onExpire: vi.fn(),
    });
    const el = render(states, { blink: tracker }, { ...section, score_blink: false });
    expect(el.querySelector(".score-fresh")).toBeNull();
    expect(el.querySelector(".score-a .score-value")?.textContent).toBe("95");
  });

  it("derives the leading-name colour from the held score, not the live one", () => {
    // live 95-90 means home leads; with home's old score 85 held, away still leads
    const leaderStyle = (heldHome?: number) => {
      const el = doc(rowHtml(makeState("IN", baseAttrs), false, {}, { heldHome }));
      const [home, away] = [...el.querySelectorAll<HTMLElement>(".team-name")];
      return { home: home?.style.color, away: away?.style.color };
    };
    const live = leaderStyle();
    const held = leaderStyle(85);
    expect(held.home).toBe(live.away);
    expect(held.away).toBe(live.home);
  });

  it("shows each side's held score in its own cell, whichever side the tracked team plays", () => {
    const away: GameAttr = { ...baseAttrs, team_homeaway: "away" };
    const el = doc(rowHtml(makeState("IN", away), false, {}, { heldHome: 88, heldAway: 70 }));
    expect(el.querySelector(".score-a .score-value")?.textContent).toBe("88");
    expect(el.querySelector(".score-b .score-value")?.textContent).toBe("70");
  });

  it("keeps each side's blink on its own window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const tracker = new BlinkTracker();
    const sync = (team: string, opp: string) => {
      const states = {
        [ID]: makeState("IN", { ...baseAttrs, team_score: team, opponent_score: opp }),
      };
      tracker.update({
        states,
        trackedIds: Object.keys(states),
        blinkOnById: new Map(),
        reducedMotion: false,
        onExpire: vi.fn(),
      });
      return states;
    };
    sync("85", "80");
    sync("95", "80"); // home changes at t0
    vi.setSystemTime(1_000_500);
    const states = sync("95", "90"); // opponent changes 500ms later
    const el = render(states, { blink: tracker });
    expect(fresh(el, ".score-a")).toBe(true);
    expect(fresh(el, ".score-b")).toBe(true);
    // once the home window closes the opponent's (opened later) is still running
    vi.setSystemTime(1_000_000 + BLINK_MS + 100);
    const later = render(states, { blink: tracker });
    expect(fresh(later, ".score-a")).toBe(false);
    expect(fresh(later, ".score-b")).toBe(true);
  });

  it("blinks the displayed sensor when the change was recorded on its sibling", () => {
    // regression: dedup can display either team's own sensor for a game; a blink armed while
    // the OTHER sensor was tracked must still surface (tracker keys by game, not raw id)
    const mk = (id: string, team: string, opp: string, ts: string, os: string) => ({
      [id]: makeState("IN", {
        ...baseAttrs,
        team_abbr: team,
        opponent_abbr: opp,
        team_score: ts,
        opponent_score: os,
        date: "2024-03-15",
      }),
    });
    const tracker = new BlinkTracker();
    const sib = (lal: string, bos: string) => mk("sensor.nba_bos", "BOS", "LAL", bos, lal);
    const sync = (states: HassStates) =>
      tracker.update({
        states,
        trackedIds: Object.keys(states),
        blinkOnById: new Map(),
        reducedMotion: false,
        onExpire: vi.fn(),
      });
    sync(sib("85", "90"));
    sync(sib("95", "90"));
    // LAL's own sensor is the one displayed
    const states = mk(ID, "LAL", "BOS", "95", "90");
    const el = render(states, { blink: tracker });
    expect(fresh(el, ".score-a")).toBe(true);
    expect(fresh(el, ".score-b")).toBe(false);
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
        sectionHtml(s, states, Object.keys(states), {}, { nameFormat: "abbr" })
      ).querySelectorAll(".game-row .team-name:first-of-type"),
    ].map((e) => e.textContent?.trim());
    expect(shown.indexOf("ZZZ")).toBeLessThan(shown.indexOf("AAA"));
  });
});

describe("buildCardTemplate", () => {
  it("returns a TemplateResult that renders the card directly", () => {
    const result = buildCardTemplate({
      states: {},
      trackedBySection: new Map(),
      options: { colors: {} } as never,
      blink: { rowView: () => undefined } as never,
      carousel: false,
      visibleSections: [],
      slideControls: nothing,
      haCardStyle: "",
      versionBadge: nothing,
      debugTableHtml: null,
    });
    expect(doc(result).querySelector("ha-card")).not.toBeNull();
  });
});
