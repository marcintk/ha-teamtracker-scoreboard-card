import { type GameKey, gameKeyFor } from "./game-key.js";
import type { GameAttr, HassStates, SortItem } from "./types.js";

export function sortKeyFor(attr: GameAttr | null | undefined, now: number = Date.now()): number {
  const parsed = Date.parse(attr?.date ?? "");
  // a missing/unparseable date has no real position — key it to `now` so it
  // lands near the top of the schedule (next-up / just-finished band) instead
  // of sinking to the epoch-distant bottom, where a `limit` slice could hide it
  return Number.isNaN(parsed) ? now : parsed;
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

// live (IN) games sit above everything else. Every other state — PRE / BYE / POST —
// shares one band.
const scheduleGroup = (state: string | undefined): number => (state === "IN" ? 0 : 1);

type Sortable = Required<Pick<SortItem, "entityId" | "teamName" | "key">>;

export interface SortOptions {
  /** pin live (IN) games above everything else */
  liveFirst: boolean;
  /** order by distance from now instead of oldest → newest */
  byDistance: boolean;
}

export function comparatorFor<T extends Sortable>(
  { liveFirst, byDistance }: SortOptions,
  now: number,
  states: HassStates
): (a: T, b: T) => number {
  const group = (item: T): number => (liveFirst ? scheduleGroup(states[item.entityId]?.state) : 0);
  // a game with no parseable date has no real place on a timeline, so the
  // chronological modes put it after every dated game
  const undated = (item: T): number =>
    Number.isNaN(Date.parse(states[item.entityId]?.attributes?.date ?? "")) ? 1 : 0;
  const position = (a: T, b: T): number =>
    byDistance
      ? Math.abs(a.key - now) - Math.abs(b.key - now)
      : undated(a) - undated(b) || a.key - b.key;
  return (a, b) =>
    group(a) - group(b) ||
    position(a, b) ||
    a.teamName.localeCompare(b.teamName) ||
    a.entityId.localeCompare(b.entityId);
}
