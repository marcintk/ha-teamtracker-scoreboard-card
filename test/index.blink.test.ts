import { describe, expect, it, vi } from "vitest";
import { useFakeTimers } from "./helpers.js";
import { baseAttrs, makeCard, makeHass, makeState, nbaSection } from "./index.fixtures.js";

describe("SportScoreboardCard score-blink lifecycle", () => {
  describe("_detectScoreChanges", () => {
    it("records a team timestamp when the team score changes during IN game", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      card._trackedIds = new Set(["sensor.nba_lal"]);
      card._prevScores.set("sensor.nba_lal", { t: 93, o: 90 });
      card._detectScoreChanges({
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      const entry = card._scoreChangedAt.get("sensor.nba_lal");
      expect(typeof entry?.team).toBe("number");
      expect(entry?.opponent).toBeUndefined();
    });

    it("records an opponent timestamp when only the opponent score changes", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      card._trackedIds = new Set(["sensor.nba_lal"]);
      card._prevScores.set("sensor.nba_lal", { t: 95, o: 88 });
      card._detectScoreChanges({
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      const entry = card._scoreChangedAt.get("sensor.nba_lal");
      expect(entry?.team).toBeUndefined();
      expect(typeof entry?.opponent).toBe("number");
    });

    it("records both sides' timestamps when both scores move at once", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      card._trackedIds = new Set(["sensor.nba_lal"]);
      card._prevScores.set("sensor.nba_lal", { t: 93, o: 88 });
      card._detectScoreChanges({
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      const entry = card._scoreChangedAt.get("sensor.nba_lal");
      expect(typeof entry?.team).toBe("number");
      expect(typeof entry?.opponent).toBe("number");
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
      card._scoreChangedAt.set("sensor.nba_lal", { team: Date.now() });
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

    it("merges a new side's timestamp instead of overwriting the other side's still-running one", () => {
      // regression: a change on one side must not reset/cancel the other side's own
      // independent blink window
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      card._trackedIds = new Set(["sensor.nba_lal"]);
      const opponentAt = Date.now() - 1000;
      card._scoreChangedAt.set("sensor.nba_lal", { opponent: opponentAt });
      card._prevScores.set("sensor.nba_lal", { t: 93, o: 90 });
      card._detectScoreChanges({
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      const entry = card._scoreChangedAt.get("sensor.nba_lal");
      expect(entry?.opponent).toBe(opponentAt);
      expect(typeof entry?.team).toBe("number");
    });
  });

  describe("_maxBlinkMsFor", () => {
    it("uses the longer score_blink among every section the id matches", () => {
      const card = makeCard();
      card._config = {
        sections: [
          { name: "All", score_blink: 0 },
          { ...nbaSection, score_blink: 5 },
        ],
      };
      expect(card._maxBlinkMsFor("sensor.nba_lal")).toBe(5000);
    });

    it("returns 0 when every matching section has blink disabled", () => {
      const card = makeCard();
      card._config = { sections: [{ name: "All", score_blink: 0 }] };
      expect(card._maxBlinkMsFor("sensor.nba_lal")).toBe(0);
    });
  });

  describe("_pruneExpiredBlinks", () => {
    it("removes entries older than the blink window", () => {
      const card = makeCard();
      card._config = { sections: [{ ...nbaSection, score_blink: 5 }] };
      card._scoreChangedAt.set("sensor.nba_lal", { team: Date.now() - 6_000 });
      card._pruneExpiredBlinks();
      expect(card._scoreChangedAt.has("sensor.nba_lal")).toBe(false);
    });

    it("keeps entries within the blink window", () => {
      const card = makeCard();
      card._config = { sections: [{ ...nbaSection, score_blink: 5 }] };
      card._scoreChangedAt.set("sensor.nba_lal", { team: Date.now() - 2_000 });
      card._pruneExpiredBlinks();
      expect(card._scoreChangedAt.has("sensor.nba_lal")).toBe(true);
    });

    it("removes entries when score_blink is 0", () => {
      const card = makeCard();
      card._config = { sections: [{ ...nbaSection, score_blink: 0 }] };
      card._scoreChangedAt.set("sensor.nba_lal", { team: Date.now() });
      card._pruneExpiredBlinks();
      expect(card._scoreChangedAt.has("sensor.nba_lal")).toBe(false);
    });

    it("uses default 5s window when entity does not match any section prefix", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      // entity with an unrecognized prefix — no section matches
      card._scoreChangedAt.set("sensor.unknown_x", { team: Date.now() - 6_000 });
      card._pruneExpiredBlinks();
      expect(card._scoreChangedAt.has("sensor.unknown_x")).toBe(false);
    });

    it("uses default 5s when _config is null", () => {
      const card = makeCard();
      card._config = null;
      card._scoreChangedAt.set("sensor.nba_lal", { team: Date.now() - 6_000 });
      card._pruneExpiredBlinks();
      expect(card._scoreChangedAt.has("sensor.nba_lal")).toBe(false);
    });

    it("matches entity against a section with no prefix defined", () => {
      const card = makeCard();
      card._config = { sections: [{ name: "All" }] }; // no prefix → s.prefix ?? "" → ""
      card._scoreChangedAt.set("sensor.nba_lal", { team: Date.now() - 6_000 });
      card._pruneExpiredBlinks();
      expect(card._scoreChangedAt.has("sensor.nba_lal")).toBe(false);
    });

    it("prunes only the side that actually expired, keeping the other side's own window", () => {
      const card = makeCard();
      card._config = { sections: [{ ...nbaSection, score_blink: 5 }] };
      card._scoreChangedAt.set("sensor.nba_lal", {
        team: Date.now() - 6_000, // expired
        opponent: Date.now() - 1_000, // still within window
      });
      card._pruneExpiredBlinks();
      const entry = card._scoreChangedAt.get("sensor.nba_lal");
      expect(entry?.team).toBeUndefined();
      expect(entry?.opponent).toBeDefined();
    });

    it("keeps an id tracked by a second section even when the first matching section's blink is disabled", () => {
      // regression: pruning must not key off only the first config-order section that
      // matches an id — a second section's own (longer) score_blink deserves its turn
      const card = makeCard();
      card._config = {
        sections: [
          { name: "All", score_blink: 0 },
          { ...nbaSection, score_blink: 5 },
        ],
      };
      card._scoreChangedAt.set("sensor.nba_lal", { team: Date.now() - 2_000 });
      card._pruneExpiredBlinks();
      expect(card._scoreChangedAt.has("sensor.nba_lal")).toBe(true);
    });
  });

  describe("_armBlinkTimer", () => {
    useFakeTimers();

    it("arms a timer when scoreChangedAt has entries", () => {
      const card = makeCard();
      card._config = { sections: [{ ...nbaSection, score_blink: 5 }] };
      card._scoreChangedAt.set("sensor.nba_lal", { team: Date.now() });
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
      card._scoreChangedAt.set("sensor.nba_lal", { team: Date.now() });
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
      card._scoreChangedAt.set("sensor.nba_lal", { team: Date.now() });
      card._armBlinkTimer();
      vi.runAllTimers();
      expect(renderSpy).toHaveBeenCalled();
    });

    it("does not render when timer fires after hass is cleared", () => {
      const card = makeCard();
      card._config = { sections: [{ ...nbaSection, score_blink: 5 }] };
      card._hass = null;
      const renderSpy = vi.spyOn(card, "_render");
      card._scoreChangedAt.set("sensor.nba_lal", { team: Date.now() });
      card._armBlinkTimer();
      vi.runAllTimers();
      expect(renderSpy).not.toHaveBeenCalled();
    });

    it("does not arm when all entries have score_blink 0 (minExpiry stays Infinity)", () => {
      const card = makeCard();
      card._config = { sections: [{ ...nbaSection, score_blink: 0 }] };
      card._scoreChangedAt.set("sensor.nba_lal", { team: Date.now() });
      card._armBlinkTimer();
      expect(card._blinkTimer).toBeNull();
    });

    it("arms using default 5s when _config is null", () => {
      const card = makeCard();
      card._config = null;
      card._scoreChangedAt.set("sensor.nba_lal", { team: Date.now() });
      card._armBlinkTimer();
      expect(card._blinkTimer).not.toBeNull();
    });

    it("arms when section has no prefix defined", () => {
      const card = makeCard();
      card._config = { sections: [{ name: "All" }] }; // no prefix → s.prefix ?? "" → ""
      card._scoreChangedAt.set("sensor.nba_lal", { team: Date.now() });
      card._armBlinkTimer();
      expect(card._blinkTimer).not.toBeNull();
    });

    it("arms from the opponent side's timestamp when only it is set", () => {
      const card = makeCard();
      card._config = { sections: [{ ...nbaSection, score_blink: 5 }] };
      card._scoreChangedAt.set("sensor.nba_lal", { opponent: Date.now() });
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
      card._scoreChangedAt.set("sensor.nba_lal", { team: Date.now() });
      card._prevScores.set("sensor.nba_lal", { t: 95, o: 90 });
      card.setConfig({ sections: [nbaSection] });
      expect(card._scoreChangedAt.size).toBe(0);
      expect(card._prevScores.size).toBe(0);
    });
  });
});
