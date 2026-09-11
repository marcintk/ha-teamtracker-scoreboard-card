import { snapHtml } from "ha-card-shared/test-utils";
import { render } from "lit";
import { afterEach, beforeEach, vi } from "vitest";

export { snapHtml };

export function doc(template: unknown): HTMLElement {
  const el = document.createElement("div");
  render(template, el);
  return el;
}

export function snap(template: unknown): string {
  return snapHtml(doc(template).innerHTML);
}

/** Swap in fake timers for the enclosing `describe` — call at the top of its body. */
export function useFakeTimers(): void {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
}

/** The `ha-card` inline style string a card rendered — where the `layout:` custom
 *  properties land (see `_render`'s `cssVars`). */
export function haCardStyle(card: { shadowRoot: ShadowRoot | null }): string {
  return card.shadowRoot?.querySelector("ha-card")?.getAttribute("style") ?? "";
}
