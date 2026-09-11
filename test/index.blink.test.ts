import { describe, expect, it, vi } from "vitest";
import { useFakeTimers } from "./helpers.js";
import { baseAttrs, makeCard, makeHass, makeState, nbaSection } from "./index.fixtures.js";

describe("SportScoreboardCard score-blink lifecycle", () => {
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
    useFakeTimers();

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
