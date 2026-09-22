/** One interval-or-timeout lifecycle: arm, replace, and clear, behind a seam that hides
 *  which underlying primitive is running. The card has five of these (fixed refresh, debug
 *  refresh, lazy render, slide rotation, blink expiry); each used to hand-roll its own
 *  nullable handle plus a paired clear — this is the one place that bookkeeping lives now. */
export class CancelableTimer {
  private _handle: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval> | null = null;
  private _kind: "interval" | "timeout" | null = null;

  get active(): boolean {
    return this._handle !== null;
  }

  /** Starts a repeating interval, replacing whatever timer (of either kind) is already running. */
  start(ms: number, fn: () => void): void {
    this.stop();
    this._handle = setInterval(fn, ms);
    this._kind = "interval";
  }

  /** Arms a one-shot timeout that clears its own handle when it fires. No-op while a timer
   *  (of either kind) is already running — mirrors the "don't restart what's pending"
   *  guard every caller used to write for itself. */
  armOnce(ms: number, fn: () => void): void {
    if (this._handle !== null) return;
    this._kind = "timeout";
    this._handle = setTimeout(() => {
      this._handle = null;
      this._kind = null;
      fn();
    }, ms);
  }

  stop(): void {
    if (this._handle === null) return;
    if (this._kind === "interval") {
      clearInterval(this._handle as ReturnType<typeof setInterval>);
    } else {
      clearTimeout(this._handle as ReturnType<typeof setTimeout>);
    }
    this._handle = null;
    this._kind = null;
  }
}
