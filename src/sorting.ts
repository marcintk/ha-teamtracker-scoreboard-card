import { type GameKey, gameKeyFor } from "./game-key.js";
import type { GameAttr, HassStates, SortItem } from "./types.js";
import { isLive } from "./utils.js";

// a missing/unparseable date has no place on a timeline — Infinity sorts it after every dated game
export function sortKeyFor(attr: GameAttr | null | undefined): number {
  const parsed = Date.parse(attr?.date ?? "");
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

// One row per game — the same game is often reported by more than one sensor (each
// team's own sensor describes the game from its own perspective), so dedup keeps
// exactly one per (date, team pair). Which sensor survives doesn't affect what's
// rendered — display.ts derives home/away column placement from the surviving
// sensor's own `team_homeaway`, not from which one won — except for `special`: a
// favourite-team highlight is scoped to that team's own sensor id, so the special
// sensor (if any) has to be the one kept, or the highlight is silently lost (this
// was a real bug — see git history for `fadbb0e`). Otherwise, first-seen wins,
// preserving the (already date-sorted) list's order.
export function deduplicate<T extends SortItem>(list: T[], states: HassStates): (T & SortItem)[] {
  const groups = new Map<GameKey, (T & SortItem)[]>();
  for (const item of list) {
    const key = gameKeyFor(item.entityId, states);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }

  const resolved = new Map<T, T & SortItem>();
  for (const group of groups.values()) {
    const winner = group.find((item) => item.special) ?? (group[0] as T & SortItem);
    // both sides of a matchup can independently be in special_teams — only one row
    // survives, so the discarded sensor's own specialness has to be carried over
    // onto the winner or that team's highlight silently disappears with it
    const opponentSpecial = group.some((item) => item !== winner && item.special);
    resolved.set(winner, opponentSpecial ? { ...winner, opponentSpecial: true } : winner);
  }

  return list
    .filter((item) => resolved.has(item))
    .map((item) => resolved.get(item) as T & SortItem);
}

type Sortable = Required<Pick<SortItem, "entityId" | "teamName" | "key">>;

export interface SortOptions {
  /** pin live (IN) games above everything else */
  liveFirst: boolean;
}

export function comparatorFor<T extends Sortable>(
  { liveFirst }: SortOptions,
  states: HassStates
): (a: T, b: T) => number {
  // live_first: IN games get 0, everything else 1; off, all tie so `key` decides
  const live = (item: T): number => (liveFirst && isLive(states, item.entityId) ? 0 : 1);
  return (a, b) =>
    live(a) - live(b) ||
    (a.key === b.key ? 0 : a.key < b.key ? -1 : 1) ||
    a.teamName.localeCompare(b.teamName) ||
    a.entityId.localeCompare(b.entityId);
}
