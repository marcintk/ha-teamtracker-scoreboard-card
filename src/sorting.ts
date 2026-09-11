// sortMode: 'win-loss' | 'win-draw-loss' | 'win-loss-otl' | 'by-date'
//   win-loss:      W=2 L=0           (NBA, …)    record: W-L
//   win-draw-loss: W=3 D=1 L=0      (soccer, …) record: W-D-L
//   win-loss-otl:  W=2 OTL=1 L=0   (NHL, …)    record: W-L-OTL
//   by-date: internal — auto-applied when a section has nothing to rank

import type { GameAttr, HassStates, SortItem, SortMode, ViewMode } from "./types.js";

export function winRatio(record: unknown, sortMode: SortMode): number {
  const parts = String(record ?? "0-0")
    .split("-")
    .map(Number);
  const p = (i: number): number => parts[i] ?? 0;
  // a record with a non-numeric segment (e.g. "12-4 (H: 6-2)" from `view: "standings"`
  // bypassing the NUMERIC_RECORD guard below) makes `total` NaN — treat that the same
  // as "no games played" (ratio 0, sorts last) instead of letting NaN reach the caller
  const ratio = (total: number, points: number): number =>
    total && !Number.isNaN(total) ? points / total : 0;

  if (sortMode === "win-draw-loss") {
    const [w, d, l] = [p(0), p(1), p(2)]; // W-D-L
    return ratio(3 * (w + d + l), 3 * w + d);
  }
  if (sortMode === "win-loss-otl") {
    const [w, l, otl] = [p(0), p(1), p(2)]; // W-L-OTL
    return ratio(2 * (w + l + otl), 2 * w + otl);
  }
  const [w, l] = [p(0), p(1)]; // win-loss: W-L
  return ratio(w + l, w);
}

export function sortKeyFor(
  attr: GameAttr | null | undefined,
  sortMode: SortMode,
  now: number = Date.now()
): number {
  if (sortMode === "by-date") {
    const parsed = Date.parse(attr?.date ?? "");
    // a missing/unparseable date has no real position — key it to `now` so it
    // lands near the top of the schedule (next-up / just-finished band) instead
    // of sinking to the epoch-distant bottom, where a `limit` slice could hide it
    return Number.isNaN(parsed) ? now : parsed;
  }
  return winRatio(attr?.team_record, sortMode);
}

// A win-loss record: two or more dash-separated integers ("12-4", "0-1-2", "5-2-1").
const NUMERIC_RECORD = /^\d+(-\d+)+$/;

// "schedule" / "standings" force the result. "auto" (default, and any unrecognised value)
// shows the standings table only when *every* tracked entity carries a numeric win-loss
// record — otherwise there is nothing to rank, so fall back to the date-sorted list.
export function resolveSortMode(
  entities: string[],
  states: HassStates,
  rankType: SortMode,
  view: ViewMode = "auto"
): SortMode {
  if (view === "schedule") return "by-date";
  if (view === "standings") return rankType;
  return entities.every((id) =>
    NUMERIC_RECORD.test(String(states[id]?.attributes?.team_record ?? "").trim())
  )
    ? rankType
    : "by-date";
}

// For by-date sort, one row per game — deduplicate by (date, team pair), preferring home sensor.
// Uses a two-pass approach to preserve the original date order: re-sorting the whole list by
// home/away would push away-only games (whose home-team sensor is missing) to the end where they
// get cut off by the limit slice even though a valid sensor is available.
export function deduplicate(list: SortItem[], sortMode: SortMode, states: HassStates): SortItem[] {
  if (sortMode !== "by-date") return list;

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
