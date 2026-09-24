import { gameKeyFor } from "./sorting.js";
import { CancelableTimer } from "./timer.js";
import type { GameAttr, HassStates, ScoreBlinkEntry } from "./types.js";

/** Resolves how long (ms) an id should keep blinking; the caller owns config/section lookup. */
export type BlinkMsFor = (id: string) => number;

/** Whether a single per-side blink timestamp is still inside its window. The one place this
 *  rule is written — both `BlinkTracker.prune` (below) and `render.ts`'s row-freshness check
 *  call it, so a row's "is this blinking right now" can never drift from when the tracker
 *  itself considers that side's window closed. */
export function isBlinkFresh(at: number | undefined, blinkMs: number, now: number): boolean {
  return blinkMs > 0 && at !== undefined && now - at < blinkMs;
}

/** The two `ScoreBlinkEntry` keys for one sensor's own attributes — its own team's abbr and
 *  its opponent's, falling back to the literal "team"/"opponent" when a sensor (typically a
 *  test fixture) has no `team_abbr`. `render.ts` uses the same pair to look a side's
 *  freshness back up, so a key computed here can never drift from one read out there. */
export function teamAbbr(attr: GameAttr | undefined): string {
  return attr?.team_abbr ?? "team";
}
export function opponentAbbr(attr: GameAttr | undefined): string {
  return attr?.opponent_abbr ?? "opponent";
}

/** Tracks per-game score-change timestamps for live (IN) games and the single timer that
 *  wakes a render once the last open blink window closes. Keyed by `gameKeyFor` rather than
 *  by raw sensor id: a game's two sibling sensors (each team's own) can independently flip
 *  `state` a tick apart, which flips which one wins `sorting.ts`'s dedup and gets displayed
 *  — keying by the displayed sensor's own id would let a blink armed against the *other*
 *  sibling vanish into thin air the moment dedup's pick changes. Detection, expiry and timer
 *  arming are one cohesive concern — kept behind this seam so a caller only ever needs
 *  `record` / `prune` / `armTimer` / `entries`, never the raw timestamp maps. */
export class BlinkTracker {
  private _scoreChangedAt = new Map<string, ScoreBlinkEntry>();
  private _prevScores = new Map<string, Record<string, number>>();
  private _liveIds = new Map<string, string[]>();
  private _timer = new CancelableTimer();

  get entries(): ReadonlyMap<string, ScoreBlinkEntry> {
    return this._scoreChangedAt;
  }

  get timerActive(): boolean {
    return this._timer.active;
  }

  /** The blink window for one game: the longest `blinkMsFor` across every sensor currently
   *  reporting it — mirrors `blinkMsForId`'s own "longest wins" rule, just one level up. */
  private _blinkMsForGame(key: string, blinkMsFor: BlinkMsFor): number {
    // record() only ever sets a _scoreChangedAt entry alongside a _liveIds entry for the
    // same key, and both are cleared together, so a key reaching here always has one
    const ids = this._liveIds.get(key) as string[];
    return Math.max(0, ...ids.map(blinkMsFor));
  }

  /** Diffs each tracked id's own score against its own last-seen value, grouped by the game
   *  it belongs to, and records a fresh per-team timestamp on change; a game with no sensor
   *  left in IN state is dropped entirely. */
  record(trackedIds: Iterable<string>, states: HassStates): void {
    const groups = new Map<string, string[]>();
    for (const id of trackedIds) {
      const key = gameKeyFor(id, states);
      const ids = groups.get(key);
      if (ids) ids.push(id);
      else groups.set(key, [id]);
    }

    for (const [key, ids] of groups) {
      const liveIds = ids.filter((id) => states[id]?.state === "IN");
      if (!liveIds.length) {
        this._prevScores.delete(key);
        this._scoreChangedAt.delete(key);
        this._liveIds.delete(key);
        continue;
      }
      this._liveIds.set(key, liveIds);

      const prevScores = this._prevScores.get(key) ?? {};
      const changedAt: ScoreBlinkEntry = { ...this._scoreChangedAt.get(key) };
      let changed = false;
      let now: number | undefined;
      for (const id of liveIds) {
        const attr = states[id]?.attributes;
        const pairs: Array<[string, number]> = [
          [teamAbbr(attr), Number(attr?.team_score ?? 0)],
          [opponentAbbr(attr), Number(attr?.opponent_score ?? 0)],
        ];
        for (const [abbr, score] of pairs) {
          if (prevScores[abbr] !== undefined && prevScores[abbr] !== score) {
            now ??= Date.now();
            changedAt[abbr] = now;
            changed = true;
          }
          prevScores[abbr] = score;
        }
      }
      this._prevScores.set(key, prevScores);
      if (changed) this._scoreChangedAt.set(key, changedAt);
    }
  }

  /** Records this pass's score changes, prunes expired windows, and returns the
   *  now-current entries to render with — in that order, every time. Record must run
   *  before prune (a timestamp has to reflect the latest score before its window is
   *  judged) and prune before the entries are read for rendering (so a row's "is this
   *  blinking" state can't disagree with the tracker's own window). Callers used to
   *  reconstruct that order themselves by calling `record`/`prune`/`entries` in
   *  sequence; `sync` makes the order part of the interface instead of the caller's
   *  responsibility. `armTimer` is independent of this ordering (it only reads
   *  whatever the map currently holds) and stays a separate call. */
  sync(
    trackedIds: Iterable<string>,
    states: HassStates,
    blinkMsFor: BlinkMsFor
  ): ReadonlyMap<string, ScoreBlinkEntry> {
    this.record(trackedIds, states);
    this.prune(blinkMsFor);
    return this.entries;
  }

  /** Drops any per-team timestamp whose own blink window (from `blinkMsFor`, resolved
   *  against whichever sensors currently report that game) has closed. */
  prune(blinkMsFor: BlinkMsFor): void {
    if (!this._scoreChangedAt.size) return;
    const now = Date.now();
    for (const [key, entry] of this._scoreChangedAt) {
      const blinkMs = this._blinkMsForGame(key, blinkMsFor);
      const next: ScoreBlinkEntry = {};
      for (const [abbr, at] of Object.entries(entry)) {
        if (isBlinkFresh(at, blinkMs, now)) next[abbr] = at;
      }
      if (Object.keys(next).length === 0) {
        this._scoreChangedAt.delete(key);
      } else {
        this._scoreChangedAt.set(key, next);
      }
    }
  }

  /** Arms a single timer for the earliest-expiring open window across every tracked game,
   *  so a render is scheduled exactly once the last blink should stop. No-op while a
   *  timer is already running or nothing is blinking. */
  armTimer(blinkMsFor: BlinkMsFor, onExpire: () => void): void {
    if (this._timer.active || !this._scoreChangedAt.size) return;
    const now = Date.now();
    let minExpiry = Infinity;
    for (const [key, entry] of this._scoreChangedAt) {
      const blinkMs = this._blinkMsForGame(key, blinkMsFor);
      if (blinkMs <= 0) continue;
      for (const at of Object.values(entry)) {
        minExpiry = Math.min(minExpiry, at + blinkMs);
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
    this._scoreChangedAt.clear();
    this._prevScores.clear();
    this._liveIds.clear();
    this.clearTimer();
  }
}
