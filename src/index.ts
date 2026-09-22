/// <reference path="../globals.d.ts" />

import { html, nothing, render, type TemplateResult } from "lit";
import { BlinkTracker } from "./blink.js";
import { blinkMsForId, buildTrackedIds, hasRelevantChange } from "./config-match.js";
import { DebugMetrics } from "./debug.js";
import { asPx, buildHaCardStyle, resolveVisibleSections, rowGeometryPx } from "./layout.js";
import { buildCardTemplate } from "./render.js";
import { CancelableSubscription } from "./subscription.js";
import { CancelableTimer } from "./timer.js";
import type { CardConfig, HomeAssistant, LayoutConfig } from "./types.js";
import { DEFAULT_LIMIT, DEFAULT_SLIDE_SEC, DEFAULT_TV_BADGE_CHARS } from "./utils.js";

export class SportScoreboardCard extends HTMLElement {
  readonly _root: ShadowRoot;
  _config: CardConfig | null;
  _hass: HomeAssistant | null;
  _fixedTimer: CancelableTimer;
  _debugTimer: CancelableTimer;
  _renderTimer: CancelableTimer;
  _slideTimer: CancelableTimer;
  _slideIndex: number;
  _slidePaused: boolean;
  _trackedIds: Set<string> | null;
  _trackedBySection: Map<number, string[]> | null;
  _subscription: CancelableSubscription;
  _debug: DebugMetrics;
  _blink: BlinkTracker;

  constructor() {
    super();
    this._root = this.attachShadow({ mode: "open" });
    this._config = null;
    this._hass = null;
    this._fixedTimer = new CancelableTimer();
    this._debugTimer = new CancelableTimer();
    this._renderTimer = new CancelableTimer();
    this._slideTimer = new CancelableTimer();
    this._slideIndex = 0;
    this._slidePaused = false;
    this._trackedIds = null;
    this._trackedBySection = null;
    this._subscription = new CancelableSubscription();
    this._debug = new DebugMetrics();
    this._blink = new BlinkTracker();
  }

  setConfig(config: CardConfig): void {
    this._config = config;
    this._clearSubscription();
    this._trackedIds = null;
    this._trackedBySection = null;
    this._blink.clear();
    this._slideIndex = 0;
    this._slidePaused = this._prefersReducedMotion();
    this._startFixedTimer();
    this._stopSlideTimer();
    this._syncSlideTimer();
    if (this._hass) {
      this._render();
      this._subscribe();
    }
  }

  set hass(hass: HomeAssistant) {
    const isFirstCall = !this._trackedIds;
    const connectionChanged = !isFirstCall && this._hass?.connection !== hass.connection;
    const prevHass = this._hass;
    this._hass = hass;

    if (isFirstCall || connectionChanged) {
      if (connectionChanged) this._clearSubscription();
      if (this._config) {
        this._render();
      } else {
        this._buildTrackedIds(Object.keys(hass.states));
      }
      this._subscribe();
      return;
    }

    if (!this._subscription.active && this._hasRelevantChange(hass, prevHass) && this._config) {
      this._scheduleRender();
    }
  }

  _scheduleRender(): void {
    if (this._renderTimer.active) return;
    if (this._config?.debug) this._debug.track("filtered");
    const lazyMs = (this._config?.lazy_refresh ?? 5) * 1000;
    if (lazyMs === 0) {
      this._render();
      return;
    }
    this._renderTimer.armOnce(lazyMs, () => {
      if (this._hass && this._config) this._render();
    });
  }

  _subscribe(): void {
    if (!this._config || !this._hass?.connection) return;
    this._subscription.subscribe(this._hass.connection, this._trackedIds, () => {
      if (this._config?.debug) this._debug.track("events");
      this._scheduleRender();
    });
  }

  _clearSubscription(): void {
    this._subscription.clear();
    this._renderTimer.stop();
    this._blink.clearTimer();
  }

