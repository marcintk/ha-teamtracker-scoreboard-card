import { describe, expect, it, vi } from "vitest";
import { blinkMsForId } from "../src/config-match.js";
import { useFakeTimers } from "./helpers.js";
import { baseAttrs, makeCard, makeHass, makeState, nbaSection } from "./index.fixtures.js";

// Score-change detection, expiry and timer-arming themselves live in BlinkTracker
// (test/runtime/blink.test.ts); the "longest score_blink across every matching section"
// resolution rule itself lives in blinkMsForId (test/config-match.test.ts) — this file
// covers only what SportScoreboardCard adds on top: wiring the tracker's lifecycle into
// setConfig / disconnectedCallback / _render.
describe("SportScoreboardCard blink wiring", () => {
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
        (id) => blinkMsForId(card._config?.sections ?? [], id),
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
        (id) => blinkMsForId(card._config?.sections ?? [], id),
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

    it("prunes pre-existing blink entries with the default window when config has no sections", () => {
      const card = makeCard();
      card._blink.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "90" }),
      });
      card._blink.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      expect(card._blink.entries.size).toBe(1);
      card._config = {}; // no `sections` key at all
      card._hass = makeHass({});
      card._render();
      // sections is undefined, not just empty, so blinkMsFor falls back to `[]` and the
      // entry gets the 5s default window rather than being dropped outright
      expect(card._blink.entries.has("sensor.nba_lal")).toBe(true);
    });
  });
});
