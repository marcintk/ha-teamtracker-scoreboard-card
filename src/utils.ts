import type { GameState, HassStates, SectionConfig } from "./types.js";

export const VALID_STATES: ReadonlySet<GameState> = new Set(["PRE", "IN", "POST", "BYE"]);

// shared fallbacks — kept in one place so `section.limit`, `score_blink`, `slide_sec`, and
// the row-geometry math (`layout.row_height` / `row_padding`) can't drift out of sync
// across index.ts and render.ts.
export const DEFAULT_LIMIT = 10;
export const DEFAULT_SCORE_BLINK = 5;
export const DEFAULT_SLIDE_SEC = 45;
export const DEFAULT_ROW_HEIGHT = 28;
export const DEFAULT_ROW_PADDING = 5;
export const DEFAULT_TV_BADGE_CHARS = 4;

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

// longest score_blink among every section a given id currently matches — an id tracked
// by more than one section must stay blink-eligible until every matching section's own
// window has had its chance, not just whichever section happens to be first in config.
// Single source of truth for both the tracker's prune/timer window (index.ts) and the
// row-freshness check (render.ts) — they must agree or a row's "is this blinking right
// now" state can diverge from when the tracker considers its window closed.
export function blinkMsForId(sections: SectionConfig[], id: string): number {
  const matching = sections.filter((s) => sectionMatches(s, id));
  // an id untracked by any section (stray entry, or a momentarily empty config) falls
  // back to the default rather than going silently unblinkable
  if (!matching.length) return DEFAULT_SCORE_BLINK * 1000;
  return Math.max(...matching.map((s) => (s.score_blink ?? DEFAULT_SCORE_BLINK) * 1000));
}

/** Every currently-tracked id, plus which section index(es) it matches. An id can match
 *  more than one section (e.g. a team's prefix-based league section and a hand-picked
 *  "My teams" section) — every match gets the id, not just the first, so the same game
 *  can legitimately appear in more than one section at once. */
export function buildTrackedIds(
  sections: SectionConfig[],
  stateKeys: string[]
): { trackedIds: Set<string>; trackedBySection: Map<number, string[]> } {
  const trackedIds = new Set<string>();
  const trackedBySection = new Map<number, string[]>(sections.map((_, i) => [i, []]));
  for (const id of stateKeys) {
    for (const [i, section] of sections.entries()) {
      if (sectionMatches(section, id)) {
        trackedIds.add(id);
        trackedBySection.get(i)?.push(id);
      }
    }
  }
  return { trackedIds, trackedBySection };
}

/** Whether any tracked entity's state object actually changed between two hass snapshots —
 *  a missing previous snapshot, a null config, or no tracked ids at all is treated as "yes,
 *  something relevant changed" so the caller doesn't suppress a render it should perform. */
export function hasRelevantChange(
  trackedIds: ReadonlySet<string> | null,
  config: unknown,
  newStates: HassStates,
  prevStates: HassStates | undefined
): boolean {
  if (!prevStates || !config || !trackedIds) return true;
  for (const id of trackedIds) {
    if (newStates[id] !== prevStates[id]) return true;
  }
  return false;
}
