import type { GameState, SectionConfig } from "./types.js";

export const VALID_STATES: ReadonlySet<GameState> = new Set(["PRE", "IN", "POST", "BYE"]);

// shared fallbacks — kept in one place so `section.limit`, `score_blink`, `slide_sec`, and
// the row-geometry math (`layout.row_height` / `row_padding`) can't drift out of sync
// across index.ts and render.ts.
export const DEFAULT_LIMIT = 10;
export const DEFAULT_SCORE_BLINK = 5;
export const DEFAULT_SLIDE_SEC = 45;
export const DEFAULT_ROW_HEIGHT = 28;
export const DEFAULT_ROW_PADDING = 5;
export const DEFAULT_TV_BADGE_CHARS = 3;

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

// a section matches an id via `prefix` OR its explicit `entities` list — union, not
// either/or — so a section can mix a pattern with a few cherry-picked extras. A bare
// section (neither set) still matches everything (prefix defaults to ""); once
// `entities` is set without a `prefix`, the "match everything" default no longer
// applies, so two entities-only sections (both otherwise defaulting prefix to "")
// don't collide. Shared by index.ts (live tracked-id updates) and render.ts (the
// fallback resolution `sectionHtml` does when a caller doesn't pass `entityIds`) so
// the rule can't drift between the two call sites again.
export function sectionMatches(section: SectionConfig, id: string): boolean {
  const matchesPrefix =
    section.prefix !== undefined || section.entities === undefined
      ? id.startsWith(section.prefix ?? "")
      : false;
  return matchesPrefix || (section.entities?.includes(id) ?? false);
}
