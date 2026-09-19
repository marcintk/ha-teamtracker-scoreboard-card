import type { GameAttr, HassStates, SortItem } from "./types.js";

export function sortKeyFor(attr: GameAttr | null | undefined, now: number = Date.now()): number {
  const parsed = Date.parse(attr?.date ?? "");
  // a missing/unparseable date has no real position — key it to `now` so it
  // lands near the top of the schedule (next-up / just-finished band) instead
  // of sinking to the epoch-distant bottom, where a `limit` slice could hide it
  return Number.isNaN(parsed) ? now : parsed;
}

// One row per game — deduplicate by (date, team pair), preferring home sensor.
// Uses a two-pass approach to preserve the original date order: re-sorting the whole list by
// home/away would push away-only games (whose home-team sensor is missing) to the end where they
// get cut off by the limit slice even though a valid sensor is available.
export function deduplicate(list: SortItem[], states: HassStates): SortItem[] {
  const gameKey = (entityId: string): string => {
    const { date, team_abbr, opponent_abbr } = states[entityId]?.attributes ?? {};
    if (date == null) return entityId; // can't identify the game — keep row as unique
    return `${date}_${[team_abbr, opponent_abbr].sort().join("_")}`;
  };

  const keyMap = new Map(list.map(({ entityId }) => [entityId, gameKey(entityId)]));

  // First pass: find which game keys have at least one home-side and/or special sensor.
  const homeKeys = new Set<string | undefined>();
  const specialKeys = new Set<string | undefined>();
  const specialAwayKeys = new Set<string | undefined>();
  for (const { entityId, special } of list) {
    const key = keyMap.get(entityId);
    if (states[entityId]?.attributes?.team_homeaway === "home") homeKeys.add(key);
    if (special) {
      specialKeys.add(key);
      if (states[entityId]?.attributes?.team_homeaway !== "home") specialAwayKeys.add(key);
    }
  }

  // Second pass: filter the original (date-sorted) list in place, then annotate.
  // When a special team plays away AND a home sensor also exists, prefer the home sensor
  // but mark opponentSpecial so the away team still renders highlighted.
  // Otherwise keep the special sensor (special-plays-away with no home counterpart).
  const seen = new Set<string | undefined>();
  return list
    .filter(({ entityId, special }) => {
      const key = keyMap.get(entityId);
      if (seen.has(key)) return false;
      if (special && states[entityId]?.attributes?.team_homeaway !== "home" && homeKeys.has(key))
        return false;
      if (specialKeys.has(key) && !special && (!specialAwayKeys.has(key) || !homeKeys.has(key)))
        return false;
      if (
        !specialKeys.has(key) &&
        homeKeys.has(key) &&
        states[entityId]?.attributes?.team_homeaway !== "home"
      )
        return false;
      seen.add(key);
      return true;
    })
    .map((item) => {
      const key = keyMap.get(item.entityId);
      if (states[item.entityId]?.attributes?.team_homeaway === "home" && specialAwayKeys.has(key))
        return { ...item, opponentSpecial: true };
      return item;
    });
}
