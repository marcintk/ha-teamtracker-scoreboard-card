import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../src/index.js";
import type { SportScoreboardCard } from "../src/index.js";
import type { GameAttr, HassStates, HomeAssistant } from "../src/types.js";

type SubscribeCallback = (event: { data: { entity_id: string } }) => void;
const getCallback = (fn: ReturnType<typeof vi.fn>): SubscribeCallback =>
  (fn.mock.calls as [[SubscribeCallback]])[0][0];

const makeHass = (states: HassStates = {}): HomeAssistant =>
  ({ states }) as unknown as HomeAssistant;
const makeState = (state: string, attrs: GameAttr = {}) => ({ state, attributes: attrs });

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

const nbaSection = {
  name: "NBA",
  prefix: "sensor.nba_",
  limit: 10,
  special_teams: [] as string[],
  rank_type: "win-loss" as const,
  view: "standings" as const,
};

function makeCard(): SportScoreboardCard {
  return document.createElement("ha-teamtracker-scoreboard-card") as unknown as SportScoreboardCard;
}

function makeHassWithConnection(states: HassStates = {}) {
  const unsub = vi.fn();
  const connection = { subscribeEvents: vi.fn().mockResolvedValue(unsub) };
  return { hass: { states, connection } as unknown as HomeAssistant, unsub, connection };
}

