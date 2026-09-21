import { describe, expect, it, vi } from "vitest";
import { useFakeTimers } from "./helpers.js";
import { baseAttrs, makeCard, makeHass, makeState, nbaSection } from "./index.fixtures.js";

// Score-change detection, expiry and timer-arming themselves live in BlinkTracker
// (test/runtime/blink.test.ts) — this file covers only what SportScoreboardCard adds on
// top: resolving a section's blink duration from config, and wiring the tracker's
// lifecycle into setConfig / disconnectedCallback / _render.
describe("SportScoreboardCard blink wiring", () => {
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

    it("uses default 5s window when entity does not match any section prefix", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      expect(card._maxBlinkMsFor("sensor.unknown_x")).toBe(5000);
    });

    it("uses default 5s when _config is null", () => {
      const card = makeCard();
      card._config = null;
      expect(card._maxBlinkMsFor("sensor.nba_lal")).toBe(5000);
    });

    it("matches entity against a section with no prefix defined", () => {
      const card = makeCard();
      card._config = { sections: [{ name: "All" }] }; // no prefix → s.prefix ?? "" → ""
      expect(card._maxBlinkMsFor("sensor.nba_lal")).toBe(5000);
    });
  });

  describe("lifecycle wiring", () => {
    useFakeTimers();

    it("clears the blink tracker on setConfig", () => {
      const card = makeCard();
      card._blink.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "90" }),
      });
      card._blink.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      expect(card._blink.entries.size).toBe(1);
      card.setConfig({ sections: [nbaSection] });
      expect(card._blink.entries.size).toBe(0);
    });

    it("clears the blink tracker's timer on disconnectedCallback", () => {
      const card = makeCard();
      card._blink.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "90" }),
      });
      card._blink.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      card._blink.armTimer(
        (id) => card._maxBlinkMsFor(id),
        () => {}
      );
      expect(card._blink.timerActive).toBe(true);
      card.disconnectedCallback();
      expect(card._blink.timerActive).toBe(false);
    });

    it("clears the blink tracker's timer on _clearSubscription", () => {
      const card = makeCard();
      card._blink.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "90" }),
      });
      card._blink.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      card._blink.armTimer(
        (id) => card._maxBlinkMsFor(id),
        () => {}
      );
      card._clearSubscription();
      expect(card._blink.timerActive).toBe(false);
    });

    it("_render arms a real blink timer that triggers a further render on expiry", () => {
      // exercises _render's own armTimer callback (not a hand-rolled stand-in for it),
      // so the timer-driven re-render path is covered end to end
      const card = makeCard();
      card._config = { sections: [{ ...nbaSection, score_blink: 5 }] };
      card.hass = makeHass({
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "90" }),
      });
      const renderSpy = vi.spyOn(card, "_render");
      card.hass = makeHass({
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      vi.runAllTimers();
      // one render from the lazy-refresh schedule picking up the score change, and a
      // second from the blink timer firing once that change's window closes
      expect(renderSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it("does not render again when the real blink timer fires after hass is cleared", () => {
      const card = makeCard();
      card._config = { sections: [{ ...nbaSection, score_blink: 5 }] };
      card.hass = makeHass({
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "90" }),
      });
      card.hass = makeHass({
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      card._render(); // detects the score change and arms the real blink timer synchronously
      const renderSpy = vi.spyOn(card, "_render");
      card._hass = null;
      vi.runAllTimers();
      expect(renderSpy).not.toHaveBeenCalled();
    });
  });
});
