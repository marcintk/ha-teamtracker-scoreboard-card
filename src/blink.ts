import { type GameKey, gameKeyFor } from "./game-key.js";
import { gameView } from "./game-view.js";
import { CancelableTimer } from "./timer.js";
import type { HassStates, ScoreBlinkEntry } from "./types.js";
import { BLINK_MS, isLive } from "./utils.js";

/** Whether a single per-side blink timestamp is still inside its window. The one place this
 *  rule is written — both `BlinkTracker.prune` and `rowView` (below) call it, so a row's
 *  "is this blinking right now" can never drift from when the tracker itself considers that
 *  side's window closed. */
function isBlinkFresh(at: number | undefined, now: number): boolean {
  return at !== undefined && now - at < BLINK_MS;
}

/** What one displayed row needs to blink: per-side freshness and the score held until the
 *  window closes (only while that side is fresh). */
export interface RowBlink {
  freshHome: boolean;
  freshAway: boolean;
  heldHome?: number;
  heldAway?: number;
}

/** Everything tracked for one game, dropped together when no sensor for it is live. */
interface GameBlink {
  /** last numeric score seen per team */
  prev: Record<string, number>;
  /** per-team time of the latest score change */
  changedAt: ScoreBlinkEntry;
  /** the score each side showed before its blink window opened — shown (blinking) until the
   *  window closes, then the new score is revealed */
  held: Record<string, number>;
  /** the game's sensors currently in IN state */
  liveIds: string[];
}

/** One score per team across a game's live sibling sensors: the max, so a stale (lower)
 *  sibling can neither hide a change nor make the score flap. NaN (e.g. "176/5") only
 *  survives when no sibling has a numeric score. */
function currentScores(liveIds: string[], states: HassStates): Map<string, number> {
  const scores = new Map<string, number>();
  for (const id of liveIds) {
    const v = gameView(states[id]);
    for (const side of [v.home, v.away]) {
      const { abbr } = side;
      const score = Number(side.score ?? 0);
      const prior = scores.get(abbr);
      if (prior === undefined || (Number.isFinite(score) && !(score <= prior))) {
        scores.set(abbr, score);
      }
    }
  }
  return scores;
}

/** Tracks per-game score-change timestamps for live (IN) games and the single timer that
 *  wakes a render once the last open blink window closes. Keyed by `gameKeyFor` rather than
 *  by raw sensor id: a game's two sibling sensors (each team's own) can independently flip
 *  `state` a tick apart, which flips which one wins `sorting.ts`'s dedup and gets displayed
 *  — keying by the displayed sensor's own id would let a blink armed against the *other*
 *  sibling vanish into thin air the moment dedup's pick changes. */
export class BlinkTracker {
  private _games = new Map<GameKey, GameBlink>();
  private _timer = new CancelableTimer();
  private _blinkOnById: ReadonlyMap<string, boolean> = new Map();
  private _reducedMotion = false;

  /** One pass per render: record, prune, arm the expiry timer, and keep the policy `rowView`
   *  uses. Reduced motion disables blinking outright; an id absent from the map defaults to on. */
  update(o: {
    states: HassStates;
    trackedIds: Iterable<string>;
    blinkOnById: ReadonlyMap<string, boolean>;
    reducedMotion: boolean;
    onExpire: () => void;
  }): void {
    this._blinkOnById = o.blinkOnById;
    this._reducedMotion = o.reducedMotion;
    this.record(o.trackedIds, o.states);
    this._prune();
    this._armTimer(o.onExpire);
  }

  private _isOn = (id: string): boolean =>
    !this._reducedMotion && (this._blinkOnById.get(id) ?? true);

  get timerActive(): boolean {
    return this._timer.active;
  }

  /** Diffs each game's current score per team against its last-seen value and records a fresh
   *  timestamp on change; a game with no sensor left in IN state is dropped entirely. */
  record(trackedIds: Iterable<string>, states: HassStates): void {
    const groups = new Map<GameKey, string[]>();
    for (const id of trackedIds) {
      const key = gameKeyFor(id, states);
      const ids = groups.get(key);
      if (ids) ids.push(id);
      else groups.set(key, [id]);
    }

