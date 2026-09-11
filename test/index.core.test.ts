import { describe, expect, it, vi } from "vitest";
import type { SportScoreboardCard } from "../src/index.js";
import { useFakeTimers } from "./helpers.js";
import {
  baseAttrs,
  getCallback,
  makeCard,
  makeHass,
  makeHassWithConnection,
  makeState,
  nbaSection,
} from "./index.fixtures.js";

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
    useFakeTimers();

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
  describe("subscription", () => {
    useFakeTimers();

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
    useFakeTimers();

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
});
