import type { GameState } from "./types.js";

export const VALID_STATES: ReadonlySet<GameState> = new Set(["PRE", "IN", "POST", "BYE"]);

// shared fallbacks — kept in one place so `section.limit`, `score_blink`, `slide_sec`, and
// the row-geometry math (`layout.row_height` / `row_padding`) can't drift out of sync
// across index.ts and render.ts.
export const DEFAULT_LIMIT = 10;
export const DEFAULT_SCORE_BLINK = 5;
export const DEFAULT_SLIDE_SEC = 45;
export const DEFAULT_ROW_HEIGHT = 28;
export const DEFAULT_ROW_PADDING = 5;

export function safeLogoUrl(url: unknown): string {
  if (!url || !String(url).startsWith("https://")) return "";
  return String(url);
}

/** First `sep`-delimited segment of `str`. `String.split` always returns at least one
 *  element, so the result is never `undefined` — this is a typed alternative to a
 *  `parts[0] ?? ""` that `noUncheckedIndexedAccess` would otherwise force. */
export function firstSegment(str: string, sep: string): string {
  return str.split(sep)[0] as string;
}