    const now = Date.now();
    for (const [key, ids] of groups) {
      const liveIds = ids.filter((id) => isLive(states, id));
      if (!liveIds.length) {
        this._games.delete(key);
        continue;
      }
      const g = this._games.get(key) ?? { prev: {}, changedAt: {}, held: {}, liveIds };
      g.liveIds = liveIds;
      this._games.set(key, g);

      // a window that already closed (late timer, background tab) must not lend its held
      // score to a new change
      for (const [abbr, at] of Object.entries(g.changedAt)) {
        if (!isBlinkFresh(at, now)) {
          delete g.changedAt[abbr];
          delete g.held[abbr];
        }
      }

      for (const [abbr, score] of currentScores(liveIds, states)) {
        if (!Number.isFinite(score)) {
          delete g.changedAt[abbr];
          delete g.held[abbr];
          delete g.prev[abbr]; // reset the baseline so a post-gap change isn't diffed against a stale value
          continue;
        }
        const before = g.prev[abbr];
        if (before !== undefined && before !== score) {
          g.changedAt[abbr] = now;
          g.held[abbr] ??= before; // a change inside an open window keeps the score the user last saw
        }
        g.prev[abbr] = score;
      }
    }
  }

  /** The blink display for one rendered row. Looked up by game, not by this row's own raw id,
   *  so a blink armed against the dedup-discarded sibling sensor still surfaces. Each side's
   *  own timestamp gates its own window — a change on one side must not cut the other's short. */
  rowView(entityId: string, states: HassStates): RowBlink {
    const blinkOn = this._isOn(entityId);
    const key = gameKeyFor(entityId, states);
    const g = this._games.get(key);
    // same gameView as currentScores, so the abbrs read here are the keys record() wrote
    const { home, away } = gameView(states[entityId]);
    const homeAbbr = home.abbr;
    const awayAbbr = away.abbr;
    const now = Date.now();
    const freshHome = blinkOn && isBlinkFresh(g?.changedAt[homeAbbr], now);
    const freshAway = blinkOn && isBlinkFresh(g?.changedAt[awayAbbr], now);
    return {
      freshHome,
      freshAway,
      heldHome: freshHome ? g?.held[homeAbbr] : undefined,
      heldAway: freshAway ? g?.held[awayAbbr] : undefined,
    };
  }

  /** Drops any per-team timestamp whose own blink window (`BLINK_MS`, or at once if no
   *  sensor currently reporting that game has blinking on) has closed. */
  private _prune(): void {
    const now = Date.now();
    for (const g of this._games.values()) {
      const open = Object.entries(g.changedAt);
      if (!open.length) continue;
      const on = g.liveIds.some(this._isOn);
      for (const [abbr, at] of open) {
        if (!on || !isBlinkFresh(at, now)) {
          delete g.changedAt[abbr];
          delete g.held[abbr];
        }
      }
    }
  }

  /** Arms a single timer for the earliest-expiring open window across every tracked game,
   *  so a render is scheduled exactly once the last blink should stop. No-op while a
   *  timer is already running or nothing is blinking. */
  private _armTimer(onExpire: () => void): void {
    if (this._timer.active) return;
    const now = Date.now();
    let minExpiry = Infinity;
    for (const g of this._games.values()) {
      if (!g.liveIds.some(this._isOn)) continue;
      for (const at of Object.values(g.changedAt)) {
        minExpiry = Math.min(minExpiry, at + BLINK_MS);
      }
    }
    if (minExpiry === Infinity) return;
    this._timer.armOnce(Math.max(50, minExpiry - now), onExpire);
  }

  clearTimer(): void {
    this._timer.stop();
  }

  /** Resets all tracked state and cancels any pending timer. */
  clear(): void {
    this._games.clear();
    this.clearTimer();
  }
}
