import { buildTrackedIds, hasRelevantChange } from "./config-match.js";
import { CancelableTimer } from "./timer.js";
import type { CardConfig, HomeAssistant } from "./types.js";

export interface RefreshSchedulerOptions {
  onRender: () => void;
  onDebug?: (kind: "events" | "filtered") => void;
  /** config applied while attached, just before the initial render */
  onConfigured?: () => void;
  onDebugTick?: () => void;
}

/** Owns the refresh lifecycle: attach/detach, fixed/debug/lazy timers. */
export class RefreshScheduler {
  config: CardConfig | null = null;
  hass: HomeAssistant | null = null;
  trackedIds: Set<string> | null = null;
  trackedBySection: Map<number, string[]> | null = null;
  blinkOnById: Map<string, boolean> | null = null;
  private detached = false;
  readonly fixedTimer = new CancelableTimer();
  readonly debugTimer = new CancelableTimer();
  readonly renderTimer = new CancelableTimer();

  constructor(private readonly opts: RefreshSchedulerOptions) {}

  refreshTracked(stateKeys: string[]): Set<string> {
    const r = buildTrackedIds(this.config?.sections ?? [], stateKeys);
    this.trackedIds = r.trackedIds;
    this.trackedBySection = r.trackedBySection;
    this.blinkOnById = r.blinkOnById;
    return r.trackedIds;
  }

  reset(): void {
    this.trackedIds = null;
    this.trackedBySection = null;
    this.blinkOnById = null;
  }

  configure(config: CardConfig): void {
    this.reset();
    this.config = config;
    this.renderTimer.stop();
    // detached: attach() rebuilds timers/render on re-attach
    if (this.detached) return;
    this.startTimers();
    this.opts.onConfigured?.();
    if (this.hass) this.opts.onRender();
  }

  setHass(hass: HomeAssistant): void {
    const isFirstCall = !this.trackedIds;
    const prevHass = this.hass;
    this.hass = hass;
    if (this.detached) return;
    if (isFirstCall) {
      if (this.config) this.opts.onRender();
      else this.refreshTracked(Object.keys(hass.states));
      return;
    }
    if (this.config && hasRelevantChange(this.trackedIds, hass.states, prevHass?.states)) {
      if (this.config.debug) this.opts.onDebug?.("events");
      this.scheduleRender();
    }
  }

  attach(): void {
    this.detached = false;
    if (!this.config) return;
    this.startTimers();
    // detach dropped the tracked ids; HA may not re-assign hass on a re-attach, so rebuild them here
    if (this.hass && !this.trackedIds) this.opts.onRender();
  }

  detach(): void {
    this.detached = true;
    this.reset();
    this.stopTimers();
    this.renderTimer.stop();
  }

  scheduleRender(): void {
    if (this.renderTimer.active) return;
    if (this.config?.debug) this.opts.onDebug?.("filtered");
    const lazyMs = (this.config?.lazy_refresh ?? 5) * 1000;
    if (lazyMs === 0) {
      this.opts.onRender();
      return;
    }
    this.renderTimer.armOnce(lazyMs, () => {
      if (this.hass && this.config) this.opts.onRender();
    });
  }

  private startTimers(): void {
    this.stopTimers();
    const fixedMs = (this.config?.fixed_refresh ?? 60) * 1000;
    if (fixedMs > 0) {
      this.fixedTimer.start(fixedMs, () => {
        if (this.hass && this.config) this.opts.onRender();
      });
    }
    if (this.config?.debug) {
      this.debugTimer.start(1000, () => {
        if (this.hass && this.config) this.opts.onDebugTick?.();
      });
    }
  }

  private stopTimers(): void {
    this.fixedTimer.stop();
    this.debugTimer.stop();
  }
}
