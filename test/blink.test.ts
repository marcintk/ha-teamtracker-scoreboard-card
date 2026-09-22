import { describe, expect, it, vi } from "vitest";
import { BlinkTracker } from "../src/blink.js";
import { useFakeTimers } from "./helpers.js";
import { baseAttrs, makeState } from "./index.fixtures.js";

// mirrors the config-driven "5s default, 0 disables, longest section wins" rule the
// caller (SportScoreboardCard._maxBlinkMsFor) applies — kept simple here since
// BlinkTracker only depends on the *result*, not on SectionConfig itself.
const blinkMsFor = (ms: number) => () => ms;

describe("BlinkTracker", () => {
  describe("record", () => {
    it("records a team timestamp when the team score changes during IN game", () => {
      const tracker = new BlinkTracker();
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "90" }),
      });
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      const entry = tracker.entries.get("sensor.nba_lal");
      expect(typeof entry?.team).toBe("number");
      expect(entry?.opponent).toBeUndefined();
    });

    it("records an opponent timestamp when only the opponent score changes", () => {
      const tracker = new BlinkTracker();
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "88" }),
      });
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      const entry = tracker.entries.get("sensor.nba_lal");
      expect(entry?.team).toBeUndefined();
      expect(typeof entry?.opponent).toBe("number");
    });

    it("records both sides' timestamps when both scores move at once", () => {
      const tracker = new BlinkTracker();
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "88" }),
      });
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      const entry = tracker.entries.get("sensor.nba_lal");
      expect(typeof entry?.team).toBe("number");
      expect(typeof entry?.opponent).toBe("number");
    });

    it("does not record when score is unchanged", () => {
      const tracker = new BlinkTracker();
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      expect(tracker.entries.has("sensor.nba_lal")).toBe(false);
    });

    it("does not record on first observation (no prev scores)", () => {
      const tracker = new BlinkTracker();
      tracker.record(["sensor.nba_lal"], { "sensor.nba_lal": makeState("IN", baseAttrs) });
      expect(tracker.entries.has("sensor.nba_lal")).toBe(false);
    });

    it("clears blink entry when game leaves IN state", () => {
      const tracker = new BlinkTracker();
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "90" }),
      });
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      expect(tracker.entries.has("sensor.nba_lal")).toBe(true);
      tracker.record(["sensor.nba_lal"], { "sensor.nba_lal": makeState("POST", baseAttrs) });
      expect(tracker.entries.has("sensor.nba_lal")).toBe(false);
    });

    it("does nothing for an empty tracked-id list", () => {
      const tracker = new BlinkTracker();
      expect(() => tracker.record([], {})).not.toThrow();
    });

    it("treats missing score attributes as 0 and does not blink on first observation", () => {
      const tracker = new BlinkTracker();
      // entity in IN state with no score fields — attr?.team_score ?? 0 hits the 0 fallback
      tracker.record(["sensor.nba_lal"], { "sensor.nba_lal": makeState("IN", {}) });
      expect(tracker.entries.has("sensor.nba_lal")).toBe(false);
    });

    it("merges a new side's timestamp instead of overwriting the other side's still-running one", () => {
      // regression: a change on one side must not reset/cancel the other side's own
      // independent blink window
      const tracker = new BlinkTracker();
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "90" }),
      });
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "88" }),
      });
      const opponentAt = tracker.entries.get("sensor.nba_lal")?.opponent;
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "88" }),
      });
      const entry = tracker.entries.get("sensor.nba_lal");
      expect(entry?.opponent).toBe(opponentAt);
      expect(typeof entry?.team).toBe("number");
    });
  });

  describe("prune", () => {
    it("removes entries older than the blink window", () => {
      const tracker = new BlinkTracker();
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "90" }),
      });
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      const entry = tracker.entries.get("sensor.nba_lal");
      if (entry) entry.team = Date.now() - 6_000;
      tracker.prune(blinkMsFor(5000));
      expect(tracker.entries.has("sensor.nba_lal")).toBe(false);
    });

    it("keeps entries within the blink window", () => {
      const tracker = new BlinkTracker();
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "90" }),
      });
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      tracker.prune(blinkMsFor(5000));
      expect(tracker.entries.has("sensor.nba_lal")).toBe(true);
    });

    it("removes entries when score_blink is 0", () => {
      const tracker = new BlinkTracker();
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "90" }),
      });
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      tracker.prune(blinkMsFor(0));
      expect(tracker.entries.has("sensor.nba_lal")).toBe(false);
    });

    it("does nothing when there are no entries", () => {
      const tracker = new BlinkTracker();
      const fn = vi.fn(() => 5000);
      tracker.prune(fn);
      expect(fn).not.toHaveBeenCalled();
    });

    it("prunes only the side that actually expired, keeping the other side's own window", () => {
      const tracker = new BlinkTracker();
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "88" }),
      });
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      const entry = tracker.entries.get("sensor.nba_lal");
      if (entry) {
        entry.team = Date.now() - 6_000; // expired
        entry.opponent = Date.now() - 1_000; // still within window
      }
      tracker.prune(blinkMsFor(5000));
      const pruned = tracker.entries.get("sensor.nba_lal");
      expect(pruned?.team).toBeUndefined();
      expect(pruned?.opponent).toBeDefined();
    });
  });

  describe("sync", () => {
    it("records then prunes in one call and returns the resulting entries", () => {
      const tracker = new BlinkTracker();
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "90" }),
      });
      const entries = tracker.sync(
        ["sensor.nba_lal"],
        {
          "sensor.nba_lal": makeState("IN", {
            ...baseAttrs,
            team_score: "95",
            opponent_score: "90",
          }),
        },
        blinkMsFor(5000)
      );
      expect(entries).toBe(tracker.entries);
      expect(typeof entries.get("sensor.nba_lal")?.team).toBe("number");
    });

    it("prunes what it just recorded when the window is already closed", () => {
      const tracker = new BlinkTracker();
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "90" }),
      });
      const entries = tracker.sync(
        ["sensor.nba_lal"],
        {
          "sensor.nba_lal": makeState("IN", {
            ...baseAttrs,
            team_score: "95",
            opponent_score: "90",
          }),
        },
        blinkMsFor(0)
      );
      expect(entries.has("sensor.nba_lal")).toBe(false);
    });
  });

  describe("armTimer", () => {
    useFakeTimers();

    it("arms a timer when there are open blink entries", () => {
      const tracker = new BlinkTracker();
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "90" }),
      });
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      tracker.armTimer(blinkMsFor(5000), vi.fn());
      expect(tracker.timerActive).toBe(true);
    });

    it("does not arm when there are no entries", () => {
      const tracker = new BlinkTracker();
      tracker.armTimer(blinkMsFor(5000), vi.fn());
      expect(tracker.timerActive).toBe(false);
    });

    it("does not arm a second timer when one is already running", () => {
      const tracker = new BlinkTracker();
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "90" }),
      });
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      tracker.armTimer(blinkMsFor(5000), vi.fn());
      const activeAfterFirst = tracker.timerActive;
      tracker.armTimer(blinkMsFor(5000), vi.fn());
      expect(tracker.timerActive).toBe(activeAfterFirst);
    });

    it("calls onExpire when the timer fires", () => {
      const tracker = new BlinkTracker();
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "90" }),
      });
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      const onExpire = vi.fn();
      tracker.armTimer(blinkMsFor(5000), onExpire);
      vi.runAllTimers();
      expect(onExpire).toHaveBeenCalled();
      expect(tracker.timerActive).toBe(false);
    });

    it("does not arm when every entry's blink window is disabled (minExpiry stays Infinity)", () => {
      const tracker = new BlinkTracker();
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "90" }),
      });
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      tracker.armTimer(blinkMsFor(0), vi.fn());
      expect(tracker.timerActive).toBe(false);
    });

    it("arms from the opponent side's timestamp when only it is set", () => {
      const tracker = new BlinkTracker();
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "88" }),
      });
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "90" }),
      });
      tracker.armTimer(blinkMsFor(5000), vi.fn());
      expect(tracker.timerActive).toBe(true);
    });
  });

  describe("clearTimer / clear", () => {
    useFakeTimers();

    it("clearTimer cancels a pending timer", () => {
      const tracker = new BlinkTracker();
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "90" }),
      });
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      tracker.armTimer(blinkMsFor(5000), vi.fn());
      tracker.clearTimer();
      expect(tracker.timerActive).toBe(false);
    });

    it("clear resets entries, prev scores, and the timer", () => {
      const tracker = new BlinkTracker();
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "90" }),
      });
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      tracker.armTimer(blinkMsFor(5000), vi.fn());
      tracker.clear();
      expect(tracker.entries.size).toBe(0);
      expect(tracker.timerActive).toBe(false);
      // prev-scores were reset too: the same "change" replays as a first observation
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      expect(tracker.entries.has("sensor.nba_lal")).toBe(false);
    });
  });
});
