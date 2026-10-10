import { describe, expect, it, vi } from "vitest";
import type { SportScoreboardCard } from "../src/index.js";
import { useFakeTimers } from "./helpers.js";
import { baseAttrs, makeCard, makeHass, makeState, nbaSection } from "./index.fixtures.js";

describe("SportScoreboardCard core", () => {
  describe("registration", () => {
    it("registers as a custom element", () => {
      expect(customElements.get("ha-teamtracker-scoreboard-card")).toBeDefined();
    });

    it("adds entry to window.customCards", () => {
      const entry = window.customCards?.find((c) => c.type === "ha-teamtracker-scoreboard-card");
      expect(entry).toBeDefined();
      expect(entry?.name).toBe("TeamTracker Scoreboard Card");
    });
  });

  describe("getStubConfig", () => {
    it("returns a valid default config shape", () => {
      const Cls = customElements.get("ha-teamtracker-scoreboard-card") as
        | typeof SportScoreboardCard
        | undefined;
      const config = Cls?.getStubConfig();
      expect(Array.isArray(config?.sections)).toBe(true);
      expect(config?.sections?.length).toBeGreaterThan(0);
      expect(config).not.toHaveProperty("height");
    });
  });

  describe("getCardSize", () => {
    it("calculates rows from height string", () => {
      const card = makeCard();
      card._config = { layout: { height: "475px" } };
      expect(card.getCardSize()).toBe(10);
    });

    it("rounds up fractional rows", () => {
      const card = makeCard();
      card._config = { layout: { height: "51px" } };
      expect(card.getCardSize()).toBe(2);
    });

    it("calculates size from sections when height is absent", () => {
      const card = makeCard();
      card._config = { sections: [{ limit: 10 }, { limit: 5 }] };
      // 2 headers + 15 rows = 17 rows * (28 + 2*5 gap) = 646px / 50 = ceil(12.92) = 13
      expect(card.getCardSize()).toBe(13);
    });

    it("returns 1 when config is null", () => {
      const card = makeCard();
      expect(card.getCardSize()).toBe(1);
    });

    it("returns 1 for mode: slide with no sections", () => {
      const card = makeCard();
      card._config = { mode: "slide" };
      expect(card.getCardSize()).toBe(1);
    });

    it("defaults section limit to 10 when limit is omitted", () => {
      const card = makeCard();
      card._config = { sections: [{ name: "NBA" }] };
      // 11 rows * (28 + 2*5 gap) = 418px / 50 = ceil(8.36) = 9
      expect(card.getCardSize()).toBe(9);
    });

    it("uses row_height px value for section-based size estimate", () => {
      const card = makeCard();
      card._config = { sections: [{ limit: 10 }], layout: { row_height: "40px" } };
      // 11 rows * (40 + 2*5 gap) = 550px / 50 = 11
      expect(card.getCardSize()).toBe(11);
    });

    it("falls back to 28px row height when row_height is non-numeric", () => {
      const card = makeCard();
      card._config = { sections: [{ limit: 10 }], layout: { row_height: "auto" } };
      // 11 rows * (28 + 2*5 gap) = 418px / 50 = ceil(8.36) = 9
      expect(card.getCardSize()).toBe(9);
    });

    it("factors layout.row_padding into the size estimate", () => {
      const card = makeCard();
      card._config = { sections: [{ limit: 10 }], layout: { row_padding: "0px" } };
      // 11 rows * (28 + 0 padding) = 308px / 50 = ceil(6.16) = 7
      expect(card.getCardSize()).toBe(7);
    });

    it("ignores non-pixel row_height / row_padding (uses the defaults)", () => {
      const card = makeCard();
      card._config = {
        sections: [{ limit: 10 }],
        layout: { row_height: "2rem", row_padding: "1em" },
      };
      // "2rem"/"1em" aren't px → 28 + 2*5 = 38; 11 * 38 = 418 / 50 = ceil(8.36) = 9
      expect(card.getCardSize()).toBe(9);
    });

    it("ignores a percentage height (falls back to the section estimate)", () => {
      const card = makeCard();
      card._config = { layout: { height: "50%" }, sections: [{ limit: 10 }] };
      expect(card.getCardSize()).toBe(9);
    });

    it("falls back to section-based size when height is non-numeric", () => {
      const card = makeCard();
      card._config = { layout: { height: "auto" }, sections: [{ limit: 10 }] };
      const size = card.getCardSize();
      expect(Number.isFinite(size)).toBe(true);
      expect(size).toBeGreaterThanOrEqual(1);
    });
  });

  describe("_nameFormat", () => {
    const nameAttrs = {
      ...baseAttrs,
      team_long_name: "Los Angeles Lakers",
      opponent_long_name: "Boston Celtics",
      team_abbr: "LAL",
      opponent_abbr: "BOS",
    };
    const renderedNames = (nameFormat?: unknown) => {
      const card = makeCard();
      card._config = { sections: [nbaSection], name_format: nameFormat } as never;
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", nameAttrs) });
      card._render();
      return Array.from(card.shadowRoot?.querySelectorAll(".team-name") ?? []).map((e) =>
        e.textContent?.trim()
      );
    };

    it("defaults to name when name_format is unset", () => {
      expect(renderedNames(undefined)).toEqual(["Lakers", "Celtics"]);
    });

    it("renders long_name on both sides", () => {
      expect(renderedNames("long_name")).toEqual(["Los Angeles Lakers", "Boston Celtics"]);
    });

    it("renders abbr on both sides", () => {
      expect(renderedNames("abbr")).toEqual(["LAL", "BOS"]);
    });

    it("falls back to name for an invalid value", () => {
      expect(renderedNames("bogus")).toEqual(["Lakers", "Celtics"]);
    });
  });

  describe("scheduler-owned state", () => {
    it("no longer exposes legacy scheduler shims on the card", () => {
      const card = makeCard() as unknown as Record<string, unknown>;
      for (const k of [
        "_trackedIds",
        "_trackedBySection",
        "_buildTrackedIds",
        "_scheduleRender",
        "_hasRelevantChange",
        "_fixedTimer",
        "_debugTimer",
        "_renderTimer",
        "_subscription",
      ])
        expect(k in card, k).toBe(false);
    });
  });

  describe("_buildTrackedIds", () => {
    it("populates _scheduler.trackedIds with entity IDs matching configured prefixes", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      card._scheduler.refreshTracked(["sensor.nba_lal", "sensor.nhl_bos", "sensor.weather_london"]);
      expect(card._scheduler.trackedIds?.has("sensor.nba_lal")).toBe(true);
      expect(card._scheduler.trackedIds?.has("sensor.nhl_bos")).toBe(false);
      expect(card._scheduler.trackedIds?.has("sensor.weather_london")).toBe(false);
    });

    it("produces an empty set when no prefix matches", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      card._scheduler.refreshTracked(["sensor.weather_london", "sensor.sun"]);
      expect(card._scheduler.trackedIds?.size).toBe(0);
    });

    it("produces an empty set when config has no sections", () => {
      const card = makeCard();
      card._config = {};
      card._scheduler.refreshTracked(["sensor.nba_lal"]);
      expect(card._scheduler.trackedIds?.size).toBe(0);
    });

    it("matches all entities when section has no prefix", () => {
      const card = makeCard();
      card._config = { sections: [{ name: "All" }] };
      card._scheduler.refreshTracked(["sensor.nba_lal", "sensor.weather"]);
      expect(card._scheduler.trackedIds?.size).toBe(2);
    });

    it("populates _scheduler.trackedIds from an explicit entities list regardless of prefix", () => {
      const card = makeCard();
      card._config = {
        sections: [{ name: "Custom", entities: ["sensor.nba_lal", "sensor.foo_custom_bos"] }],
      };
      card._scheduler.refreshTracked([
        "sensor.nba_lal",
        "sensor.foo_custom_bos",
        "sensor.nba_bos",
        "sensor.weather_london",
      ]);
      expect(card._scheduler.trackedIds?.has("sensor.nba_lal")).toBe(true);
      expect(card._scheduler.trackedIds?.has("sensor.foo_custom_bos")).toBe(true);
      expect(card._scheduler.trackedIds?.has("sensor.nba_bos")).toBe(false);
      expect(card._scheduler.trackedIds?.has("sensor.weather_london")).toBe(false);
      expect(card._scheduler.trackedIds?.size).toBe(2);
    });

    it("unions prefix matches with explicit entities when a section sets both", () => {
      const card = makeCard();
      card._config = {
        sections: [{ name: "Mixed", prefix: "sensor.nba_", entities: ["sensor.foo_custom_bos"] }],
      };
      card._scheduler.refreshTracked([
        "sensor.nba_lal",
        "sensor.foo_custom_bos",
        "sensor.weather_london",
      ]);
      expect(card._scheduler.trackedIds?.has("sensor.nba_lal")).toBe(true);
      expect(card._scheduler.trackedIds?.has("sensor.foo_custom_bos")).toBe(true);
      expect(card._scheduler.trackedIds?.has("sensor.weather_london")).toBe(false);
      expect(card._scheduler.trackedIds?.size).toBe(2);
    });

    it("rebuilds _scheduler.trackedIds when an entity swaps in at the same total count", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      card._scheduler.refreshTracked(["sensor.nba_lal", "sensor.weather"]);
      expect(card._scheduler.trackedIds?.has("sensor.nba_lal")).toBe(true);
      // same count, different entity — must rebuild
      card._scheduler.refreshTracked(["sensor.nba_bos", "sensor.weather"]);
      expect(card._scheduler.trackedIds?.has("sensor.nba_bos")).toBe(true);
      expect(card._scheduler.trackedIds?.has("sensor.nba_lal")).toBe(false);
    });

    it("assigns an id to every matching section, not just the first", () => {
      const card = makeCard();
      card._config = {
        sections: [
          { name: "NBA", prefix: "sensor.nba_" },
          { name: "My teams", entities: ["sensor.nba_lal"] },
        ],
      };
      card._scheduler.refreshTracked(["sensor.nba_lal", "sensor.nba_bos"]);
      expect(card._scheduler.trackedBySection?.get(0)).toEqual([
        "sensor.nba_lal",
        "sensor.nba_bos",
      ]);
      expect(card._scheduler.trackedBySection?.get(1)).toEqual(["sensor.nba_lal"]);
    });
  });

  describe("setConfig", () => {
    it("stores the provided config", () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection] });
      expect(card._config?.sections).toHaveLength(1);
    });

    it("triggers render immediately when hass is already set", () => {
      const card = makeCard();
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card.setConfig({ sections: [nbaSection] });
      expect(card.shadowRoot?.innerHTML).toContain("ha-card");
    });

    it("does not render when hass is not yet set", () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection] });
      expect(card.shadowRoot?.innerHTML).toBe("");
    });

    it("invalidates _scheduler.trackedIds so it is rebuilt on the next hass push", () => {
      const card = makeCard();
      card._scheduler.trackedIds = new Set(["sensor.nba_lal"]);
      card.setConfig({ sections: [nbaSection] });
      expect(card._scheduler.trackedIds).toBeNull();
    });
  });

  describe("set hass", () => {
    it("renders on first hass assignment when config is set", () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection] });
      card.hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      expect(card.shadowRoot?.innerHTML).toContain("ha-card");
    });

    it("does not render when no config is set", () => {
      const card = makeCard();
      card.hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      expect(card.shadowRoot?.innerHTML).toBe("");
    });

    it("builds _scheduler.trackedIds on first assignment", () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection] });
      card.hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      expect(card._scheduler.trackedIds).toBeInstanceOf(Set);
      expect(card._scheduler.trackedIds?.has("sensor.nba_lal")).toBe(true);
    });

    it("refreshes _scheduler.trackedIds on render so newly-added sensors are picked up", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._scheduler.trackedIds = new Set(); // simulate stale empty cache
      card._render();
      expect(card._scheduler.trackedIds?.has("sensor.nba_lal")).toBe(true);
    });

    it("skips _scheduler.trackedIds rebuild when already populated and no render follows", () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection] });
      const stateObj = makeState("PRE", baseAttrs);
      // first push: builds _scheduler.trackedIds and renders
      card.hass = makeHass({ "sensor.nba_lal": stateObj });
      const setAfterRender = card._scheduler.trackedIds;
      // second push: same state reference — no change, no render, guard skipped
      card.hass = makeHass({ "sensor.nba_lal": stateObj });
      expect(card._scheduler.trackedIds).toBe(setAfterRender);
    });

    it("skips render when no relevant entity changed", () => {
      const card = makeCard();
      const stateObj = makeState("PRE", baseAttrs);
      card.setConfig({ sections: [nbaSection], lazy_refresh: 0 });
      card.hass = makeHass({ "sensor.nba_lal": stateObj }); // first call: builds _scheduler.trackedIds
      const renderSpy = vi.spyOn(card, "_render");
      // same state object reference — fallback diffing returns false, no render
      card.hass = makeHass({ "sensor.nba_lal": stateObj });
      expect(renderSpy).not.toHaveBeenCalled();
    });

    it("treats missing sections as empty prefix list when checking relevance", () => {
      const card = makeCard();
      // pre-set _scheduler.trackedIds so the first-call branch is bypassed
      card._scheduler.trackedIds = new Set(); // empty — no sections to match
      card._hass = makeHass({});
      card._config = {}; // no sections key — hits the ?? [] fallback
      const renderSpy = vi.spyOn(card, "_render");
      card.hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      // empty _scheduler.trackedIds → hasRelevantChange returns false → no render
      expect(renderSpy).not.toHaveBeenCalled();
    });

    it("re-renders when a relevant entity state changes", () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection], lazy_refresh: 0 });
      // first call: builds _scheduler.trackedIds;
      card.hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      const renderSpy = vi.spyOn(card, "_render");
      // second call: different state ref → fallback diffing triggers render
      card.hass = makeHass({ "sensor.nba_lal": makeState("IN", baseAttrs) });
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("_render", () => {
    it("renders ha-card with game rows when entities match", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(card.shadowRoot?.innerHTML).toContain("ha-card");
      expect(card.shadowRoot?.innerHTML).toContain("Lakers");
    });

    it("renders an entity in every section that matches it, not just the first", () => {
      const card = makeCard();
      card._config = {
        sections: [
          { name: "NBA", prefix: "sensor.nba_" },
          { name: "My teams", entities: ["sensor.nba_lal"] },
        ],
      };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      const headers = card.shadowRoot?.querySelectorAll(".section-title");
      expect(headers?.[0]?.textContent).toBe("NBA");
      expect(headers?.[1]?.textContent).toBe("My teams");
      expect(card.shadowRoot?.querySelectorAll(".game-row").length).toBe(2);
    });

    it("shows no-games message when no entities match the prefix", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      card._hass = makeHass({});
      card._render();
      expect(card.shadowRoot?.innerHTML).toContain("No games found");
    });

    it("renders section with no prefix defined (matches all entities)", () => {
      const card = makeCard();
      card._config = { sections: [{ name: "All" }] };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(card.shadowRoot?.innerHTML).toContain("ha-card");
    });

    it("applies custom height to ha-card style", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], layout: { height: "300px" } };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(card.shadowRoot?.innerHTML).toContain("300px");
    });

    it("handles non-numeric height gracefully without setting row budget", () => {
      const card = makeCard();
      card._config = { sections: [{ ...nbaSection, limit: 5 }], layout: { height: "auto" } };
      const states = Object.fromEntries(
        Array.from({ length: 10 }, (_, i) => [
          `sensor.nba_team${i}`,
          makeState("PRE", { ...baseAttrs, team_name: `Team${i}` }),
        ])
      );
      card._hass = makeHass(states);
      card._render();
      expect(card.shadowRoot?.querySelectorAll(".game-row").length).toBe(5);
    });

    it("passes colors config through to row rendering", () => {
      const card = makeCard();
      card._config = {
        sections: [nbaSection],
        colors: { name_default: "gold" },
      };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(card.shadowRoot?.innerHTML).toContain("gold");
    });

    it("colors the leading team's name by default when highlight_winner is unset", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      card._hass = makeHass({ "sensor.nba_lal": makeState("IN", baseAttrs) });
      card._render();
      const name = card.shadowRoot?.querySelector<HTMLElement>(".team-name");
      expect(name?.style.color).toContain("--ttsc-name-leading-color");
    });

    it("leaves team names uncolored and normal-weight when highlight_winner is false", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], highlight_winner: false };
      card._hass = makeHass({ "sensor.nba_lal": makeState("IN", baseAttrs) });
      card._render();
      const name = card.shadowRoot?.querySelector<HTMLElement>(".team-name");
      expect(name?.style.color).toContain("--ttsc-name-default-color");
    });

    it("applies header color as inline style on section header element", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], colors: { header: "tomato" } };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      const header = card.shadowRoot?.querySelector(".section-header") as HTMLElement | null;
      expect(header?.style.color).toBe("tomato");
    });

    it("shows error when sections is not an array", () => {
      const card = makeCard();
      card._config = { sections: null } as unknown as typeof card._config;
      card._hass = makeHass({});
      card._render();
      expect(card.shadowRoot?.innerHTML).toContain("error");
    });

    it("shows error when sections array is empty", () => {
      const card = makeCard();
      card._config = { sections: [] };
      card._hass = makeHass({});
      card._render();
      expect(card.shadowRoot?.innerHTML).toContain("error");
    });

    it("shows error when render throws internally", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      card._hass = null; // accessing .states throws
      card._render();
      expect(card.shadowRoot?.innerHTML).toContain("error");
    });

    it("tracks every _render() call in debug mode", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], debug: true };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      card._render();
      expect(card._debug.counts("rendered").hour3).toBe(2);
    });

    it("tracks each distinct render call including after content change", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], debug: true };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      card._render();
      card._hass = makeHass({
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "5" }),
      });
      card._render();
      expect(card._debug.counts("rendered").hour3).toBe(3);
    });
  });

  describe("refresh", () => {
    useFakeTimers();

    it("starts fixedTimer with default 60-second interval when refresh is omitted", () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection] });
      expect(card._scheduler.fixedTimer.active).toBe(true);
    });

    it("fixed_refresh: 0 does not start a fixed timer", () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection], fixed_refresh: 0 });
      expect(card._scheduler.fixedTimer.active).toBe(false);
    });

    it("starts fixedTimer at custom fixed_refresh interval", () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection], fixed_refresh: 60 });
      expect(card._scheduler.fixedTimer.active).toBe(true);
    });

    it("fixedTimer calls _render at fixed_refresh interval", () => {
      const card = makeCard();
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card.setConfig({ sections: [nbaSection], fixed_refresh: 10 });
      const renderSpy = vi.spyOn(card, "_render");

      vi.advanceTimersByTime(10_000);
      expect(renderSpy).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(10_000);
      expect(renderSpy).toHaveBeenCalledTimes(2);
    });

    it("clears the old timer when setConfig is called again", () => {
      const card = makeCard();
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card.setConfig({ sections: [nbaSection], fixed_refresh: 30 });
      card.setConfig({ sections: [nbaSection], fixed_refresh: 60 });
      const renderSpy = vi.spyOn(card, "_render");
      // the old 30s cadence must be cleared, not just superseded — nothing should fire at 30s
      vi.advanceTimersByTime(30_000);
      expect(renderSpy).not.toHaveBeenCalled();
      vi.advanceTimersByTime(30_000);
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });

    it("clears the timer on disconnectedCallback", () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection], fixed_refresh: 30 });
      card.disconnectedCallback();
      expect(card._scheduler.fixedTimer.active).toBe(false);
    });

    it("ignores hass assigned while detached, then rebuilds on re-attach", () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection] });
      card.disconnectedCallback();
      card.hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      expect(card._scheduler.trackedIds).toBeNull();
      card.connectedCallback();
      expect(card._scheduler.trackedIds).not.toBeNull();
    });

    it("setConfig while detached starts no timer, then re-attach rebuilds", () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection] });
      card.hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card.disconnectedCallback();
      card.setConfig({ sections: [nbaSection] });
      expect(card._scheduler.fixedTimer.active).toBe(false);
      card.connectedCallback();
      expect(card._scheduler.fixedTimer.active).toBe(true);
      expect(card._scheduler.trackedIds).not.toBeNull();
    });

    it("restarts the fixed timer on connectedCallback after disconnect", () => {
      const card = makeCard();
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card.setConfig({ sections: [nbaSection], fixed_refresh: 10 });
      card.disconnectedCallback();
      card.connectedCallback();
      expect(card._scheduler.fixedTimer.active).toBe(true);
      const renderSpy = vi.spyOn(card, "_render");
      vi.advanceTimersByTime(10_000);
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });

    it("re-renders on re-attach, but not on a first attach", () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection], fixed_refresh: 10 });
      card.hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      const renderSpy = vi.spyOn(card, "_render");
      card.connectedCallback(); // tracked ids still set: nothing to rebuild
      expect(renderSpy).not.toHaveBeenCalled();
      card.disconnectedCallback();
      card.connectedCallback();
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });

    it("restarts the debug timer on connectedCallback after disconnect", () => {
      const card = makeCard();
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card.setConfig({ sections: [nbaSection], fixed_refresh: 10, debug: true });
      card.disconnectedCallback();
      card.connectedCallback();
      expect(card._scheduler.debugTimer.active).toBe(true);
    });

    it("connectedCallback without config leaves the fixed timer stopped", () => {
      const card = makeCard();
      card.connectedCallback();
      expect(card._scheduler.fixedTimer.active).toBe(false);
    });

    it("nulls _scheduler.trackedIds on disconnectedCallback so tracking rebuilds on re-insertion", () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection] });
      card.hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      expect(card._scheduler.trackedIds).not.toBeNull();
      card.disconnectedCallback();
      expect(card._scheduler.trackedIds).toBeNull();
    });

    it("does not render when timer fires before hass is assigned", () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection], fixed_refresh: 10 });
      const renderSpy = vi.spyOn(card, "_render");

      vi.advanceTimersByTime(10_000);
      expect(renderSpy).not.toHaveBeenCalled();
    });

    it("does not fire after disconnectedCallback", () => {
      const card = makeCard();
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card.setConfig({ sections: [nbaSection], fixed_refresh: 10 });
      const renderSpy = vi.spyOn(card, "_render");

      card.disconnectedCallback();
      vi.advanceTimersByTime(30_000);
      expect(renderSpy).not.toHaveBeenCalled();
    });
  });
  describe("hass updates", () => {
    useFakeTimers();

    const setup = (cfg: object) => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection], ...cfg });
      card.hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      return card;
    };
    const change = (card: ReturnType<typeof makeCard>, state = "IN") => {
      card.hass = makeHass({ "sensor.nba_lal": makeState(state, baseAttrs) });
    };

    it("a changed tracked state schedules a lazy render", () => {
      const card = setup({});
      change(card);
      expect(card._scheduler.renderTimer.active).toBe(true);
    });

    it("an unchanged state does not schedule a render", () => {
      const card = setup({});
      card.hass = makeHass({ ...card._hass?.states });
      expect(card._scheduler.renderTimer.active).toBe(false);
    });

    it("lazy_refresh timer triggers render after configured delay", () => {
      const card = setup({ lazy_refresh: 1 });
      const renderSpy = vi.spyOn(card, "_render");
      change(card);
      expect(renderSpy).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1000);
      expect(renderSpy).toHaveBeenCalledTimes(1);
      expect(card._scheduler.renderTimer.active).toBe(false);
    });

    it("lazy_refresh: 0 renders immediately without starting a timer", () => {
      const card = setup({ lazy_refresh: 0 });
      const renderSpy = vi.spyOn(card, "_render");
      change(card);
      expect(renderSpy).toHaveBeenCalledTimes(1);
      expect(card._scheduler.renderTimer.active).toBe(false);
    });

    it("lazy_refresh timer skips render if hass is null when it fires", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], lazy_refresh: 1 };
      card._hass = makeHass({});
      card._scheduler.trackedIds = new Set();
      card._scheduler.scheduleRender();
      card._hass = null;
      const renderSpy = vi.spyOn(card, "_render");
      vi.advanceTimersByTime(1000);
      expect(renderSpy).not.toHaveBeenCalled();
      expect(card._scheduler.renderTimer.active).toBe(false);
    });

    it("multiple changes within lazy_refresh window trigger only one render", () => {
      const card = setup({ lazy_refresh: 1 });
      const renderSpy = vi.spyOn(card, "_render");
      change(card, "IN");
      change(card, "POST");
      change(card, "PRE");
      vi.advanceTimersByTime(1000);
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });

    it("a change after the lazy_refresh window closes schedules a new render", () => {
      const card = setup({ lazy_refresh: 1 });
      const renderSpy = vi.spyOn(card, "_render");
      change(card, "IN");
      vi.advanceTimersByTime(1000);
      expect(renderSpy).toHaveBeenCalledTimes(1);
      change(card, "POST");
      vi.advanceTimersByTime(1000);
      expect(renderSpy).toHaveBeenCalledTimes(2);
    });

    it("disconnectedCallback cancels a pending render timer", () => {
      const card = setup({});
      change(card);
      expect(card._scheduler.renderTimer.active).toBe(true);
      card.disconnectedCallback();
      expect(card._scheduler.renderTimer.active).toBe(false);
    });

    it("setConfig cancels a pending render timer", () => {
      const card = setup({});
      change(card);
      card.setConfig({ sections: [nbaSection] });
      expect(card._scheduler.renderTimer.active).toBe(false);
    });
  });

  describe("debug", () => {
    useFakeTimers();

    it("a relevant change increments events and filtered metrics when debug is true", () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection], debug: true });
      card.hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card.hass = makeHass({ "sensor.nba_lal": makeState("IN", baseAttrs) });
      expect(card._debug.counts("events").hour3).toBe(1);
      expect(card._debug.counts("filtered").hour3).toBe(1);
    });

    it("a relevant change does not increment events when debug is false", () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection] });
      card.hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card.hass = makeHass({ "sensor.nba_lal": makeState("IN", baseAttrs) });
      expect(card._debug.counts("events").hour3).toBe(0);
    });

    it("_scheduleRender increments filtered when debug is true and no timer is active", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], debug: true, lazy_refresh: 1 };
      card._hass = makeHass({});
      card._scheduler.trackedIds = new Set();
      card._scheduler.scheduleRender();
      expect(card._debug.counts("filtered").hour3).toBe(1);
    });

    it("_scheduleRender does not increment filtered when timer is already active", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], debug: true, lazy_refresh: 1 };
      card._hass = makeHass({});
      card._scheduler.trackedIds = new Set();
      card._scheduler.scheduleRender();
      card._scheduler.scheduleRender(); // dropped — timer active
      expect(card._debug.counts("filtered").hour3).toBe(1);
    });

    it("_render increments rendered metric when debug is true", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], debug: true };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(card._debug.counts("rendered").hour3).toBe(1);
    });

    it("_render does not increment rendered when debug is false", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(card._debug.counts("rendered").hour3).toBe(0);
    });

    it("debug pane is present in rendered HTML when debug is true", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], debug: true };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(card.shadowRoot?.innerHTML).toContain("events");
      expect(card.shadowRoot?.innerHTML).toContain("filtered");
      expect(card.shadowRoot?.innerHTML).toContain("rendered");
      expect(card.shadowRoot?.innerHTML).toContain("5m");
      expect(card.shadowRoot?.innerHTML).toContain("15m");
      expect(card.shadowRoot?.innerHTML).toContain("30m");
      expect(card.shadowRoot?.innerHTML).toContain("1h");
      expect(card.shadowRoot?.innerHTML).toContain("3h");
    });

    it("debug pane is positioned at the bottom", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], debug: true };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(card.shadowRoot?.innerHTML).toContain("bottom:0");
    });

    it("debug pane shows last render timestamp", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], debug: true };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      const fixed = new Date("2026-06-13T10:01:46.123Z");
      vi.setSystemTime(fixed);
      card._render();
      const pad = (n: number, w = 2) => String(n).padStart(w, "0");
      const expected = `${pad(fixed.getHours())}:${pad(fixed.getMinutes())}:${pad(fixed.getSeconds())}.${pad(fixed.getMilliseconds(), 3)}`;
      expect(card.shadowRoot?.innerHTML).toContain(expected);
    });

    it("in debug mode 1s timer calls _refreshDebugOverlay every second", () => {
      const card = makeCard();
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card.setConfig({ sections: [nbaSection], debug: true, fixed_refresh: 300 });
      const renderSpy = vi.spyOn(card, "_render");
      const refreshSpy = vi.spyOn(card, "_refreshDebugOverlay");
      vi.advanceTimersByTime(999);
      expect(refreshSpy).toHaveBeenCalledTimes(0);
      vi.advanceTimersByTime(1);
      expect(refreshSpy).toHaveBeenCalledTimes(1);
      expect(renderSpy).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1_000);
      expect(refreshSpy).toHaveBeenCalledTimes(2);
    });

    it("in debug mode 1s timer calls _refreshDebugOverlay and does not call _render", () => {
      const card = makeCard();
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card.setConfig({ sections: [nbaSection], debug: true });
      const renderSpy = vi.spyOn(card, "_render");
      const refreshSpy = vi.spyOn(card, "_refreshDebugOverlay");
      vi.advanceTimersByTime(1_000);
      expect(renderSpy).not.toHaveBeenCalled();
      expect(refreshSpy).toHaveBeenCalled();
    });

    it("in debug mode fixed_refresh timer triggers _render", () => {
      const card = makeCard();
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card.setConfig({ sections: [nbaSection], debug: false, fixed_refresh: 10 });
      const renderSpy = vi.spyOn(card, "_render");
      vi.advanceTimersByTime(10_000);
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });

    it("does not call _refreshDebugOverlay when debug timer fires before hass is assigned", () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection], debug: true });
      const refreshSpy = vi.spyOn(card, "_refreshDebugOverlay");
      vi.advanceTimersByTime(1_000);
      expect(refreshSpy).not.toHaveBeenCalled();
    });

    it("clears _scheduler.debugTimer on disconnectedCallback in debug mode", () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection], debug: true });
      expect(card._scheduler.debugTimer.active).toBe(true);
      card.disconnectedCallback();
      expect(card._scheduler.debugTimer.active).toBe(false);
    });

    it("debug pane content updates when _render is called again after tracking", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], debug: true };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      const before = card.shadowRoot?.querySelector("#sc-debug")?.innerHTML;
      vi.advanceTimersByTime(1000);
      card._debug.track("rendered");
      card._render();
      const after = card.shadowRoot?.querySelector("#sc-debug")?.innerHTML;
      expect(after).not.toBe(before);
    });

    it("debug pane is absent when debug is not set", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(card.shadowRoot?.innerHTML).not.toContain("pointer-events:none");
    });

    it("renders the debug pane inside ha-card", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], debug: true };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(card.shadowRoot?.querySelector("#sc-debug")?.closest("ha-card")).not.toBeNull();
    });

    it("debug mode does not show version badge", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], debug: true };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(card.shadowRoot?.querySelector("#sc-version")).toBeNull();
    });

    it("version badge is absent when debug is false", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(card.shadowRoot?.querySelector("#sc-version")).toBeNull();
    });

    it("show_version shows version badge without debug", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], show_version: true };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(card.shadowRoot?.querySelector("#sc-version")).not.toBeNull();
      expect(card.shadowRoot?.querySelector("#sc-debug")).toBeNull();
    });

    it("renders the version badge once, as a direct child of ha-card", () => {
      const card = makeCard();
      card._config = {
        sections: [nbaSection, { name: "NHL", prefix: "sensor.nhl_", special_teams: [] }],
        show_version: true,
      };
      card._hass = makeHass({
        "sensor.nba_lal": makeState("PRE", baseAttrs),
        "sensor.nhl_bos": makeState("PRE", baseAttrs),
      });
      card._render();
      const badges = card.shadowRoot?.querySelectorAll("#sc-version") ?? [];
      expect(badges).toHaveLength(1);
      expect(badges[0]?.parentElement?.tagName.toLowerCase()).toBe("ha-card");
      expect(badges[0]?.closest(".section-header")).toBeNull();
    });

    it("shows the version badge even when the leading section is empty", () => {
      const card = makeCard();
      card._config = {
        sections: [
          { name: "Empty", prefix: "sensor.mlb_", special_teams: [] },
          { name: "NHL", prefix: "sensor.nhl_", special_teams: [] },
        ],
        show_version: true,
      };
      card._hass = makeHass({ "sensor.nhl_bos": makeState("PRE", baseAttrs) });
      card._render();
      expect(card.shadowRoot?.querySelectorAll("#sc-version")).toHaveLength(1);
    });

    it("keeps the version badge when no section has games", () => {
      const card = makeCard();
      card._config = {
        sections: [{ name: "Empty", prefix: "sensor.mlb_", special_teams: [] }],
        show_version: true,
      };
      card._hass = makeHass({ "sensor.nhl_bos": makeState("PRE", baseAttrs) });
      card._render();
      expect(card.shadowRoot?.querySelector("#sc-version")).not.toBeNull();
      expect(card.shadowRoot?.querySelector(".empty")).not.toBeNull();
    });
  });
  describe("_refreshDebugOverlay", () => {
    it("patches #sc-debug innerHTML without invoking _render", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], debug: true };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._scheduler.trackedIds = new Set();
      card._render();
      const renderSpy = vi.spyOn(card, "_render");
      const tableSpy = vi.spyOn(card._debug, "tableHtml");
      card._refreshDebugOverlay();
      expect(renderSpy).not.toHaveBeenCalled();
      expect(tableSpy).toHaveBeenCalled();
      expect(card.shadowRoot?.querySelector("#sc-debug")).not.toBeNull();
    });

    it("does nothing when #sc-debug is absent", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._scheduler.trackedIds = new Set();
      card._render();
      expect(() => card._refreshDebugOverlay()).not.toThrow();
    });
  });

  describe("_showError", () => {
    it("renders error message in shadow DOM", () => {
      const card = makeCard();
      card._showError("Something went wrong");
      expect(card.shadowRoot?.innerHTML).toContain("Something went wrong");
      expect(card.shadowRoot?.innerHTML).toContain("ha-card");
    });

    it("escapes HTML in the error message", () => {
      const card = makeCard();
      card._showError("<script>alert(1)</script>");
      expect(card.shadowRoot?.innerHTML).toContain("&lt;script&gt;");
      expect(card.shadowRoot?.innerHTML).not.toContain("<script>alert");
    });
  });
});