describe("SportScoreboardCard", () => {
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
      card._config = { height: "475px" };
      expect(card.getCardSize()).toBe(10);
    });

    it("rounds up fractional rows", () => {
      const card = makeCard();
      card._config = { height: "51px" };
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
      card._config = { sections: [{ limit: 10 }], row_height: "40px" };
      // 11 rows * (40 + 2*5 gap) = 550px / 50 = 11
      expect(card.getCardSize()).toBe(11);
    });

    it("falls back to 28px row height when row_height is non-numeric", () => {
      const card = makeCard();
      card._config = { sections: [{ limit: 10 }], row_height: "auto" };
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
      card._config = { height: "50%", sections: [{ limit: 10 }] };
      expect(card.getCardSize()).toBe(9);
    });

    it("falls back to section-based size when height is non-numeric", () => {
      const card = makeCard();
      card._config = { height: "auto", sections: [{ limit: 10 }] };
      const size = card.getCardSize();
      expect(Number.isFinite(size)).toBe(true);
      expect(size).toBeGreaterThanOrEqual(1);
    });
  });

  describe("_hasRelevantChange", () => {
    it("returns true when prevHass is null (no prior state to compare)", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      card._trackedIds = new Set(["sensor.nba_lal"]);
      expect(card._hasRelevantChange(makeHass({}), null)).toBe(true);
    });

    it("returns true when config is null", () => {
      const card = makeCard();
      card._config = null;
      card._trackedIds = new Set(["sensor.nba_lal"]);
      const hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      expect(card._hasRelevantChange(hass, hass)).toBe(true);
    });
  });

  describe("_buildTrackedIds", () => {
    it("populates _trackedIds with entity IDs matching configured prefixes", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      card._buildTrackedIds(["sensor.nba_lal", "sensor.nhl_bos", "sensor.weather_london"]);
      expect(card._trackedIds?.has("sensor.nba_lal")).toBe(true);
      expect(card._trackedIds?.has("sensor.nhl_bos")).toBe(false);
      expect(card._trackedIds?.has("sensor.weather_london")).toBe(false);
    });

    it("produces an empty set when no prefix matches", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      card._buildTrackedIds(["sensor.weather_london", "sensor.sun"]);
      expect(card._trackedIds?.size).toBe(0);
    });

    it("produces an empty set when config has no sections", () => {
      const card = makeCard();
      card._config = {};
      card._buildTrackedIds(["sensor.nba_lal"]);
      expect(card._trackedIds?.size).toBe(0);
    });

    it("matches all entities when section has no prefix", () => {
      const card = makeCard();
      card._config = { sections: [{ name: "All" }] };
      card._buildTrackedIds(["sensor.nba_lal", "sensor.weather"]);
      expect(card._trackedIds?.size).toBe(2);
    });

    it("rebuilds _trackedIds when an entity swaps in at the same total count", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      card._buildTrackedIds(["sensor.nba_lal", "sensor.weather"]);
      expect(card._trackedIds?.has("sensor.nba_lal")).toBe(true);
      // same count, different entity — must rebuild
      card._buildTrackedIds(["sensor.nba_bos", "sensor.weather"]);
      expect(card._trackedIds?.has("sensor.nba_bos")).toBe(true);
      expect(card._trackedIds?.has("sensor.nba_lal")).toBe(false);
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

    it("invalidates _trackedIds so it is rebuilt on the next hass push", () => {
      const card = makeCard();
      card._trackedIds = new Set(["sensor.nba_lal"]);
      card.setConfig({ sections: [nbaSection] });
      expect(card._trackedIds).toBeNull();
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

    it("builds _trackedIds on first assignment", () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection] });
      card.hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      expect(card._trackedIds).toBeInstanceOf(Set);
      expect(card._trackedIds?.has("sensor.nba_lal")).toBe(true);
    });

    it("refreshes _trackedIds on render so newly-added sensors are picked up", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._trackedIds = new Set(); // simulate stale empty cache
      card._render();
      expect(card._trackedIds?.has("sensor.nba_lal")).toBe(true);
    });

    it("skips _trackedIds rebuild when already populated and no render follows", () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection] });
      const stateObj = makeState("PRE", baseAttrs);
      // first push: builds _trackedIds and renders
      card.hass = makeHass({ "sensor.nba_lal": stateObj });
      const setAfterRender = card._trackedIds;
      // second push: same state reference — no change, no render, guard skipped
      card.hass = makeHass({ "sensor.nba_lal": stateObj });
      expect(card._trackedIds).toBe(setAfterRender);
    });

    it("skips render when no relevant entity changed", () => {
      const card = makeCard();
      const stateObj = makeState("PRE", baseAttrs);
      card.setConfig({ sections: [nbaSection], lazy_refresh: 0 });
      card.hass = makeHass({ "sensor.nba_lal": stateObj }); // first call: builds _trackedIds
      const renderSpy = vi.spyOn(card, "_render");
      // same state object reference — fallback diffing returns false, no render
      card.hass = makeHass({ "sensor.nba_lal": stateObj });
      expect(renderSpy).not.toHaveBeenCalled();
    });

    it("treats missing sections as empty prefix list when checking relevance", () => {
      const card = makeCard();
      // pre-set _trackedIds so the first-call branch is bypassed
      card._trackedIds = new Set(); // empty — no sections to match
      card._hass = makeHass({});
      card._config = {}; // no sections key — hits the ?? [] fallback
      const renderSpy = vi.spyOn(card, "_render");
      card.hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      // empty _trackedIds → _hasRelevantChange returns false → no render
      expect(renderSpy).not.toHaveBeenCalled();
    });

    it("re-renders when a relevant entity state changes", () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection], lazy_refresh: 0 });
      // first call: builds _trackedIds; makeHass has no connection so _unsubscribe stays null
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
      card._config = { sections: [nbaSection], height: "300px" };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(card.shadowRoot?.innerHTML).toContain("300px");
    });

    it("handles non-numeric height gracefully without setting row budget", () => {
      const card = makeCard();
      card._config = { sections: [{ ...nbaSection, limit: 5 }], height: "auto" };
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
        sections: [{ ...nbaSection, special_teams: ["lal"] }],
        colors: { special: "gold" },
      };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(card.shadowRoot?.innerHTML).toContain("gold");
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
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("starts fixedTimer with default 60-second interval when refresh is omitted", () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection] });
      expect(card._fixedTimer).not.toBeNull();
    });

    it("fixed_refresh: 0 does not start a fixed timer", () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection], fixed_refresh: 0 });
      expect(card._fixedTimer).toBeNull();
    });

    it("starts fixedTimer at custom fixed_refresh interval", () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection], fixed_refresh: 60 });
      expect(card._fixedTimer).not.toBeNull();
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
      card.setConfig({ sections: [nbaSection], fixed_refresh: 30 });
      const firstTimer = card._fixedTimer;
      card.setConfig({ sections: [nbaSection], fixed_refresh: 60 });
      expect(card._fixedTimer).not.toBe(firstTimer);
    });

    it("clears the timer on disconnectedCallback", () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection], fixed_refresh: 30 });
      card.disconnectedCallback();
      expect(card._fixedTimer).toBeNull();
    });

    it("nulls _trackedIds on disconnectedCallback so subscription re-establishes on re-insertion", () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection] });
      card.hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      expect(card._trackedIds).not.toBeNull();
      card.disconnectedCallback();
      expect(card._trackedIds).toBeNull();
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

  describe("slide_sec carousel", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    // slide_sec / _slideIndex / _slideTimer do not exist on the type yet.
    type SlideConfig = NonNullable<SportScoreboardCard["_config"]> & { slide_sec?: number };
    type SlideCard = SportScoreboardCard & {
      _slideIndex: number;
      _slideTimer: ReturnType<typeof setInterval> | null;
    };
    const asSlide = (c: SportScoreboardCard) => c as unknown as SlideCard;

    const nhlSection = {
      name: "NHL",
      prefix: "sensor.nhl_",
      limit: 5,
      special_teams: [] as string[],
      rank_type: "win-loss-otl" as const,
      view: "standings" as const,
    };

    // In carousel mode the header wraps the name in `.section-title` alongside the
    // control buttons; stacked headers put the name directly in `.section-header`.
    const headerTexts = (c: SportScoreboardCard) =>
      Array.from(c.shadowRoot?.querySelectorAll(".section-header") ?? []).map(
        (el) => (el.querySelector(".section-title") ?? el).textContent
      );

    const twoSectionHass = () =>
      makeHass({
        "sensor.nba_lal": makeState("PRE", baseAttrs),
        "sensor.nhl_bos": makeState("PRE", baseAttrs),
      });

    it("renders every section header stacked when slide_sec is unset", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection, nhlSection] };
      card._hass = twoSectionHass();
      card._render();
      expect(headerTexts(card)).toEqual(["NBA", "NHL"]);
    });

    it("with a single section renders one header and arms no slide timer", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], mode: "slide", slide_sec: 30 } as SlideConfig;
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(headerTexts(card)).toEqual(["NBA"]);
      expect(asSlide(card)._slideTimer).toBeNull();
    });

    it("with two sections renders only the first section", () => {
      const card = makeCard();
      card._config = {
        sections: [nbaSection, nhlSection],
        mode: "slide",
        slide_sec: 30,
      } as SlideConfig;
      card._hass = twoSectionHass();
      card._render();
      expect(headerTexts(card)).toEqual(["NBA"]);
    });

    it("auto-advances to the next section after slide_sec seconds", () => {
      const card = makeCard();
      card._config = {
        sections: [nbaSection, nhlSection],
        mode: "slide",
        slide_sec: 30,
      } as SlideConfig;
      card._hass = twoSectionHass();
      card._render();

      vi.advanceTimersByTime(30_000);
      expect(headerTexts(card)).toEqual(["NHL"]);
    });

    it("wraps back to the first section after the last", () => {
      const card = makeCard();
      card._config = {
        sections: [nbaSection, nhlSection],
        mode: "slide",
        slide_sec: 30,
      } as SlideConfig;
      card._hass = twoSectionHass();
      card._render();

      vi.advanceTimersByTime(30_000);
      expect(headerTexts(card)).toEqual(["NHL"]);
      vi.advanceTimersByTime(30_000);
      expect(headerTexts(card)).toEqual(["NBA"]);
    });

    it("keeps _slideIndex across a manual _render() call", () => {
      const card = makeCard();
      card._config = {
        sections: [nbaSection, nhlSection],
        mode: "slide",
        slide_sec: 30,
      } as SlideConfig;
      card._hass = twoSectionHass();
      asSlide(card)._slideIndex = 1;
      card._render();
      expect(headerTexts(card)).toEqual(["NHL"]);
      expect(asSlide(card)._slideIndex).toBe(1);
    });

    it("resets _slideIndex to 0 on setConfig", () => {
      const card = makeCard();
      asSlide(card)._slideIndex = 1;
      card.setConfig({
        sections: [nbaSection, nhlSection],
        mode: "slide",
        slide_sec: 30,
      } as SlideConfig);
      expect(asSlide(card)._slideIndex).toBe(0);
    });

    it("clears _slideTimer on disconnectedCallback and it does not fire afterward", () => {
      const card = makeCard();
      card._hass = twoSectionHass();
      card.setConfig({
        sections: [nbaSection, nhlSection],
        mode: "slide",
        slide_sec: 30,
      } as SlideConfig);
      card._render();
      const renderSpy = vi.spyOn(card, "_render");

      card.disconnectedCallback();
      expect(asSlide(card)._slideTimer).toBeNull();

      vi.advanceTimersByTime(60_000);
      expect(renderSpy).not.toHaveBeenCalled();
    });

    it("getCardSize returns the largest single section (not the sum) in carousel mode", () => {
      const carousel = makeCard();
      carousel._config = {
        sections: [
          { ...nbaSection, limit: 10 },
          { ...nhlSection, limit: 4 },
        ],
        mode: "slide",
        slide_sec: 30,
      } as SlideConfig;
      // maxRows = 11; h = 28 + 2*5 gap = 38 => ceil(11 * 38 / 50) = ceil(8.36) = 9
      expect(carousel.getCardSize()).toBe(9);

      const stacked = makeCard();
      stacked._config = {
        sections: [
          { ...nbaSection, limit: 10 },
          { ...nhlSection, limit: 4 },
        ],
      };
      // sum: 16 rows * 38 = 608 => ceil(608 / 50) = 13
      expect(stacked.getCardSize()).toBe(13);
      expect(carousel.getCardSize()).toBeLessThan(stacked.getCardSize());
    });

    it("adds a tallest-slide min-height to ha-card when height is unset", () => {
      const card = makeCard();
      card._config = {
        sections: [nbaSection, nhlSection],
        mode: "slide",
        slide_sec: 30,
      } as SlideConfig;
      card._hass = twoSectionHass();
      card._render();
      const style = card.shadowRoot?.querySelector("ha-card")?.getAttribute("style") ?? "";
      // maxRows = 1 + 10 = 11; h = 28 + 2*5 padding => 11 * 38 = 418
      expect(style).toContain("min-height:418px");
    });

    it("factors layout.row_padding into the carousel min-height", () => {
      const card = makeCard();
      card._config = {
        sections: [nbaSection, nhlSection],
        mode: "slide",
        slide_sec: 30,
        layout: { row_padding: "10px" },
      } as SlideConfig;
      card._hass = twoSectionHass();
      card._render();
      const style = card.shadowRoot?.querySelector("ha-card")?.getAttribute("style") ?? "";
      // h = 28 + 2*10 = 48 => 11 * 48 = 528
      expect(style).toContain("min-height:528px");
    });

    it("lets an explicit height win over the carousel min-height", () => {
      const card = makeCard();
      card._config = {
        sections: [nbaSection, nhlSection],
        mode: "slide",
        slide_sec: 30,
        height: "400px",
      } as SlideConfig;
      card._hass = twoSectionHass();
      card._render();
      const style = card.shadowRoot?.querySelector("ha-card")?.getAttribute("style") ?? "";
      expect(style).toContain("min-height:400px");
      expect(style).not.toContain("418px");
    });

    it("adds no carousel min-height when slide_sec is unset", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection, nhlSection] };
      card._hass = twoSectionHass();
      card._render();
      const style = card.shadowRoot?.querySelector("ha-card")?.getAttribute("style") ?? "";
      expect(style).not.toContain("min-height");
    });
  });

  describe("slide_sec controls", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    type SlideConfig = NonNullable<SportScoreboardCard["_config"]> & { slide_sec?: number };
    type SlideCard = SportScoreboardCard & {
      _slideIndex: number;
      _slideTimer: ReturnType<typeof setInterval> | null;
      _slidePaused: boolean;
    };
    const asSlide = (c: SportScoreboardCard) => c as unknown as SlideCard;

    const nhlSection = {
      name: "NHL",
      prefix: "sensor.nhl_",
      limit: 5,
      special_teams: [] as string[],
      rank_type: "win-loss-otl" as const,
      view: "standings" as const,
    };

    const twoSectionHass = () =>
      makeHass({
        "sensor.nba_lal": makeState("PRE", baseAttrs),
        "sensor.nhl_bos": makeState("PRE", baseAttrs),
      });

    const carouselCard = () => {
      const card = makeCard();
      card._config = {
        sections: [nbaSection, nhlSection],
        mode: "slide",
        slide_sec: 30,
      } as SlideConfig;
      card._hass = twoSectionHass();
      card._render();
      return card;
    };

    const slideButtons = (c: SportScoreboardCard) =>
      Array.from(c.shadowRoot?.querySelectorAll<HTMLButtonElement>(".section-header button") ?? []);

    const ctrl = (c: SportScoreboardCard, title: string) =>
      c.shadowRoot?.querySelector<HTMLButtonElement>(`.section-header button[title="${title}"]`);

    const headerText = (c: SportScoreboardCard) =>
      c.shadowRoot?.querySelector(".section-header")?.textContent ?? "";

    it("renders exactly three slide-btn buttons in the header in carousel mode", () => {
      const card = carouselCard();
      const buttons = slideButtons(card);
      expect(buttons).toHaveLength(3);
      for (const b of buttons) expect(b.classList.contains("slide-btn")).toBe(true);
    });

    it("orders the buttons Previous / Stop / Next by title", () => {
      const card = carouselCard();
      const titles = slideButtons(card).map((b) => b.getAttribute("title"));
      expect(titles).toEqual(["Previous section", "Stop rotation", "Next section"]);
    });

    it("renders no header buttons when slide_sec is unset", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection, nhlSection] };
      card._hass = twoSectionHass();
      card._render();
      expect(slideButtons(card)).toHaveLength(0);
    });

    it("renders no header buttons with a single section even when slide_sec is set", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], mode: "slide", slide_sec: 30 } as SlideConfig;
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(slideButtons(card)).toHaveLength(0);
    });

    it("clicking Next section advances to the second section", () => {
      const card = carouselCard();
      expect(headerText(card)).toContain("NBA");
      ctrl(card, "Next section")?.click();
      expect(headerText(card)).toContain("NHL");
    });

    it("clicking Next section on the last section wraps to the first", () => {
      const card = carouselCard();
      ctrl(card, "Next section")?.click();
      expect(headerText(card)).toContain("NHL");
      ctrl(card, "Next section")?.click();
      expect(headerText(card)).toContain("NBA");
    });

    it("clicking Previous section on the first section wraps to the last", () => {
      const card = carouselCard();
      ctrl(card, "Previous section")?.click();
      expect(headerText(card)).toContain("NHL");
    });

    it("clicking Next section pauses rotation and flips the toggle to Resume", () => {
      const card = carouselCard();
      ctrl(card, "Next section")?.click();
      expect(headerText(card)).toContain("NHL");

      vi.advanceTimersByTime(30_000);
      expect(headerText(card)).toContain("NHL");

      const toggle = ctrl(card, "Resume rotation");
      expect(toggle).not.toBeNull();
      expect(toggle?.classList.contains("paused")).toBe(true);
      expect(toggle?.textContent?.trim()).toBe("");
      expect(asSlide(card)._slidePaused).toBe(true);
    });

    it("clicking the Stop toggle while rotating stops the timer", () => {
      const card = carouselCard();
      ctrl(card, "Stop rotation")?.click();

      vi.advanceTimersByTime(30_000);
      expect(headerText(card)).toContain("NBA");
      expect(asSlide(card)._slidePaused).toBe(true);

      const toggle = ctrl(card, "Resume rotation");
      expect(toggle?.textContent?.trim()).toBe("");
      expect(toggle?.classList.contains("paused")).toBe(true);
    });

    it("clicking Resume after a pause restarts the timer", () => {
      const card = carouselCard();
      ctrl(card, "Stop rotation")?.click();
      vi.advanceTimersByTime(30_000);
      expect(headerText(card)).toContain("NBA");

      ctrl(card, "Resume rotation")?.click();
      expect(asSlide(card)._slidePaused).toBe(false);

      vi.advanceTimersByTime(30_000);
      expect(headerText(card)).toContain("NHL");

      const toggle = ctrl(card, "Stop rotation");
      // stop / resume icons are CSS shapes, not glyphs — distinguish by class
      expect(toggle?.textContent?.trim()).toBe("");
      expect(toggle?.classList.contains("toggle")).toBe(true);
      expect(toggle?.classList.contains("paused")).toBe(false);
    });

    it("resets _slidePaused to false on setConfig", () => {
      const card = makeCard();
      asSlide(card)._slidePaused = true;
      card.setConfig({
        sections: [nbaSection, nhlSection],
        mode: "slide",
        slide_sec: 30,
      } as SlideConfig);
      expect(asSlide(card)._slidePaused).toBe(false);
    });
  });

  describe("slide_sec reduced motion", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    type SlideConfig = NonNullable<SportScoreboardCard["_config"]> & { slide_sec?: number };
    type SlideCard = SportScoreboardCard & {
      _slideIndex: number;
      _slideTimer: ReturnType<typeof setInterval> | null;
      _slidePaused: boolean;
    };
    const asSlide = (c: SportScoreboardCard) => c as unknown as SlideCard;

    const nhlSection = {
      name: "NHL",
      prefix: "sensor.nhl_",
      limit: 5,
      special_teams: [] as string[],
      rank_type: "win-loss-otl" as const,
      view: "standings" as const,
    };

    const twoSectionHass = () =>
      makeHass({
        "sensor.nba_lal": makeState("PRE", baseAttrs),
        "sensor.nhl_bos": makeState("PRE", baseAttrs),
      });

    const ctrl = (c: SportScoreboardCard, title: string) =>
      c.shadowRoot?.querySelector<HTMLButtonElement>(`.section-header button[title="${title}"]`);

    const headerText = (c: SportScoreboardCard) =>
      c.shadowRoot?.querySelector(".section-header")?.textContent ?? "";

    const stubMatchMedia = (matches: (q: string) => boolean) =>
      vi.stubGlobal("matchMedia", (q: string) => ({
        matches: matches(q),
        media: q,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {
          return false;
        },
      }));

    const carouselConfig = () =>
      ({ sections: [nbaSection, nhlSection], mode: "slide", slide_sec: 30 }) as SlideConfig;

    it("starts paused when the environment prefers reduced motion", () => {
      stubMatchMedia((q) => q.includes("reduce"));
      const card = makeCard();
      card._hass = twoSectionHass();
      card.setConfig(carouselConfig());
      expect(asSlide(card)._slidePaused).toBe(true);
      expect(asSlide(card)._slideTimer).toBeNull();
    });

    it("does not auto-advance when reduced motion is preferred", () => {
      stubMatchMedia((q) => q.includes("reduce"));
      const card = makeCard();
      card._hass = twoSectionHass();
      card.setConfig(carouselConfig());
      card._render();
      // A rotating carousel would land on the second section after slide_sec.
      vi.advanceTimersByTime(30_000);
      expect(headerText(card)).toContain("NBA");
      expect(headerText(card)).not.toContain("NHL");
      vi.advanceTimersByTime(30_000);
      expect(headerText(card)).toContain("NBA");
    });

    it("renders the toggle in its resume/paused form on first render under reduced motion", () => {
      stubMatchMedia((q) => q.includes("reduce"));
      const card = makeCard();
      card._hass = twoSectionHass();
      card.setConfig(carouselConfig());
      card._render();

      const toggle = ctrl(card, "Resume rotation");
      expect(toggle).not.toBeNull();
      expect(toggle?.classList.contains("paused")).toBe(true);
      expect(toggle?.textContent?.trim()).toBe("");
      expect(ctrl(card, "Stop rotation")).toBeFalsy();
    });

    it("starts rotating when Resume is clicked after a reduced-motion paused start", () => {
      stubMatchMedia((q) => q.includes("reduce"));
      const card = makeCard();
      card._hass = twoSectionHass();
      card.setConfig(carouselConfig());
      card._render();

      // The reduced-motion paused start must surface a Resume control.
      expect(ctrl(card, "Resume rotation")).toBeTruthy();
      ctrl(card, "Resume rotation")?.click();
      expect(asSlide(card)._slidePaused).toBe(false);

      vi.advanceTimersByTime(30_000);
      expect(headerText(card)).toContain("NHL");
    });

    it("rotates normally when matchMedia is present but does not match reduce", () => {
      stubMatchMedia(() => false);
      const card = makeCard();
      card._hass = twoSectionHass();
      card.setConfig(carouselConfig());
      card._render();

      expect(asSlide(card)._slidePaused).toBe(false);
      expect(asSlide(card)._slideTimer).not.toBeNull();

      vi.advanceTimersByTime(30_000);
      expect(headerText(card)).toContain("NHL");
    });

    it("rotates normally when matchMedia is absent (jsdom default)", () => {
      vi.stubGlobal("matchMedia", undefined);
      const card = makeCard();
      card._hass = twoSectionHass();
      card.setConfig(carouselConfig());
      card._render();

      expect(asSlide(card)._slidePaused).toBe(false);
      expect(asSlide(card)._slideTimer).not.toBeNull();

      vi.advanceTimersByTime(30_000);
      expect(headerText(card)).toContain("NHL");
    });
  });

  describe("slide_sec branch coverage", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    type SlideCfg = NonNullable<SportScoreboardCard["_config"]> & { slide_sec?: number };
    type SlideC = SportScoreboardCard & {
      _slideIndex: number;
      _slideTimer: ReturnType<typeof setInterval> | null;
      _slidePaused: boolean;
      _slideStep(dir: number): void;
      _syncSlideTimer(): void;
    };
    const asC = (c: SportScoreboardCard) => c as unknown as SlideC;
    const nhl = { name: "NHL", prefix: "sensor.nhl_", special_teams: [] as string[] };
    const two = [{ name: "NBA", prefix: "sensor.nba_", special_teams: [] as string[] }, nhl];

    it("renders header + empty message + controls for an empty active carousel slide", () => {
      const card = makeCard();
      card._config = { sections: two, mode: "slide", slide_sec: 30 } as SlideCfg;
      // no matching entities at all → active section is empty
      card._hass = makeHass({ "sensor.other_x": makeState("PRE", baseAttrs) });
      card._render();
      const header = card.shadowRoot?.querySelector(".section-header");
      expect(header).not.toBeNull();
      expect(card.shadowRoot?.querySelector(".empty")?.textContent).toContain("No games found");
      expect(card.shadowRoot?.querySelectorAll(".section-header button")).toHaveLength(3);
    });

    it("renders the empty carousel slide when the active section has entities but limit 0", () => {
      const card = makeCard();
      card._config = {
        sections: [{ ...two[0], limit: 0 }, nhl],
        mode: "slide",
        slide_sec: 30,
      } as SlideCfg;
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(card.shadowRoot?.querySelector(".empty")).not.toBeNull();
      expect(card.shadowRoot?.querySelectorAll(".game-row")).toHaveLength(0);
    });

    it("applies colors.header to the carousel (has-controls) header", () => {
      const card = makeCard();
      card._config = {
        sections: two,
        mode: "slide",
        slide_sec: 30,
        colors: { header: "tomato" },
      } as SlideCfg;
      card._hass = makeHass({
        "sensor.nba_lal": makeState("PRE", baseAttrs),
        "sensor.nhl_bos": makeState("PRE", baseAttrs),
      });
      card._render();
      const header = card.shadowRoot?.querySelector(".section-header") as HTMLElement | null;
      expect(header?.getAttribute("style")).toContain("color:tomato");
      expect(header?.classList.contains("has-controls")).toBe(true);
    });

    it("_slideStep is a no-op with fewer than two sections", () => {
      const card = makeCard();
      card._config = { sections: [two[0]], mode: "slide", slide_sec: 30 } as SlideCfg;
      asC(card)._slideIndex = 0;
      expect(() => asC(card)._slideStep(1)).not.toThrow();
      expect(asC(card)._slideIndex).toBe(0);
    });

    it("_slideStep is a no-op with no config", () => {
      const card = makeCard();
      expect(() => asC(card)._slideStep(1)).not.toThrow();
      expect(asC(card)._slideIndex).toBe(0);
    });

    it("computes the min-height from a numeric row_height and the default limit", () => {
      const card = makeCard();
      // no `limit` → maxRows = 1 + 10; row_height 40 + 2*5 gap → 11 * 50 = min-height 550px
      card._config = {
        sections: two,
        mode: "slide",
        slide_sec: 30,
        row_height: "40px",
      } as SlideCfg;
      card._hass = makeHass({
        "sensor.nba_lal": makeState("PRE", baseAttrs),
        "sensor.nhl_bos": makeState("PRE", baseAttrs),
      });
      card._render();
      const style = card.shadowRoot?.querySelector("ha-card")?.getAttribute("style") ?? "";
      expect(style).toContain("min-height:550px");
    });

    it("getCardSize uses the default limit for carousel sections without one", () => {
      const card = makeCard();
      card._config = { sections: two, mode: "slide", slide_sec: 30 } as SlideCfg;
      // maxRows = 11; h = 28 + 2*5 gap = 38 => ceil(11 * 38 / 50) = 9
      expect(card.getCardSize()).toBe(9);
    });

    it("_syncSlideTimer is a no-op when the timer is already running", () => {
      const card = makeCard();
      card._config = { sections: two, mode: "slide", slide_sec: 30 } as SlideCfg;
      card._hass = makeHass({
        "sensor.nba_lal": makeState("PRE", baseAttrs),
        "sensor.nhl_bos": makeState("PRE", baseAttrs),
      });
      card._render();
      const timer = asC(card)._slideTimer;
      expect(timer).not.toBeNull();
      asC(card)._syncSlideTimer();
      expect(asC(card)._slideTimer).toBe(timer);
    });

    it("the rotation interval tolerates the config being torn out from under it", () => {
      const card = makeCard();
      card._config = { sections: two, mode: "slide", slide_sec: 30 } as SlideCfg;
      card._hass = makeHass({
        "sensor.nba_lal": makeState("PRE", baseAttrs),
        "sensor.nhl_bos": makeState("PRE", baseAttrs),
      });
      card._render();
      card._config = null;
      expect(() => vi.advanceTimersByTime(30_000)).not.toThrow();
    });

    it("the rotation interval skips rendering when hass is gone", () => {
      const card = makeCard();
      card._config = { sections: two, mode: "slide", slide_sec: 30 } as SlideCfg;
      card._hass = makeHass({
        "sensor.nba_lal": makeState("PRE", baseAttrs),
        "sensor.nhl_bos": makeState("PRE", baseAttrs),
      });
      card._render();
      const renderSpy = vi.spyOn(card, "_render");
      card._hass = null;
      vi.advanceTimersByTime(30_000);
      // index still advanced, but no re-render fired
      expect(asC(card)._slideIndex).toBe(1);
      expect(renderSpy).not.toHaveBeenCalled();
    });

    it("_syncSlideTimer tolerates a missing config", () => {
      const card = makeCard();
      expect(() => asC(card)._syncSlideTimer()).not.toThrow();
      expect(asC(card)._slideTimer).toBeNull();
    });

    it("defaults to a 45s interval when slide_sec is omitted", () => {
      const card = makeCard();
      card._config = { sections: two, mode: "slide" } as SlideCfg;
      card._hass = makeHass({
        "sensor.nba_lal": makeState("PRE", baseAttrs),
        "sensor.nhl_bos": makeState("PRE", baseAttrs),
      });
      card._render();
      vi.advanceTimersByTime(44_000);
      expect(asC(card)._slideIndex).toBe(0);
      vi.advanceTimersByTime(1_000);
      expect(asC(card)._slideIndex).toBe(1);
    });

    it("falls back to 45s when slide_sec is zero or negative", () => {
      const card = makeCard();
      card._config = { sections: two, mode: "slide", slide_sec: -5 } as SlideCfg;
      card._hass = makeHass({
        "sensor.nba_lal": makeState("PRE", baseAttrs),
        "sensor.nhl_bos": makeState("PRE", baseAttrs),
      });
      card._render();
      vi.advanceTimersByTime(45_000);
      expect(asC(card)._slideIndex).toBe(1);
    });
  });

  describe("subscription", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("calls subscribeEvents on first hass assignment in auto mode", async () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection] });
      const { hass, connection } = makeHassWithConnection({
        "sensor.nba_lal": makeState("PRE", baseAttrs),
      });
      card.hass = hass;
      await Promise.resolve();
      expect(connection.subscribeEvents).toHaveBeenCalledWith(
        expect.any(Function),
        "state_changed"
      );
    });

    it("stores the unsubscribe function after subscription resolves", async () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection] });
      const { hass } = makeHassWithConnection({
        "sensor.nba_lal": makeState("PRE", baseAttrs),
      });
      card.hass = hass;
      await Promise.resolve();
      expect(card._subscription.active).toBe(true);
    });

    it("WS callback schedules render via _renderTimer for a tracked entity", async () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection] });
      const { hass, connection } = makeHassWithConnection({
        "sensor.nba_lal": makeState("PRE", baseAttrs),
      });
      card.hass = hass;
      await Promise.resolve();
      const callback = getCallback(connection.subscribeEvents);
      callback({ data: { entity_id: "sensor.nba_lal" } });
      expect(card._renderTimer).not.toBeNull();
    });

    it("WS callback does not schedule render for an untracked entity", async () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection] });
      const { hass, connection } = makeHassWithConnection({
        "sensor.nba_lal": makeState("PRE", baseAttrs),
      });
      card.hass = hass;
      await Promise.resolve();
      const callback = getCallback(connection.subscribeEvents);
      callback({ data: { entity_id: "sensor.weather_london" } });
      expect(card._renderTimer).toBeNull();
    });

    it("lazy_refresh timer triggers render after configured delay", async () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection], lazy_refresh: 1 });
      const { hass, connection } = makeHassWithConnection({
        "sensor.nba_lal": makeState("PRE", baseAttrs),
      });
      card.hass = hass;
      await Promise.resolve();
      const callback = getCallback(connection.subscribeEvents);
      const renderSpy = vi.spyOn(card, "_render");
      callback({ data: { entity_id: "sensor.nba_lal" } });
      expect(renderSpy).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1000);
      expect(renderSpy).toHaveBeenCalledTimes(1);
      expect(card._renderTimer).toBeNull();
    });

    it("lazy_refresh: 0 renders immediately without starting a timer", async () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection], lazy_refresh: 0 });
      const { hass, connection } = makeHassWithConnection({
        "sensor.nba_lal": makeState("PRE", baseAttrs),
      });
      card.hass = hass;
      await Promise.resolve();
      const callback = getCallback(connection.subscribeEvents);
      const renderSpy = vi.spyOn(card, "_render");
      callback({ data: { entity_id: "sensor.nba_lal" } });
      expect(renderSpy).toHaveBeenCalledTimes(1);
      expect(card._renderTimer).toBeNull();
    });

    it("lazy_refresh timer skips render if hass is null when it fires", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], lazy_refresh: 1 };
      card._hass = makeHass({});
      card._trackedIds = new Set();
      card._scheduleRender();
      card._hass = null;
      const renderSpy = vi.spyOn(card, "_render");
      vi.advanceTimersByTime(1000);
      expect(renderSpy).not.toHaveBeenCalled();
      expect(card._renderTimer).toBeNull();
    });

    it("multiple events within lazy_refresh window trigger only one render", async () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection], lazy_refresh: 1 });
      const { hass, connection } = makeHassWithConnection({
        "sensor.nba_lal": makeState("PRE", baseAttrs),
      });
      card.hass = hass;
      await Promise.resolve();
      const callback = getCallback(connection.subscribeEvents);
      const renderSpy = vi.spyOn(card, "_render");
      callback({ data: { entity_id: "sensor.nba_lal" } });
      callback({ data: { entity_id: "sensor.nba_lal" } });
      callback({ data: { entity_id: "sensor.nba_lal" } });
      vi.advanceTimersByTime(1000);
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });

    it("second event after lazy_refresh window closes schedules a new render", async () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection], lazy_refresh: 1 });
      const { hass, connection } = makeHassWithConnection({
        "sensor.nba_lal": makeState("PRE", baseAttrs),
      });
      card.hass = hass;
      await Promise.resolve();
      const callback = getCallback(connection.subscribeEvents);
      const renderSpy = vi.spyOn(card, "_render");
      callback({ data: { entity_id: "sensor.nba_lal" } });
      vi.advanceTimersByTime(1000);
      expect(renderSpy).toHaveBeenCalledTimes(1);
      callback({ data: { entity_id: "sensor.nba_lal" } });
      vi.advanceTimersByTime(1000);
      expect(renderSpy).toHaveBeenCalledTimes(2);
    });

    it("_clearSubscription calls unsub, nulls _unsub, cancels _renderTimer", async () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection] });
      const { hass, unsub, connection } = makeHassWithConnection({
        "sensor.nba_lal": makeState("PRE", baseAttrs),
      });
      card.hass = hass;
      await Promise.resolve();
      const callback = getCallback(connection.subscribeEvents);
      callback({ data: { entity_id: "sensor.nba_lal" } });
      expect(card._renderTimer).not.toBeNull();
      card._clearSubscription();
      expect(unsub).toHaveBeenCalledTimes(1);
      expect(card._subscription.active).toBe(false);
      expect(card._renderTimer).toBeNull();
    });

    it("stale callback does not schedule render after _clearSubscription", async () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection] });
      const { hass, connection } = makeHassWithConnection({
        "sensor.nba_lal": makeState("PRE", baseAttrs),
      });
      card.hass = hass;
      await Promise.resolve();
      const staleCallback = getCallback(connection.subscribeEvents);
      card._clearSubscription();
      staleCallback({ data: { entity_id: "sensor.nba_lal" } });
      expect(card._renderTimer).toBeNull();
    });

    it("disconnectedCallback unsubscribes from WS", async () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection] });
      const { hass, unsub } = makeHassWithConnection({
        "sensor.nba_lal": makeState("PRE", baseAttrs),
      });
      card.hass = hass;
      await Promise.resolve();
      card.disconnectedCallback();
      expect(unsub).toHaveBeenCalledTimes(1);
      expect(card._subscription.active).toBe(false);
    });

    it("setConfig with active subscription unsubscribes then re-subscribes", async () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection] });
      const { hass, unsub, connection } = makeHassWithConnection({
        "sensor.nba_lal": makeState("PRE", baseAttrs),
      });
      card.hass = hass;
      await Promise.resolve();
      expect(unsub).not.toHaveBeenCalled();
      card.setConfig({ sections: [nbaSection] });
      expect(unsub).toHaveBeenCalledTimes(1);
      await Promise.resolve();
      expect(connection.subscribeEvents).toHaveBeenCalledTimes(2);
    });

    it("does not retain stale subscription handle when clearSubscription fires before promise resolves", async () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection] });
      const { hass, unsub } = makeHassWithConnection({
        "sensor.nba_lal": makeState("PRE", baseAttrs),
      });
      card.hass = hass;
      // clear before the promise resolves — simulates rapid setConfig or disconnect
      card._clearSubscription();
      await Promise.resolve();
      // stale .then() must call unsub() to clean up, not store it
      expect(unsub).toHaveBeenCalledTimes(1);
      expect(card._subscription.active).toBe(false);
    });

    it("silently ignores subscribeEvents rejection and falls back to diffing", async () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection] });
      const connection = { subscribeEvents: vi.fn().mockRejectedValue(new Error("ws error")) };
      card.hass = { states: { "sensor.nba_lal": makeState("PRE", baseAttrs) }, connection };
      await Promise.resolve();
      await Promise.resolve(); // let rejection propagate through .catch
      expect(card._subscription.active).toBe(false);
    });

    it("new connection object triggers re-subscribe (HA reconnect)", async () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection] });
      const { hass: hass1, unsub: unsub1 } = makeHassWithConnection({
        "sensor.nba_lal": makeState("PRE", baseAttrs),
      });
      card.hass = hass1;
      await Promise.resolve();

      const { hass: hass2, connection: conn2 } = makeHassWithConnection({
        "sensor.nba_lal": makeState("IN", baseAttrs),
      });
      card.hass = hass2;
      await Promise.resolve();

      expect(unsub1).toHaveBeenCalledTimes(1);
      expect(conn2.subscribeEvents).toHaveBeenCalledOnce();
    });
  });

  describe("debug", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("WS event increments events metric when debug is true", async () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection], debug: true });
      const { hass, connection } = makeHassWithConnection({
        "sensor.nba_lal": makeState("PRE", baseAttrs),
      });
      card.hass = hass;
      await Promise.resolve();
      const callback = getCallback(connection.subscribeEvents);
      callback({ data: { entity_id: "sensor.nba_lal" } });
      expect(card._debug.counts("events").hour3).toBe(1);
    });

    it("WS event does not increment events when debug is false", async () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection] });
      const { hass, connection } = makeHassWithConnection({
        "sensor.nba_lal": makeState("PRE", baseAttrs),
      });
      card.hass = hass;
      await Promise.resolve();
      const callback = getCallback(connection.subscribeEvents);
      callback({ data: { entity_id: "sensor.nba_lal" } });
      expect(card._debug.counts("events").hour3).toBe(0);
    });

    it("_scheduleRender increments filtered when debug is true and no timer is active", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], debug: true, lazy_refresh: 1 };
      card._hass = makeHass({});
      card._trackedIds = new Set();
      card._scheduleRender();
      expect(card._debug.counts("filtered").hour3).toBe(1);
    });

    it("_scheduleRender does not increment filtered when timer is already active", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], debug: true, lazy_refresh: 1 };
      card._hass = makeHass({});
      card._trackedIds = new Set();
      card._scheduleRender();
      card._scheduleRender(); // dropped — timer active
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

    it("clears _debugTimer on disconnectedCallback in debug mode", () => {
      const card = makeCard();
      card.setConfig({ sections: [nbaSection], debug: true });
      expect(card._debugTimer).not.toBeNull();
      card.disconnectedCallback();
      expect(card._debugTimer).toBeNull();
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

  describe("team_col_width", () => {
    const haCardStyle = (card: ReturnType<typeof makeCard>) =>
      card.shadowRoot?.querySelector("ha-card")?.getAttribute("style") ?? "";

    it("team_col_width alias sets both sides", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], team_col_width: "130px" };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(haCardStyle(card)).toContain("--ttsc-team-col-a-width:130px");
      expect(haCardStyle(card)).toContain("--ttsc-team-col-b-width:130px");
    });

    it("does not emit --ttsc-team-col-a/b-width when omitted", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(haCardStyle(card)).not.toContain("--ttsc-team-col-a-width");
      expect(haCardStyle(card)).not.toContain("--ttsc-team-col-b-width");
    });
  });

  describe("team_width", () => {
    const haCardStyle = (card: ReturnType<typeof makeCard>) =>
      card.shadowRoot?.querySelector("ha-card")?.getAttribute("style") ?? "";

    it("string value sets both sides", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], team_width: "120px" };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(haCardStyle(card)).toContain("--ttsc-team-col-a-width:120px");
      expect(haCardStyle(card)).toContain("--ttsc-team-col-b-width:120px");
    });

    it("team_width wins over team_col_width when both are set", () => {
      const card = makeCard();
      card._config = {
        sections: [nbaSection],
        team_width: "120px",
        team_col_width: "200px",
      };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(haCardStyle(card)).toContain("--ttsc-team-col-a-width:120px");
      expect(haCardStyle(card)).toContain("--ttsc-team-col-b-width:120px");
      expect(haCardStyle(card)).not.toContain("200px");
    });

    it("emits no team column width properties when neither option is set", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      const style = haCardStyle(card);
      expect(style).not.toContain("--ttsc-team-col-a-width");
      expect(style).not.toContain("--ttsc-team-col-b-width");
      expect(style).not.toContain("--ttsc-team-col-width");
    });
  });

  describe("layout dimension options", () => {
    const haCardStyle = (card: ReturnType<typeof makeCard>) =>
      card.shadowRoot?.querySelector("ha-card")?.getAttribute("style") ?? "";

    const cases = [
      { option: "logo_width", prop: "--ttsc-logo-width", value: "44px" },
      { option: "score_width", prop: "--ttsc-score-width", value: "50px" },
      { option: "colon_width", prop: "--ttsc-colon-width", value: "12px" },
      { option: "row_height", prop: "--ttsc-row-height", value: "40px" },
    ] as const;

    for (const { option, prop, value } of cases) {
      it(`emits ${prop} on ha-card when ${option} is configured`, () => {
        const card = makeCard();
        card._config = { sections: [nbaSection], [option]: value };
        card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
        card._render();
        expect(haCardStyle(card)).toContain(`${prop}:${value}`);
      });

      it(`does not emit ${prop} when ${option} is omitted`, () => {
        const card = makeCard();
        card._config = { sections: [nbaSection] };
        card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
        card._render();
        expect(haCardStyle(card)).not.toContain(prop);
      });
    }
  });

  describe("font_scale", () => {
    const haCardStyle = (card: ReturnType<typeof makeCard>) =>
      card.shadowRoot?.querySelector("ha-card")?.getAttribute("style") ?? "";

    it("emits --ttsc-font-scale:1.15 when font_scale is 1.15", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], font_scale: 1.15 };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(haCardStyle(card)).toContain("--ttsc-font-scale:1.15");
    });

    it("does not emit --ttsc-font-scale when font_scale is omitted", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(haCardStyle(card)).not.toContain("--ttsc-font-scale");
    });

    it("does not emit --ttsc-font-scale when font_scale is 1", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], font_scale: 1 };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(haCardStyle(card)).not.toContain("--ttsc-font-scale");
    });
  });

  describe("layout: map", () => {
    const haCardStyle = (card: ReturnType<typeof makeCard>) =>
      card.shadowRoot?.querySelector("ha-card")?.getAttribute("style") ?? "";

    const cases = [
      { key: "team_width", prop: "--ttsc-team-col-a-width", value: "120px" },
      { key: "logo_width", prop: "--ttsc-logo-width", value: "44px" },
      { key: "score_width", prop: "--ttsc-score-width", value: "50px" },
      { key: "colon_width", prop: "--ttsc-colon-width", value: "12px" },
      { key: "row_height", prop: "--ttsc-row-height", value: "40px" },
      { key: "row_padding", prop: "--ttsc-row-padding", value: "6px" },
    ] as const;

    for (const { key, prop, value } of cases) {
      it(`emits ${prop} from layout.${key}`, () => {
        const card = makeCard();
        card._config = { sections: [nbaSection], layout: { [key]: value } };
        card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
        card._render();
        expect(haCardStyle(card)).toContain(`${prop}:${value}`);
      });
    }

    it("layout.team_width sets both team columns", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], layout: { team_width: "120px" } };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(haCardStyle(card)).toContain("--ttsc-team-col-a-width:120px");
      expect(haCardStyle(card)).toContain("--ttsc-team-col-b-width:120px");
    });

    it("layout.font_scale emits --ttsc-font-scale", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], layout: { font_scale: 1.15 } };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(haCardStyle(card)).toContain("--ttsc-font-scale:1.15");
    });

    it("layout.height sets the ha-card height and drives getCardSize", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], layout: { height: "600px" } };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(haCardStyle(card)).toContain("height:600px;");
      expect(card.getCardSize()).toBe(12);
    });

    it("layout.* wins over the deprecated flat key when both are set", () => {
      const card = makeCard();
      card._config = {
        sections: [nbaSection],
        row_height: "40px",
        team_col_width: "200px",
        layout: { row_height: "60px", team_width: "120px" },
      };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      const style = haCardStyle(card);
      expect(style).toContain("--ttsc-row-height:60px");
      expect(style).toContain("--ttsc-team-col-a-width:120px");
      expect(style).not.toContain("40px");
      expect(style).not.toContain("200px");
    });

    it("falls back to a flat key the layout map omits", () => {
      const card = makeCard();
      card._config = {
        sections: [nbaSection],
        row_height: "40px",
        layout: { team_width: "120px" },
      };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(haCardStyle(card)).toContain("--ttsc-row-height:40px");
    });
  });

  describe("_refreshDebugOverlay", () => {
    it("patches #sc-debug innerHTML without invoking _render", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], debug: true };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._trackedIds = new Set();
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
      card._trackedIds = new Set();
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

  describe("_detectScoreChanges", () => {
    it("records timestamp when score changes during IN game", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      card._trackedIds = new Set(["sensor.nba_lal"]);
      card._prevScores.set("sensor.nba_lal", { t: 93, o: 90 });
      card._detectScoreChanges({
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      expect(card._scoreChangedAt.has("sensor.nba_lal")).toBe(true);
    });

    it("does not record when score is unchanged", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      card._trackedIds = new Set(["sensor.nba_lal"]);
      card._prevScores.set("sensor.nba_lal", { t: 95, o: 90 });
      card._detectScoreChanges({
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      expect(card._scoreChangedAt.has("sensor.nba_lal")).toBe(false);
    });

    it("does not record on first observation (no prev scores)", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      card._trackedIds = new Set(["sensor.nba_lal"]);
      card._detectScoreChanges({ "sensor.nba_lal": makeState("IN", baseAttrs) });
      expect(card._scoreChangedAt.has("sensor.nba_lal")).toBe(false);
    });

    it("clears blink entry when game leaves IN state", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      card._trackedIds = new Set(["sensor.nba_lal"]);
      card._scoreChangedAt.set("sensor.nba_lal", Date.now());
      card._prevScores.set("sensor.nba_lal", { t: 95, o: 90 });
      card._detectScoreChanges({ "sensor.nba_lal": makeState("POST", baseAttrs) });
      expect(card._scoreChangedAt.has("sensor.nba_lal")).toBe(false);
    });

    it("does nothing when _trackedIds is null", () => {
      const card = makeCard();
      card._trackedIds = null;
      expect(() => card._detectScoreChanges({})).not.toThrow();
    });

    it("treats missing score attributes as 0 and does not blink on first observation", () => {
      const card = makeCard();
      card._trackedIds = new Set(["sensor.nba_lal"]);
      // entity in IN state with no score fields — attr?.team_score ?? 0 hits the 0 fallback
      card._detectScoreChanges({ "sensor.nba_lal": makeState("IN", {}) });
      expect(card._scoreChangedAt.has("sensor.nba_lal")).toBe(false);
    });
  });

  describe("_pruneExpiredBlinks", () => {
    it("removes entries older than the blink window", () => {
      const card = makeCard();
      card._config = { sections: [{ ...nbaSection, score_blink: 5 }] };
      card._scoreChangedAt.set("sensor.nba_lal", Date.now() - 6_000);
      card._pruneExpiredBlinks();
      expect(card._scoreChangedAt.has("sensor.nba_lal")).toBe(false);
    });

    it("keeps entries within the blink window", () => {
      const card = makeCard();
      card._config = { sections: [{ ...nbaSection, score_blink: 5 }] };
      card._scoreChangedAt.set("sensor.nba_lal", Date.now() - 2_000);
      card._pruneExpiredBlinks();
      expect(card._scoreChangedAt.has("sensor.nba_lal")).toBe(true);
    });

    it("removes entries when score_blink is 0", () => {
      const card = makeCard();
      card._config = { sections: [{ ...nbaSection, score_blink: 0 }] };
      card._scoreChangedAt.set("sensor.nba_lal", Date.now());
      card._pruneExpiredBlinks();
      expect(card._scoreChangedAt.has("sensor.nba_lal")).toBe(false);
    });

    it("uses default 5s window when entity does not match any section prefix", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      // entity with an unrecognized prefix — section.find returns undefined
      card._scoreChangedAt.set("sensor.unknown_x", Date.now() - 6_000);
      card._pruneExpiredBlinks();
      expect(card._scoreChangedAt.has("sensor.unknown_x")).toBe(false);
    });

    it("uses default 5s when _config is null", () => {
      const card = makeCard();
      card._config = null;
      card._scoreChangedAt.set("sensor.nba_lal", Date.now() - 6_000);
      card._pruneExpiredBlinks();
      expect(card._scoreChangedAt.has("sensor.nba_lal")).toBe(false);
    });

    it("matches entity against a section with no prefix defined", () => {
      const card = makeCard();
      card._config = { sections: [{ name: "All" }] }; // no prefix → s.prefix ?? "" → ""
      card._scoreChangedAt.set("sensor.nba_lal", Date.now() - 6_000);
      card._pruneExpiredBlinks();
      expect(card._scoreChangedAt.has("sensor.nba_lal")).toBe(false);
    });
  });

  describe("_armBlinkTimer", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("arms a timer when scoreChangedAt has entries", () => {
      const card = makeCard();
      card._config = { sections: [{ ...nbaSection, score_blink: 5 }] };
      card._scoreChangedAt.set("sensor.nba_lal", Date.now());
      card._armBlinkTimer();
      expect(card._blinkTimer).not.toBeNull();
    });

    it("does not arm when scoreChangedAt is empty", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      card._armBlinkTimer();
      expect(card._blinkTimer).toBeNull();
    });

    it("does not arm a second timer when one is already running", () => {
      const card = makeCard();
      card._config = { sections: [{ ...nbaSection, score_blink: 5 }] };
      card._scoreChangedAt.set("sensor.nba_lal", Date.now());
      card._armBlinkTimer();
      const firstTimer = card._blinkTimer;
      card._armBlinkTimer();
      expect(card._blinkTimer).toBe(firstTimer);
    });

    it("triggers a render when the timer fires", () => {
      const card = makeCard();
      card._config = { sections: [{ ...nbaSection, score_blink: 5 }] };
      card._hass = makeHass({ "sensor.nba_lal": makeState("IN", baseAttrs) });
      card._trackedIds = new Set(["sensor.nba_lal"]);
      const renderSpy = vi.spyOn(card, "_render");
      card._scoreChangedAt.set("sensor.nba_lal", Date.now());
      card._armBlinkTimer();
      vi.runAllTimers();
      expect(renderSpy).toHaveBeenCalled();
    });

    it("does not render when timer fires after hass is cleared", () => {
      const card = makeCard();
      card._config = { sections: [{ ...nbaSection, score_blink: 5 }] };
      card._hass = null;
      const renderSpy = vi.spyOn(card, "_render");
      card._scoreChangedAt.set("sensor.nba_lal", Date.now());
      card._armBlinkTimer();
      vi.runAllTimers();
      expect(renderSpy).not.toHaveBeenCalled();
    });

    it("does not arm when all entries have score_blink 0 (minExpiry stays Infinity)", () => {
      const card = makeCard();
      card._config = { sections: [{ ...nbaSection, score_blink: 0 }] };
      card._scoreChangedAt.set("sensor.nba_lal", Date.now());
      card._armBlinkTimer();
      expect(card._blinkTimer).toBeNull();
    });

    it("arms using default 5s when _config is null", () => {
      const card = makeCard();
      card._config = null;
      card._scoreChangedAt.set("sensor.nba_lal", Date.now());
      card._armBlinkTimer();
      expect(card._blinkTimer).not.toBeNull();
    });

    it("arms when section has no prefix defined", () => {
      const card = makeCard();
      card._config = { sections: [{ name: "All" }] }; // no prefix → s.prefix ?? "" → ""
      card._scoreChangedAt.set("sensor.nba_lal", Date.now());
      card._armBlinkTimer();
      expect(card._blinkTimer).not.toBeNull();
    });

    it("clears _blinkTimer on _clearSubscription", () => {
      const card = makeCard();
      card._blinkTimer = setTimeout(() => {}, 5_000);
      card._clearSubscription();
      expect(card._blinkTimer).toBeNull();
    });
  });

  describe("setConfig score cache reset", () => {
    it("clears _scoreChangedAt and _prevScores on setConfig", () => {
      const card = makeCard();
      card._scoreChangedAt.set("sensor.nba_lal", Date.now());
      card._prevScores.set("sensor.nba_lal", { t: 95, o: 90 });
      card.setConfig({ sections: [nbaSection] });
      expect(card._scoreChangedAt.size).toBe(0);
      expect(card._prevScores.size).toBe(0);
    });
  });
});
