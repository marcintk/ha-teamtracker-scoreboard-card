import type { HassStates, SectionConfig } from "./types.js";
import { DEFAULT_SCORE_BLINK } from "./utils.js";

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

// a special team can be listed either by its full entity id, or by the suffix left
// once the section's own prefix is stripped — so config authors can write "lal" instead
// of repeating "sensor.nba_lal". Distinct from `sectionMatches`: this checks membership
// of one specific id already known to be in the section against a plain list, it never
// decides section membership itself.
export function isSpecialTeam(section: SectionConfig, id: string): boolean {
  const { prefix = "", special_teams = [] } = section;
  return special_teams.includes(id) || special_teams.includes(id.replace(prefix, ""));
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
  // fail open: no prior snapshot to diff against (first `hass` set), no config yet
  // (nothing to filter by), or no tracked ids resolved yet — each means "we can't tell
  // whether anything relevant changed," so render rather than silently suppress one.
  if (!prevStates) return true;
  if (!config) return true;
  if (!trackedIds) return true;
  for (const id of trackedIds) {
    if (newStates[id] !== prevStates[id]) return true;
  }
  return false;
}
