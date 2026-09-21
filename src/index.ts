/// <reference path="../globals.d.ts" />

import { html, nothing, render, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { blinkMsForId, buildTrackedIds, hasRelevantChange } from "./config-match.js";
import { sectionHtml } from "./render.js";
import { BlinkTracker } from "./runtime/blink.js";
import { DebugMetrics } from "./runtime/debug.js";
import { asPx, buildHaCardStyle, resolveVisibleSections, rowGeometryPx } from "./runtime/layout.js";
import { SubscriptionManager } from "./runtime/subscription.js";
import { CARD_STYLES } from "./styles.js";
import type { CardConfig, HomeAssistant, LayoutConfig } from "./types.js";
import { DEFAULT_LIMIT, DEFAULT_SLIDE_SEC, DEFAULT_TV_BADGE_CHARS } from "./utils.js";

const STYLE_BLOCK = unsafeHTML(`<style>${CARD_STYLES}</style>`);

export class SportScoreboardCard extends HTMLElement {
  readonly _root: ShadowRoot;
  _config: CardConfig | null;
  _hass: HomeAssistant | null;
  _fixedTimer: ReturnType<typeof setInterval> | null;
  _debugTimer: ReturnType<typeof setInterval> | null;
  _renderTimer: ReturnType<typeof setTimeout> | null;
  _slideTimer: ReturnType<typeof setInterval> | null;
  _slideIndex: number;
  _slidePaused: boolean;
  _trackedIds: Set<string> | null;
  _trackedBySection: Map<number, string[]> | null;
  _subscription: SubscriptionManager;
  _debug: DebugMetrics;
  _blink: BlinkTracker;

  constructor() {
    super();
    this._root = this.attachShadow({ mode: "open" });
    this._config = null;
    this._hass = null;
    this._fixedTimer = null;
    this._debugTimer = null;
    this._renderTimer = null;
    this._slideTimer = null;
    this._slideIndex = 0;
    this._slidePaused = false;
    this._trackedIds = null;
    this._trackedBySection = null;
    this._subscription = new SubscriptionManager();
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
    if (this._renderTimer) return;
    if (this._config?.debug) this._debug.track("filtered");
    const lazyMs = (this._config?.lazy_refresh ?? 5) * 1000;
    if (lazyMs === 0) {
      this._render();
      return;
    }
    this._renderTimer = setTimeout(() => {
      this._renderTimer = null;
      if (this._hass && this._config) this._render();
    }, lazyMs);
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
    if (this._renderTimer) {
      clearTimeout(this._renderTimer);
      this._renderTimer = null;
    }
    this._blink.clearTimer();
  }

  _startFixedTimer(): void {
    this._stopFixedTimer();
    const fixedMs = (this._config?.fixed_refresh ?? 60) * 1000;
    if (fixedMs > 0) {
      this._fixedTimer = setInterval(() => {
        if (this._hass && this._config) this._render();
      }, fixedMs);
    }
    if (this._config?.debug) {
      this._debugTimer = setInterval(() => {
        if (this._hass && this._config) this._refreshDebugOverlay();
      }, 1000);
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

  /** characters shown in the TV-network badge; a missing / negative value falls back to 3, `0` hides the badge. */
  _tvBadge(): number {
    const n = this._config?.tv_badge;
    return typeof n === "number" && n >= 0 ? n : DEFAULT_TV_BADGE_CHARS;
  }

  _syncSlideTimer(): void {
    const shouldRun = this._isSlideMode() && !this._slidePaused;
    if (shouldRun && !this._slideTimer) {
      this._slideTimer = setInterval(() => {
        const n = this._config?.sections?.length ?? 0;
        if (n >= 2) {
          this._slideIndex = (this._slideIndex + 1) % n;
          if (this._hass && this._config) this._render();
        }
      }, this._slideSec() * 1000);
    } else if (!shouldRun && this._slideTimer) {
      this._stopSlideTimer();
    }
  }

  _stopSlideTimer(): void {
    if (this._slideTimer) {
      clearInterval(this._slideTimer);
      this._slideTimer = null;
    }
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
    if (this._fixedTimer) {
      clearInterval(this._fixedTimer);
      this._fixedTimer = null;
    }
    if (this._debugTimer) {
      clearInterval(this._debugTimer);
      this._debugTimer = null;
    }
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
      // _buildTrackedIds always assigns a Set just above; the field stays nullable only
      // because it's cleared elsewhere in the card's lifecycle (setConfig, disconnectedCallback)
      this._blink.record(this._trackedIds as Set<string>, states);
      const blinkMsFor = (id: string): number => blinkMsForId(sections ?? [], id);
      this._blink.prune(blinkMsFor);

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
      const sectionTemplates = visibleSections.map(([i, s]) =>
        sectionHtml(s, states, this._trackedBySection?.get(i), colors, this._blink.entries, {
          carousel,
          controls: slideControls,
          highlightWinner: highlight_winner,
          tvBadge,
          blinkMsFor,
        })
      );
      const hasContent = sectionTemplates.some((t) => t !== nothing);

      render(
        html`
          ${STYLE_BLOCK}
          <ha-card style=${haCardStyle || nothing}>
            ${versionBadge}
            ${debug ? unsafeHTML(`<div id="sc-debug" style="position:absolute;bottom:0;left:0;right:0;z-index:10;background:rgba(0,0,0,0.5);color:#00e676;font-family:monospace;font-size:11px;line-height:1;padding:2px 6px;pointer-events:none;">${this._debug.tableHtml()}</div>`) : nothing}
            ${
              hasContent
                ? sectionTemplates
                : html`<div class="empty">No games found — check your section prefixes.</div>`
            }
          </ha-card>
        `,
        this._root
      );

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
