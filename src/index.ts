/// <reference path="../node_modules/ha-card-shared/globals.d.ts" />

import { DebugMetrics, SubscriptionManager } from "ha-card-shared/runtime";
import { html, nothing, render, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { sectionHtml } from "./render.js";
import { CARD_STYLES } from "./styles.js";
import type { CardConfig, HassStates, HomeAssistant, LayoutConfig } from "./types.js";

const STYLE_BLOCK = unsafeHTML(`<style>${CARD_STYLES}</style>`);

// a bare pixel length ("34" or "34px") → its number; anything else (rem, %, auto,
// undefined) → null, so callers fall back to their default instead of a wrong number
const asPx = (v: string | undefined): number | null => {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(?:px)?\s*$/.exec(v ?? "");
  return m ? Number(m[1]) : null;
};

export class SportScoreboardCard extends HTMLElement {
  readonly _root: ShadowRoot;
  _config: CardConfig | null;
  _hass: HomeAssistant | null;
  _fixedTimer: ReturnType<typeof setInterval> | null;
  _debugTimer: ReturnType<typeof setInterval> | null;
  _renderTimer: ReturnType<typeof setTimeout> | null;
  _blinkTimer: ReturnType<typeof setTimeout> | null;
  _slideTimer: ReturnType<typeof setInterval> | null;
  _slideIndex: number;
  _slidePaused: boolean;
  _trackedIds: Set<string> | null;
  _trackedByPrefix: Map<string, string[]> | null;
  _subscription: SubscriptionManager;
  _debug: DebugMetrics;
  _scoreChangedAt: Map<string, number>;
  _prevScores: Map<string, { t: number; o: number }>;

  constructor() {
    super();
    this._root = this.attachShadow({ mode: "open" });
    this._config = null;
    this._hass = null;
    this._fixedTimer = null;
    this._debugTimer = null;
    this._renderTimer = null;
    this._blinkTimer = null;
    this._slideTimer = null;
    this._slideIndex = 0;
    this._slidePaused = false;
    this._trackedIds = null;
    this._trackedByPrefix = null;
    this._subscription = new SubscriptionManager();
    this._debug = new DebugMetrics();
    this._scoreChangedAt = new Map();
    this._prevScores = new Map();
  }

  setConfig(config: CardConfig): void {
    this._config = config;
    this._clearSubscription();
    this._trackedIds = null;
    this._trackedByPrefix = null;
    this._scoreChangedAt.clear();
    this._prevScores.clear();
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
    if (this._blinkTimer) {
      clearTimeout(this._blinkTimer);
      this._blinkTimer = null;
    }
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
    return typeof s === "number" && s > 0 ? s : 45;
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
    this._scoreChangedAt.clear();
    this._prevScores.clear();
  }

  _detectScoreChanges(states: HassStates): void {
    for (const id of this._trackedIds ?? []) {
      const gs = states[id]?.state;
      const attr = states[id]?.attributes;
      if (gs === "IN") {
        const t = Number(attr?.team_score ?? 0);
        const o = Number(attr?.opponent_score ?? 0);
        const prev = this._prevScores.get(id);
        if (prev && (prev.t !== t || prev.o !== o)) {
          this._scoreChangedAt.set(id, Date.now());
        }
        this._prevScores.set(id, { t, o });
      } else {
        this._prevScores.delete(id);
        this._scoreChangedAt.delete(id);
      }
    }
  }

  _pruneExpiredBlinks(): void {
    if (!this._scoreChangedAt.size) return;
    const now = Date.now();
    const sections = this._config?.sections ?? [];
    for (const [id, changedAt] of this._scoreChangedAt) {
      const section = sections.find((s) => id.startsWith(s.prefix ?? ""));
      const blinkMs = (section?.score_blink ?? 5) * 1000;
      if (blinkMs <= 0 || now - changedAt >= blinkMs) {
        this._scoreChangedAt.delete(id);
      }
    }
  }

  _armBlinkTimer(): void {
    if (this._blinkTimer || !this._scoreChangedAt.size) return;
    const sections = this._config?.sections ?? [];
    const now = Date.now();
    let minExpiry = Infinity;
    for (const [id, changedAt] of this._scoreChangedAt) {
      const section = sections.find((s) => id.startsWith(s.prefix ?? ""));
      const blinkMs = (section?.score_blink ?? 5) * 1000;
      if (blinkMs > 0) minExpiry = Math.min(minExpiry, changedAt + blinkMs);
    }
    if (minExpiry === Infinity) return;
    this._blinkTimer = setTimeout(
      () => {
        this._blinkTimer = null;
        if (this._hass && this._config) this._render();
      },
      Math.max(50, minExpiry - now)
    );
  }

  _buildTrackedIds(stateKeys: string[]): void {
    const prefixes = (this._config?.sections ?? []).map((s) => s.prefix ?? "");
    this._trackedIds = new Set();
    this._trackedByPrefix = new Map(prefixes.map((p) => [p, []]));
    for (const id of stateKeys) {
      for (const p of prefixes) {
        if (id.startsWith(p)) {
          this._trackedIds.add(id);
          this._trackedByPrefix.get(p)?.push(id);
          break;
        }
      }
    }
  }

  _hasRelevantChange(newHass: HomeAssistant, prevHass: HomeAssistant | null): boolean {
    if (!prevHass || !this._config || !this._trackedIds) return true;
    for (const id of this._trackedIds) {
      if (newHass.states[id] !== prevHass.states[id]) return true;
    }
    return false;
  }

  /**
   * Resolve the layout knobs: values under `layout:` win, falling back to the
   * deprecated flat card-level keys (`team_col_width` still feeds `team_width`).
   */
  _layout(): LayoutConfig {
    const c = this._config;
    const l = c?.layout ?? {};
    return {
      height: l.height ?? c?.height,
      team_width: l.team_width ?? c?.team_width ?? c?.team_col_width,
      logo_width: l.logo_width ?? c?.logo_width,
      score_width: l.score_width ?? c?.score_width,
      colon_width: l.colon_width ?? c?.colon_width,
      row_height: l.row_height ?? c?.row_height,
      row_padding: l.row_padding,
      font_scale: l.font_scale ?? c?.font_scale,
    };
  }

  _render(): void {
    try {
      const { sections, colors = {}, debug, show_version } = this._config as CardConfig;
      const {
        height,
        team_width,
        logo_width,
        score_width,
        colon_width,
        row_height,
        row_padding,
        font_scale,
      } = this._layout();
      const states = (this._hass as HomeAssistant).states;
      const stateKeys = Object.keys(states);
      this._buildTrackedIds(stateKeys);
      this._detectScoreChanges(states);
      this._pruneExpiredBlinks();

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
      let slideMinH = "";
      if (carousel && !height) {
        // each row is row_height + padding above and below it
        const slideH = (asPx(row_height) ?? 28) + 2 * (asPx(row_padding) ?? 5);
        const maxRows = Math.max(...sections.map((s) => 1 + (s.limit ?? 10)));
        slideMinH = `min-height:${maxRows * slideH}px;`;
      }

      const tw = team_width;

      const cssVars: Record<string, string | undefined> = {
        "--ttsc-team-col-a-width": tw,
        "--ttsc-team-col-b-width": tw,
        "--ttsc-logo-width": logo_width,
        "--ttsc-score-width": score_width,
        "--ttsc-colon-width": colon_width,
        "--ttsc-row-height": row_height,
        "--ttsc-row-padding": row_padding,
        "--ttsc-font-scale":
          font_scale != null && font_scale !== 1 ? String(font_scale) : undefined,
      };
      const varStr = Object.entries(cssVars)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}:${String(v)};`)
        .join("");

      const haCardStyle = `${slideMinH}${height ? `height:${String(height)};min-height:${String(height)};max-height:${String(height)};overflow:hidden;` : ""}${varStr}`;

      const idx = ((this._slideIndex % sections.length) + sections.length) % sections.length;
      const visibleSections = carousel ? sections.slice(idx, idx + 1) : sections;

      // card-level badge — sits over the top-centre of the card, shown whenever
      // show_version is set regardless of whether any section renders
      const versionBadge = show_version
        ? html`<span id="sc-version" class="sc-version">v${__CARD_VERSION__}</span>`
        : nothing;

      const sectionTemplates = visibleSections.map((s) =>
        sectionHtml(
          s,
          states,
          this._trackedByPrefix?.get(s.prefix ?? ""),
          colors,
          this._scoreChangedAt,
          carousel,
          slideControls
        )
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

      this._armBlinkTimer();
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
      ? Math.max(0, ...sections.map((s) => 1 + (s.limit ?? 10)))
      : sections.reduce((n, s) => n + 1 + (s.limit ?? 10), 0);
    // each row is row_height + padding above and below it — match slideMinH
    const h = (asPx(row_height) ?? 28) + 2 * (asPx(row_padding) ?? 5);
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
          rank_type: "win-loss",
        },
        {
          name: "NHL Scoreboard",
          prefix: "sensor.nhl_",
          limit: 5,
          special_teams: [],
          rank_type: "win-loss-otl",
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
