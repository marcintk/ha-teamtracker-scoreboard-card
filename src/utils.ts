import type { GameState } from "./types.js";

export const VALID_STATES: ReadonlySet<GameState> = new Set(["PRE", "IN", "POST", "BYE"]);

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