  _startFixedTimer(): void {
    this._stopFixedTimer();
    const fixedMs = (this._config?.fixed_refresh ?? 60) * 1000;
    if (fixedMs > 0) {
      this._fixedTimer.start(fixedMs, () => {
        if (this._hass && this._config) this._render();
      });
    }
    if (this._config?.debug) {
      this._debugTimer.start(1000, () => {
        if (this._hass && this._config) this._refreshDebugOverlay();
      });
    }
  }

  /** slide mode is on: `mode: "slide"` with at least two sections to rotate through. */
  _isSlideMode(): boolean {
    return this._config?.mode === "slide" && (this._config?.sections?.length ?? 0) >= 2;
  }

  /** seconds per section in slide mode; a missing / non-positive value falls back to 45. */
  _slideSec(): number {
    const s = this._config?.slide_sec;
    return typeof s === "number" && s > 0 ? s : DEFAULT_SLIDE_SEC;
  }

  /** characters shown in the TV-network badge; a missing / negative value falls back to 4, `0` hides the badge. */
  _tvBadge(): number {
    const n = this._config?.tv_badge;
    return typeof n === "number" && n >= 0 ? n : DEFAULT_TV_BADGE_CHARS;
  }

  _syncSlideTimer(): void {
    const shouldRun = this._isSlideMode() && !this._slidePaused;
    if (shouldRun && !this._slideTimer.active) {
      this._slideTimer.start(this._slideSec() * 1000, () => {
        const n = this._config?.sections?.length ?? 0;
        if (n >= 2) {
          this._slideIndex = (this._slideIndex + 1) % n;
          if (this._hass && this._config) this._render();
        }
      });
    } else if (!shouldRun && this._slideTimer.active) {
      this._stopSlideTimer();
    }
  }

  _stopSlideTimer(): void {
    this._slideTimer.stop();
  }

  _slideStep(dir: number): void {
    const n = this._config?.sections?.length ?? 0;
    if (n < 2) return;
    this._slideIndex = (((this._slideIndex + dir) % n) + n) % n;
    this._slidePaused = true;
    this._syncSlideTimer();
    this._render();
  }

  _slideToggle(): void {
    this._slidePaused = !this._slidePaused;
    this._syncSlideTimer();
    this._render();
  }

  _prefersReducedMotion(): boolean {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  }

  _slideBtn(label: string, onClick: () => void, extra: string): TemplateResult {
    // every icon is a CSS shape keyed off `extra` (nav prev/next, toggle) — the
    // button carries no text
    return html`<button
      class="slide-btn ${extra}"
      title=${label}
      aria-label=${label}
      @click=${onClick}
    ></button>`;
  }

  _refreshDebugOverlay(): void {
    const el = this._root.querySelector("#sc-debug");
    if (el) el.innerHTML = this._debug.tableHtml();
  }

  _stopFixedTimer(): void {
    this._fixedTimer.stop();
    this._debugTimer.stop();
  }

  disconnectedCallback(): void {
    this._stopFixedTimer();
    this._stopSlideTimer();
    this._clearSubscription();
    this._trackedIds = null;
    this._blink.clear();
  }

  // assigns this._trackedIds / this._trackedBySection from the pure buildTrackedIds() in
  // utils.ts — the matching rule itself lives there so it can be tested without
  // instantiating this element, and can't drift from render.ts's own use of it.
  _buildTrackedIds(stateKeys: string[]): void {
    const { trackedIds, trackedBySection } = buildTrackedIds(
      this._config?.sections ?? [],
      stateKeys
    );
    this._trackedIds = trackedIds;
    this._trackedBySection = trackedBySection;
  }

  _hasRelevantChange(newHass: HomeAssistant, prevHass: HomeAssistant | null): boolean {
    return hasRelevantChange(this._trackedIds, this._config, newHass.states, prevHass?.states);
  }

  _layout(): LayoutConfig {
    return this._config?.layout ?? {};
  }

