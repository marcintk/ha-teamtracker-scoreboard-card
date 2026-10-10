import { describe, expect, it, vi } from "vitest";
import { BlinkTracker } from "../src/blink.js";
import { gameKeyFor } from "../src/game-key.js";
import { blinkEntries, blinkHeld, useFakeTimers } from "./helpers.js";
import { baseAttrs, makeState } from "./index.fixtures.js";

// the window is the fixed BLINK_MS; tests only vary whether blinking is enabled.
const OFF: ReadonlyMap<string, boolean> = new Map([["sensor.nba_lal", false]]);
const S95 = {
  "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
};
// drives the tracker's private record -> prune -> arm pipeline through its public entry point
const upd = (
  tracker: BlinkTracker,
  states: Parameters<BlinkTracker["update"]>[0]["states"],
  blinkOnById: ReadonlyMap<string, boolean> = new Map(),
  onExpire: () => void = vi.fn(),
  reducedMotion = false
) =>
  tracker.update({
    states,
    trackedIds: ["sensor.nba_lal"],
    blinkOnById,
    reducedMotion,
    onExpire,
  });

// baseAttrs has no `date`, so gameKeyFor falls back to the entityId itself — this is
// that same key, computed through gameKeyFor so it types as GameKey.
const LAL = gameKeyFor("sensor.nba_lal", {});

