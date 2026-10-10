import { render } from "lit";
import { afterEach, beforeEach, vi } from "vitest";

export function snapHtml(html: string): string {
  return html.replace(/<!--\?lit\$\d+\$-->/g, "<!--?-->").replace(/lit\$\d+\$/g, "lit$");
}

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

type BlinkGames = Map<string, { changedAt: Record<string, number>; held: Record<string, number> }>;
const blinkView = (tracker: object, pick: "changedAt" | "held") => {
  const out = new Map<string, Record<string, number>>();
  for (const [key, g] of (tracker as { _games: BlinkGames })._games) {
    if (Object.keys(g.changedAt).length) out.set(key, g[pick]);
  }
  return out;
};
/** key -> changedAt for games with a recorded change (reads the tracker's private state). */
export const blinkEntries = (tracker: object) => blinkView(tracker, "changedAt");
/** key -> held scores for games with a recorded change. */
export const blinkHeld = (tracker: object) => blinkView(tracker, "held");
