/// <reference path="../globals.d.ts" />

import { html, nothing, render } from "lit";
import { BlinkTracker } from "./blink.js";
import { Carousel, prefersReducedMotion } from "./carousel.js";
import { resolveRenderOptions } from "./config.js";
import { DebugMetrics } from "./debug.js";
import {
  asPx,
  buildHaCardStyle,
  cardRows,
  resolveVisibleSections,
  rowGeometryPx,
} from "./layout.js";
import { RefreshScheduler } from "./refresh-scheduler.js";
import { buildCardTemplate } from "./render.js";
import type { CardConfig, HomeAssistant, LayoutConfig } from "./types.js";

export class SportScoreboardCard extends HTMLElement {
  readonly _root: ShadowRoot;
  _carousel: Carousel;
  _debug: DebugMetrics;
  _blink: BlinkTracker;
  _scheduler: RefreshScheduler;

  constructor() {
    super();
    this._root = this.attachShadow({ mode: "open" });
    this._carousel = new Carousel(() => {
      if (this._hass && this._config) this._render();
    });
    this._debug = new DebugMetrics();
    this._blink = new BlinkTracker();
    this._scheduler = new RefreshScheduler({
      onRender: () => this._render(),
      onDebug: (kind) => this._debug.track(kind),
      onConfigured: () => this._carousel.sync(),
      onDebugTick: () => this._refreshDebugOverlay(),
    });
  }

  // state lives in the scheduler; these keep the element's long-standing field names
  get _config(): CardConfig | null {
    return this._scheduler.config;
  }
  set _config(v: CardConfig | null) {
    this._scheduler.config = v;
  }
  get _hass(): HomeAssistant | null {
    return this._scheduler.hass;
  }
  set _hass(v: HomeAssistant | null) {
    this._scheduler.hass = v;
  }

  setConfig(config: CardConfig): void {
    this._blink.clear();
    this._carousel.configure(config);
    this._scheduler.configure(config);
  }

  set hass(hass: HomeAssistant) {
    this._scheduler.setHass(hass);
  }

  _refreshDebugOverlay(): void {
    const el = this._root.querySelector("#sc-debug");
    if (el) el.innerHTML = this._debug.tableHtml();
  }

  connectedCallback(): void {
    this._scheduler.attach();
  }

  disconnectedCallback(): void {
    this._carousel.stop();
    this._scheduler.detach();
    this._blink.clear();
  }

  _layout(): LayoutConfig {
    return this._config?.layout ?? {};
  }

  _render(): void {
    try {
      const { sections, debug, show_version } = this._config as CardConfig;
      const options = resolveRenderOptions(this._config);
      const layout = this._layout();
      const states = (this._hass as HomeAssistant).states;
      const stateKeys = Object.keys(states);
      const trackedIds = this._scheduler.refreshTracked(stateKeys);
      const reducedMotion = prefersReducedMotion();
      this._blink.update({
        states,
        trackedIds,
        // set by refreshTracked just above
        blinkOnById: this._scheduler.blinkOnById as Map<string, boolean>,
        reducedMotion,
        onExpire: () => {
          if (this._hass && this._config) this._render();
        },
      });

      if (!Array.isArray(sections) || !sections.length) {
        this._showError("Add at least one section to your card config.");
        return;
      }

      if (debug) this._debug.track("rendered");

      this._carousel.sync();

      const carousel = this._carousel.active;
      const haCardStyle = buildHaCardStyle(layout, sections, carousel);
      const visibleSections = resolveVisibleSections(sections, carousel, this._carousel.index);

      // card-level badge — sits over the top-centre of the card, shown whenever
      // show_version is set regardless of whether any section renders
      const versionBadge = show_version
        ? html`<span id="sc-version" class="sc-version">v${__CARD_VERSION__}</span>`
        : nothing;

      const template = buildCardTemplate({
        states,
        // set by refreshTracked above
        trackedBySection: this._scheduler.trackedBySection as Map<number, string[]>,
        options,
        blink: this._blink,
        carousel,
        visibleSections,
        slideControls: this._carousel.controls(),
        haCardStyle,
        versionBadge,
        debugTableHtml: debug ? this._debug.tableHtml() : null,
      });

      render(template, this._root);
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
    const carousel = this._carousel.active;
    const rows = cardRows(sections, carousel);
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