describe("BlinkTracker", () => {
  it("no longer exposes the legacy entries/held getters", () => {
    for (const k of ["entries", "held"]) expect(k in new BlinkTracker(), k).toBe(false);
  });

  describe("record", () => {
    useFakeTimers();

    it("records a team timestamp when the team score changes during IN game", () => {
      const tracker = new BlinkTracker();
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "90" }),
      });
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      const entry = blinkEntries(tracker).get(LAL);
      expect(typeof entry?.team).toBe("number");
      expect(entry?.opponent).toBeUndefined();
    });

    it("ignores non-numeric scores instead of blinking forever", () => {
      const tracker = new BlinkTracker();
      const states = {
        "sensor.nba_lal": makeState("IN", {
          ...baseAttrs,
          team_score: "176/5",
          opponent_score: "90",
        }),
      };
      tracker.record(["sensor.nba_lal"], states);
      tracker.record(["sensor.nba_lal"], states);
      expect(blinkEntries(tracker).get(LAL)).toBeUndefined();
    });

    it("resets the baseline across a non-numeric gap", () => {
      const tracker = new BlinkTracker();
      const at = (team_score: string) => ({
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score, opponent_score: "90" }),
      });
      tracker.record(["sensor.nba_lal"], at("3"));
      tracker.record(["sensor.nba_lal"], at("176/5"));
      tracker.record(["sensor.nba_lal"], at("4"));
      expect(blinkEntries(tracker).get(LAL)).toBeUndefined();
    });

    it("uses the higher score across sibling sensors so a stale sibling cannot flap or hide a change", () => {
      const tracker = new BlinkTracker();
      const sib = (ts: string) => ({
        "sensor.a": makeState("IN", {
          ...baseAttrs,
          team_abbr: "AAA",
          opponent_abbr: "BBB",
          team_score: ts,
          opponent_score: "0",
          date: "d",
        }),
        "sensor.b": makeState("IN", {
          ...baseAttrs,
          team_abbr: "BBB",
          opponent_abbr: "AAA",
          team_score: "0",
          opponent_score: "2",
          date: "d",
        }),
      });
      tracker.record(["sensor.a", "sensor.b"], sib("1"));
      const key = gameKeyFor("sensor.a", sib("1"));
      expect(blinkEntries(tracker).get(key)).toBeUndefined(); // 1 vs 2 resolves to 2, no flap
      tracker.record(["sensor.a", "sensor.b"], sib("2"));
      expect(blinkEntries(tracker).get(key)).toBeUndefined();
    });

    it("records an opponent timestamp when only the opponent score changes", () => {
      const tracker = new BlinkTracker();
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "88" }),
      });
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      const entry = blinkEntries(tracker).get(LAL);
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
      const entry = blinkEntries(tracker).get(LAL);
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
      expect(blinkEntries(tracker).has(LAL)).toBe(false);
    });

    it("does not record on first observation (no prev scores)", () => {
      const tracker = new BlinkTracker();
      tracker.record(["sensor.nba_lal"], { "sensor.nba_lal": makeState("IN", baseAttrs) });
      expect(blinkEntries(tracker).has(LAL)).toBe(false);
    });

    it("clears blink entry when game leaves IN state", () => {
      const tracker = new BlinkTracker();
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "90" }),
      });
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      expect(blinkEntries(tracker).has(LAL)).toBe(true);
      tracker.record(["sensor.nba_lal"], { "sensor.nba_lal": makeState("POST", baseAttrs) });
      expect(blinkEntries(tracker).has(LAL)).toBe(false);
    });

    it("does nothing for an empty tracked-id list", () => {
      const tracker = new BlinkTracker();
      expect(() => tracker.record([], {})).not.toThrow();
    });

    it("treats missing score attributes as 0 and does not blink on first observation", () => {
      const tracker = new BlinkTracker();
      // entity in IN state with no score fields — attr?.team_score ?? 0 hits the 0 fallback
      tracker.record(["sensor.nba_lal"], { "sensor.nba_lal": makeState("IN", {}) });
      expect(blinkEntries(tracker).has(LAL)).toBe(false);
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
      const opponentAt = blinkEntries(tracker).get(LAL)?.opponent;
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "88" }),
      });
      const entry = blinkEntries(tracker).get(LAL);
      expect(entry?.opponent).toBe(opponentAt);
      expect(typeof entry?.team).toBe("number");
    });

    it("merges a score change from either sibling sensor into one shared per-game entry", () => {
      // regression: sorting.ts's dedup can display either team's own sensor for a game,
      // and which one it picks can flip between renders (see sorting.ts's gameKeyFor
      // callers) — blink state has to survive that flip, so it's keyed by game + team_abbr
      // instead of by whichever sensor happens to be the raw tracked id.
      const date = "2024-03-15";
      const tracker = new BlinkTracker();
      const before = {
        "sensor.wc_fra": makeState("IN", {
          date,
          team_abbr: "fra",
          opponent_abbr: "bra",
          team_score: "0",
          opponent_score: "0",
        }),
        "sensor.wc_bra": makeState("IN", {
          date,
          team_abbr: "bra",
          opponent_abbr: "fra",
          team_score: "0",
          opponent_score: "0",
        }),
      };
      tracker.record(["sensor.wc_fra", "sensor.wc_bra"], before);
      // France scores — its own sensor reflects the new score; Brazil's sibling sensor
      // (which could be the one currently displayed) hasn't caught up yet.
      const after = {
        "sensor.wc_fra": makeState("IN", {
          date,
          team_abbr: "fra",
          opponent_abbr: "bra",
          team_score: "1",
          opponent_score: "0",
        }),
        "sensor.wc_bra": before["sensor.wc_bra"],
      };
      tracker.record(["sensor.wc_fra", "sensor.wc_bra"], after);
      const key = gameKeyFor("sensor.wc_bra", after);
      expect(key).toBe(gameKeyFor("sensor.wc_fra", after));
      expect(typeof blinkEntries(tracker).get(key)?.fra).toBe("number");
    });

    it("does not restamp on every pass while sibling sensors disagree about the score", () => {
      // regression: sensor A already reports fra 2-0 while sibling B still reports fra 1-0;
      // the change was seen once, so re-recording identical states must not move the stamp.
      const date = "2024-03-15";
      const mk = (fra: string, bra: string, aFra: string, aBra: string) => ({
        "sensor.wc_fra": makeState("IN", {
          date,
          team_abbr: "fra",
          opponent_abbr: "bra",
          team_score: aFra,
          opponent_score: aBra,
        }),
        "sensor.wc_bra": makeState("IN", {
          date,
          team_abbr: "bra",
          opponent_abbr: "fra",
          team_score: bra,
          opponent_score: fra,
        }),
      });
      const ids = ["sensor.wc_fra", "sensor.wc_bra"];
      const tracker = new BlinkTracker();
      tracker.record(ids, mk("0", "0", "0", "0"));
      const split = mk("1", "0", "2", "0");
      tracker.record(ids, split);
      const key = gameKeyFor("sensor.wc_fra", split);
      const first = blinkEntries(tracker).get(key)?.fra;
      expect(typeof first).toBe("number");
      vi.advanceTimersByTime(500);
      tracker.record(ids, split);
      expect(blinkEntries(tracker).get(key)?.fra).toBe(first);
    });
  });

  describe("held scores", () => {
    useFakeTimers();

    const ids = ["sensor.nba_lal"];
    const at = (team: string) => ({
      "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: team, opponent_score: "90" }),
    });

    it("holds the pre-change score, keeps the earliest across repeat changes, and drops it on expiry", () => {
      const tracker = new BlinkTracker();
      const key = gameKeyFor("sensor.nba_lal", at("90"));
      tracker.record(ids, at("90"));
      tracker.record(ids, at("92"));
      expect(blinkHeld(tracker).get(key)?.team).toBe(90);
      tracker.record(ids, at("93"));
      expect(blinkHeld(tracker).get(key)?.team).toBe(90);
      vi.advanceTimersByTime(6000);
      upd(tracker, at("93"));
      expect(blinkHeld(tracker).has(key)).toBe(false);
    });

    it("sync drops an already-closed window before recording, so the held score is the latest previous one", () => {
      const tracker = new BlinkTracker();
      const key = gameKeyFor("sensor.nba_lal", at("90"));
      tracker.record(ids, at("90"));
      upd(tracker, at("92"));
      expect(blinkHeld(tracker).get(key)?.team).toBe(90);
      vi.advanceTimersByTime(1500); // window closed, but nothing has pruned it yet
      upd(tracker, at("93"));
      expect(blinkHeld(tracker).get(key)?.team).toBe(92);
    });

    it("forgets a side's held score once its own window closes but another side's is open", () => {
      const tracker = new BlinkTracker();
      const key = gameKeyFor("sensor.nba_lal", at("90"));
      tracker.record(ids, at("90"));
      tracker.record(ids, at("92"));
      vi.advanceTimersByTime(700);
      tracker.record(ids, {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "92", opponent_score: "93" }),
      });
      vi.advanceTimersByTime(500);
      upd(tracker, {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "92", opponent_score: "93" }),
      });
      expect(Object.keys(blinkHeld(tracker).get(key) ?? {})).toEqual(["opponent"]);
    });

    it("drops held scores when the game is no longer live and on clear()", () => {
      const tracker = new BlinkTracker();
      const key = gameKeyFor("sensor.nba_lal", at("90"));
      tracker.record(ids, at("90"));
      tracker.record(ids, at("92"));
      tracker.record(ids, { "sensor.nba_lal": makeState("POST", baseAttrs) });
      expect(blinkHeld(tracker).has(key)).toBe(false);
      tracker.record(ids, at("90"));
      tracker.record(ids, at("92"));
      tracker.clear();
      expect(blinkHeld(tracker).size).toBe(0);
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
      const entry = blinkEntries(tracker).get(LAL);
      if (entry) entry.team = Date.now() - 1_500;
      upd(tracker, S95);
      expect(blinkEntries(tracker).has(LAL)).toBe(false);
    });

    it("keeps entries within the blink window", () => {
      const tracker = new BlinkTracker();
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "90" }),
      });
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      upd(tracker, S95);
      expect(blinkEntries(tracker).has(LAL)).toBe(true);
    });

    it("removes entries when the blink window is 0", () => {
      const tracker = new BlinkTracker();
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "90" }),
      });
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      upd(tracker, S95, OFF);
      expect(blinkEntries(tracker).has(LAL)).toBe(false);
    });

    it("prunes only the side that actually expired, keeping the other side's own window", () => {
      const tracker = new BlinkTracker();
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "88" }),
      });
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      const entry = blinkEntries(tracker).get(LAL);
      if (entry) {
        entry.team = Date.now() - 1_500; // expired
        entry.opponent = Date.now() - 500; // still within window
      }
      upd(tracker, S95);
      const pruned = blinkEntries(tracker).get(LAL);
      expect(pruned?.team).toBeUndefined();
      expect(pruned?.opponent).toBeDefined();
    });
  });

  describe("update pipeline", () => {
    useFakeTimers();

    it("records then prunes in one call, leaving the resulting entries", () => {
      const tracker = new BlinkTracker();
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "90" }),
      });
      upd(tracker, S95);
      expect(typeof blinkEntries(tracker).get(LAL)?.team).toBe("number");
    });

    it("prunes what it just recorded when blinking is off for the id", () => {
      const tracker = new BlinkTracker();
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "90" }),
      });
      upd(tracker, S95, OFF);
      expect(blinkEntries(tracker).has(LAL)).toBe(false);
    });

    it("treats an id missing from blinkOnById as on", () => {
      const tracker = new BlinkTracker();
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "90" }),
      });
      upd(tracker, S95, new Map([["sensor.other", false]]));
      expect(blinkEntries(tracker).has(LAL)).toBe(true);
      expect(tracker.timerActive).toBe(true);
    });

    it("reducedMotion leaves no entries, no timer and no fresh side, even if the map says on", () => {
      const tracker = new BlinkTracker();
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "90" }),
      });
      upd(tracker, S95, new Map([["sensor.nba_lal", true]]), vi.fn(), true);
      expect(blinkEntries(tracker).size).toBe(0);
      expect(tracker.timerActive).toBe(false);
      const view = tracker.rowView("sensor.nba_lal", S95);
      expect(view.freshHome || view.freshAway).toBe(false);
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
      upd(tracker, S95, undefined, vi.fn());
      expect(tracker.timerActive).toBe(true);
    });

    it("does not arm when there are no entries", () => {
      const tracker = new BlinkTracker();
      upd(tracker, S95, undefined, vi.fn());
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
      upd(tracker, S95, undefined, vi.fn());
      const activeAfterFirst = tracker.timerActive;
      upd(tracker, S95, undefined, vi.fn());
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
      upd(tracker, S95, undefined, onExpire);
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
      upd(tracker, S95, OFF);
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
      upd(tracker, {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "93", opponent_score: "90" }),
      });
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
      upd(tracker, S95, undefined, vi.fn());
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
      upd(tracker, S95, undefined, vi.fn());
      tracker.clear();
      expect(blinkEntries(tracker).size).toBe(0);
      expect(tracker.timerActive).toBe(false);
      // prev-scores were reset too: the same "change" replays as a first observation
      tracker.record(["sensor.nba_lal"], {
        "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score: "95", opponent_score: "90" }),
      });
      expect(blinkEntries(tracker).has(LAL)).toBe(false);
    });
  });

  describe("rowView", () => {
    useFakeTimers();

    it("reports no fresh side before any update (default policy is off)", () => {
      const states = { "sensor.nba_lal": makeState("IN", baseAttrs) };
      expect(new BlinkTracker().rowView("sensor.nba_lal", states)).toEqual({
        freshHome: false,
        freshAway: false,
        heldHome: undefined,
        heldAway: undefined,
      });
    });

    it("reports fresh and held per side, honoring team_homeaway, and nothing when blinkOn is false", () => {
      const tracker = new BlinkTracker();
      const ids = ["sensor.nba_lal"];
      const at = (team_score: string) => ({
        "sensor.nba_lal": makeState("IN", {
          ...baseAttrs,
          team_homeaway: "away",
          team_score,
          opponent_score: "90",
        }),
      });
      const upd = (score: string, on: boolean) =>
        tracker.update({
          states: at(score),
          trackedIds: ids,
          blinkOnById: new Map([["sensor.nba_lal", on]]),
          reducedMotion: false,
          onExpire: vi.fn(),
        });
      upd("93", true);
      upd("95", true);
      // the entity's team is away, so its score change shows on the away side
      expect(tracker.rowView("sensor.nba_lal", at("95"))).toEqual({
        freshHome: false,
        freshAway: true,
        heldHome: undefined,
        heldAway: 93,
      });
      upd("95", false);
      expect(tracker.rowView("sensor.nba_lal", at("95"))).toEqual({
        freshHome: false,
        freshAway: false,
        heldHome: undefined,
        heldAway: undefined,
      });
    });
  });

  describe("update", () => {
    useFakeTimers();

    const at = (team_score: string) => ({
      "sensor.nba_lal": makeState("IN", { ...baseAttrs, team_score, opponent_score: "0" }),
    });

    it("update stores the policy, blinks the changed side, and fires onExpire after BLINK_MS", () => {
      const tracker = new BlinkTracker();
      const onExpire = vi.fn();
      tracker.update({
        states: at("1"),
        trackedIds: ["sensor.nba_lal"],
        blinkOnById: new Map(),
        reducedMotion: false,
        onExpire,
      });
      tracker.update({
        states: at("2"),
        trackedIds: ["sensor.nba_lal"],
        blinkOnById: new Map(),
        reducedMotion: false,
        onExpire,
      });
      // baseAttrs has team_homeaway home, so the team is the home side
      expect(tracker.rowView("sensor.nba_lal", at("2"))).toEqual({
        freshHome: true,
        freshAway: false,
        heldHome: 1,
        heldAway: undefined,
      });
      vi.advanceTimersByTime(1000);
      expect(onExpire).toHaveBeenCalledTimes(1);
      expect(tracker.rowView("sensor.nba_lal", at("2")).freshHome).toBe(false);
    });

    it("update with blinking off yields no fresh side", () => {
      const tracker = new BlinkTracker();
      const onExpire = vi.fn();
      tracker.update({
        states: at("1"),
        trackedIds: ["sensor.nba_lal"],
        blinkOnById: OFF,
        reducedMotion: false,
        onExpire,
      });
      tracker.update({
        states: at("2"),
        trackedIds: ["sensor.nba_lal"],
        blinkOnById: OFF,
        reducedMotion: false,
        onExpire,
      });
      const view = tracker.rowView("sensor.nba_lal", at("2"));
      expect(view.freshHome || view.freshAway).toBe(false);
    });
  });

  describe("keys agree with rowView by construction", () => {
    useFakeTimers();

    const date = "2026-01-01T00:00Z";
    // one game, HOM vs AWY, seen from each sibling's perspective
    const sensors = (homeScore: number, awayScore: number) => ({
      "sensor.hom": makeState("IN", {
        ...baseAttrs,
        date,
        team_homeaway: "home",
        team_abbr: "HOM",
        opponent_abbr: "AWY",
        team_score: homeScore,
        opponent_score: awayScore,
      }),
      "sensor.awy": makeState("IN", {
        ...baseAttrs,
        date,
        team_homeaway: "away",
        team_abbr: "AWY",
        opponent_abbr: "HOM",
        team_score: awayScore,
        opponent_score: homeScore,
      }),
    });

    it.each(["sensor.hom", "sensor.awy"])(
      "%s: home change blinks home only, keyed by home abbr",
      (id) => {
        const t = new BlinkTracker();
        t.record([id], sensors(1, 1));
        t.record([id], sensors(2, 1));
        const view = t.rowView(id, sensors(2, 1));
        expect(view.freshHome).toBe(true);
        expect(view.freshAway).toBe(false);
        expect(Object.keys(blinkEntries(t).get(gameKeyFor(id, sensors(2, 1))) ?? {})).toEqual([
          "HOM",
        ]);
      }
    );

    it.each(["sensor.hom", "sensor.awy"])(
      "%s: away change blinks away only, keyed by away abbr",
      (id) => {
        const t = new BlinkTracker();
        t.record([id], sensors(1, 1));
        t.record([id], sensors(1, 2));
        const view = t.rowView(id, sensors(1, 2));
        expect(view.freshHome).toBe(false);
        expect(view.freshAway).toBe(true);
        expect(Object.keys(blinkEntries(t).get(gameKeyFor(id, sensors(1, 2))) ?? {})).toEqual([
          "AWY",
        ]);
      }
    );

    it("a blink recorded via one sibling shows on the other sibling's row", () => {
      const t = new BlinkTracker();
      t.record(["sensor.hom"], sensors(1, 1));
      t.record(["sensor.hom"], sensors(2, 1));
      expect(t.rowView("sensor.awy", sensors(2, 1))).toMatchObject({
        freshHome: true,
        freshAway: false,
      });
    });
  });
});
