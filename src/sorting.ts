import type { GameAttr, HassStates, SortItem } from "./types.js";

export function sortKeyFor(attr: GameAttr | null | undefined, now: number = Date.now()): number {
  const parsed = Date.parse(attr?.date ?? "");
  // a missing/unparseable date has no real position — key it to `now` so it
  // lands near the top of the schedule (next-up / just-finished band) instead
  // of sinking to the epoch-distant bottom, where a `limit` slice could hide it
  return Number.isNaN(parsed) ? now : parsed;
}

/** Identifies the game a sensor describes (date + sorted team/opponent abbr pair), so the
 *  two sibling sensors reporting the same game resolve to the same key regardless of which
 *  one's own perspective (team vs opponent) each attribute is read from. Shared with
 *  blink.ts, which needs the same game identity to survive dedup's winner picking a
 *  different sensor between renders. */
export function gameKeyFor(entityId: string, states: HassStates): string {
  const { date, team_abbr, opponent_abbr } = states[entityId]?.attributes ?? {};
  if (date == null) return entityId; // can't identify the game — keep row as unique
  return `${date}_${[team_abbr, opponent_abbr].sort().join("_")}`;
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
export function deduplicate(list: SortItem[], states: HassStates): SortItem[] {
  const groups = new Map<string, SortItem[]>();
  for (const item of list) {
    const key = gameKeyFor(item.entityId, states);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }

  const resolved = new Map<SortItem, SortItem>();
  for (const group of groups.values()) {
    const winner = group.find((item) => item.special) ?? (group[0] as SortItem);
    // both sides of a matchup can independently be in special_teams — only one row
    // survives, so the discarded sensor's own specialness has to be carried over
    // onto the winner or that team's highlight silently disappears with it
    const opponentSpecial = group.some((item) => item !== winner && item.special);
    resolved.set(winner, opponentSpecial ? { ...winner, opponentSpecial: true } : winner);
  }

  return list.filter((item) => resolved.has(item)).map((item) => resolved.get(item) as SortItem);
}
