import { html, nothing, type TemplateResult } from "lit";
import { CancelableTimer } from "./timer.js";
import type { CardConfig } from "./types.js";
import { DEFAULT_SLIDE_SEC } from "./utils.js";

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}

function slideBtn(label: string, onClick: () => void, extra: string): TemplateResult {
  // every icon is a CSS shape keyed off `extra` (nav prev/next, toggle) — the
  // button carries no text
  return html`<button
    class="slide-btn ${extra}"
    title=${label}
    aria-label=${label}
    @click=${onClick}
  ></button>`;
}

/** slide-mode rotation state + timer; holds no hass/config, the card re-renders via `onChange`. */
export class Carousel {
  private _timer = new CancelableTimer();
  private _index = 0;
  private _paused = false;
  private _count = 0;
  private _slide = false;
  private _sec = DEFAULT_SLIDE_SEC;

  constructor(
    private readonly _onChange: () => void,
    private readonly _reducedMotion: () => boolean = prefersReducedMotion
  ) {}

  configure(config: CardConfig | null): void {
    this._count = config?.sections?.length ?? 0;
    this._slide = config?.mode === "slide";
    const s = config?.slide_sec;
    // a missing / non-positive value falls back to 45
    this._sec = typeof s === "number" && s > 0 ? s : DEFAULT_SLIDE_SEC;
    this._index = 0;
    this._paused = this._reducedMotion();
    this.stop();
  }

  /** `mode: "slide"` with at least two sections to rotate through. */
  get active(): boolean {
    return this._slide && this._count >= 2;
  }

  get index(): number {
    return this._index;
  }

  get paused(): boolean {
    return this._paused;
  }

  /** idempotent: _render calls it every time, and restarting would reset the countdown. */
  sync(): void {
    const shouldRun = this.active && !this._paused;
    if (shouldRun && !this._timer.active) {
      this._timer.start(this._sec * 1000, () => {
        this._index = (this._index + 1) % this._count;
        this._onChange();
      });
    } else if (!shouldRun && this._timer.active) {
      this.stop();
    }
  }

  stop(): void {
    this._timer.stop();
  }

  step(dir: number): void {
    if (this._count < 2) return;
    this._index = (((this._index + dir) % this._count) + this._count) % this._count;
    this._paused = true;
    this.sync();
    this._onChange();
  }

  toggle(): void {
    this._paused = !this._paused;
    this.sync();
    this._onChange();
  }

  controls(): TemplateResult | typeof nothing {
    if (!this.active) return nothing;
    const p = this._paused;
    return html`<span class="slide-ctrls${p ? " paused" : ""}"
      >${slideBtn("Previous section", () => this.step(-1), "nav prev")}${slideBtn(
        p ? "Resume rotation" : "Stop rotation",
        () => this.toggle(),
        p ? "toggle paused" : "toggle"
      )}${slideBtn("Next section", () => this.step(1), "nav next")}</span
    >`;
  }
}
