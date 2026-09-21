import type { HassStates, ScoreBlinkEntry } from "../types.js";

/** Resolves how long (ms) an id should keep blinking; the caller owns config/section lookup. */
export type BlinkMsFor = (id: string) => number;

/** Whether a single per-side blink timestamp is still inside its window. The one place this
 *  rule is written — both `BlinkTracker.prune` (below) and `render.ts`'s row-freshness check
 *  call it, so a row's "is this blinking right now" can never drift from when the tracker
 *  itself considers that side's window closed. */
export function isBlinkFresh(at: number | undefined, blinkMs: number, now: number): boolean {
  return blinkMs > 0 && at !== undefined && now - at < blinkMs;
}

/** Tracks per-side score-change timestamps for live (IN) games and the single timer that
 *  wakes a render once the last open blink window closes. Detection, expiry and timer
 *  arming are one cohesive concern — kept behind this seam so a caller only ever needs
 *  `record` / `prune` / `armTimer` / `entries`, never the raw timestamp maps. */
export class BlinkTracker {
  private _scoreChangedAt = new Map<string, ScoreBlinkEntry>();
  private _prevScores = new Map<string, { t: number; o: number }>();
  private _timer: ReturnType<typeof setTimeout> | null = null;

  get entries(): ReadonlyMap<string, ScoreBlinkEntry> {
    return this._scoreChangedAt;
  }

  get timerActive(): boolean {
    return this._timer !== null;
  }

  /** Diffs each tracked id's score against its last-seen value and records a fresh
   *  per-side timestamp on change; leaving IN state drops the id entirely. */
  record(trackedIds: Iterable<string>, states: HassStates): void {
    for (const id of trackedIds) {
      const gs = states[id]?.state;
      const attr = states[id]?.attributes;
      if (gs === "IN") {
        const t = Number(attr?.team_score ?? 0);
        const o = Number(attr?.opponent_score ?? 0);
        const prev = this._prevScores.get(id);
        if (prev && (prev.t !== t || prev.o !== o)) {
          const now = Date.now();
          // merge, don't overwrite — a change on one side must not reset/cancel the
          // other side's own still-running blink window (see prune)
          const next: ScoreBlinkEntry = { ...this._scoreChangedAt.get(id) };
          if (prev.t !== t) next.team = now;
          if (prev.o !== o) next.opponent = now;
          this._scoreChangedAt.set(id, next);
        }
        this._prevScores.set(id, { t, o });
      } else {
        this._prevScores.delete(id);
        this._scoreChangedAt.delete(id);
      }
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

  /** Drops any per-side timestamp whose own blink window (from `blinkMsFor`) has closed. */
  prune(blinkMsFor: BlinkMsFor): void {
    if (!this._scoreChangedAt.size) return;
    const now = Date.now();
    for (const [id, entry] of this._scoreChangedAt) {
      const blinkMs = blinkMsFor(id);
      const next: ScoreBlinkEntry = {};
      if (isBlinkFresh(entry.team, blinkMs, now)) {
        next.team = entry.team;
      }
      if (isBlinkFresh(entry.opponent, blinkMs, now)) {
        next.opponent = entry.opponent;
      }
      if (next.team === undefined && next.opponent === undefined) {
        this._scoreChangedAt.delete(id);
      } else {
        this._scoreChangedAt.set(id, next);
      }
    }
  }

  /** Arms a single timer for the earliest-expiring open window across every tracked id,
   *  so a render is scheduled exactly once the last blink should stop. No-op while a
   *  timer is already running or nothing is blinking. */
  armTimer(blinkMsFor: BlinkMsFor, onExpire: () => void): void {
    if (this._timer || !this._scoreChangedAt.size) return;
    const now = Date.now();
    let minExpiry = Infinity;
    for (const [id, entry] of this._scoreChangedAt) {
      const blinkMs = blinkMsFor(id);
      if (blinkMs <= 0) continue;
      if (entry.team !== undefined) minExpiry = Math.min(minExpiry, entry.team + blinkMs);
      if (entry.opponent !== undefined) minExpiry = Math.min(minExpiry, entry.opponent + blinkMs);
    }
    if (minExpiry === Infinity) return;
    this._timer = setTimeout(
      () => {
        this._timer = null;
        onExpire();
      },
      Math.max(50, minExpiry - now)
    );
  }

  clearTimer(): void {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  /** Resets all tracked state and cancels any pending timer. */
  clear(): void {
    this._scoreChangedAt.clear();
    this._prevScores.clear();
    this.clearTimer();
  }
}