  _render(): void {
    try {
      const {
        sections,
        colors = {},
        debug,
        show_version,
        highlight_winner = true,
      } = this._config as CardConfig;
      const layout = this._layout();
      const states = (this._hass as HomeAssistant).states;
      const stateKeys = Object.keys(states);
      this._buildTrackedIds(stateKeys);
      const blinkMsFor = (id: string): number => blinkMsForId(sections ?? [], id);
      // _buildTrackedIds always assigns a Set just above; the field stays nullable only
      // because it's cleared elsewhere in the card's lifecycle (setConfig, disconnectedCallback)
      const blinkEntries = this._blink.sync(this._trackedIds as Set<string>, states, blinkMsFor);

      if (!Array.isArray(sections) || !sections.length) {
        this._showError("Add at least one section to your card config.");
        return;
      }

      if (debug) this._debug.track("rendered");

      this._syncSlideTimer();

      const carousel = this._isSlideMode();
      const slideControls = carousel
        ? html`<span class="slide-ctrls${this._slidePaused ? " paused" : ""}"
            >${this._slideBtn("Previous section", () => this._slideStep(-1), "nav prev")}${this._slideBtn(
              this._slidePaused ? "Resume rotation" : "Stop rotation",
              () => this._slideToggle(),
              this._slidePaused ? "toggle paused" : "toggle"
            )}${this._slideBtn("Next section", () => this._slideStep(1), "nav next")}</span
          >`
        : nothing;
      const haCardStyle = buildHaCardStyle(layout, sections, carousel);
      const visibleSections = resolveVisibleSections(sections, carousel, this._slideIndex);

      // card-level badge — sits over the top-centre of the card, shown whenever
      // show_version is set regardless of whether any section renders
      const versionBadge = show_version
        ? html`<span id="sc-version" class="sc-version">v${__CARD_VERSION__}</span>`
        : nothing;

      const tvBadge = this._tvBadge();
      const { template } = buildCardTemplate({
        states,
        trackedBySection: this._trackedBySection,
        colors,
        blinkEntries,
        blinkMsFor,
        carousel,
        visibleSections,
        slideControls,
        highlightWinner: highlight_winner,
        tvBadge,
        haCardStyle,
        versionBadge,
        debugTableHtml: debug ? this._debug.tableHtml() : null,
      });

      render(template, this._root);

      this._blink.armTimer(blinkMsFor, () => {
        if (this._hass && this._config) this._render();
      });
    } catch (e) {
      this._showError((e as Error).message);
      // biome-ignore lint/suspicious/noConsole: intentional render error logging
      console.error("ha-teamtracker-scoreboard-card render error:", e);
    }
  }

  _showError(msg: string): void {
    render(
      html`<ha-card>
        <div style="padding:12px;color:var(--error-color,red);font-size:13px;">
          <b>ha-teamtracker-scoreboard-card error:</b><br />${msg}
        </div>
      </ha-card>`,
      this._root
    );
  }

  getCardSize(): number {
    const { height, row_height, row_padding } = this._layout();
    const hpx = asPx(height);
    if (hpx !== null) return Math.max(1, Math.ceil(hpx / 50));
    const sections = this._config?.sections ?? [];
    const carousel = this._isSlideMode();
    const rows = carousel
      ? Math.max(0, ...sections.map((s) => 1 + (s.limit ?? DEFAULT_LIMIT)))
      : sections.reduce((n, s) => n + 1 + (s.limit ?? DEFAULT_LIMIT), 0);
    const h = rowGeometryPx(row_height, row_padding);
    return Math.max(1, Math.ceil((rows * h) / 50));
  }

  static getStubConfig(): CardConfig {
    return {
      sections: [
        {
          name: "NBA Scoreboard",
          prefix: "sensor.nba_",
          limit: 10,
          special_teams: [],
        },
        {
          name: "NHL Scoreboard",
          prefix: "sensor.nhl_",
          limit: 5,
          special_teams: [],
        },
      ],
    };
  }
}

customElements.define("ha-teamtracker-scoreboard-card", SportScoreboardCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "ha-teamtracker-scoreboard-card",
  name: "TeamTracker Scoreboard Card",
  description: "Compact sports scoreboard powered by ha-teamtracker",
  preview: false,
});
