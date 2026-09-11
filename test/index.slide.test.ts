import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SportScoreboardCard } from "../src/index.js";
import { useFakeTimers } from "./helpers.js";
import { baseAttrs, makeCard, makeHass, makeState, nbaSection } from "./index.fixtures.js";

describe("SportScoreboardCard slide mode", () => {
  describe("slide_sec carousel", () => {
    useFakeTimers();

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
    useFakeTimers();

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
    useFakeTimers();

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
});
