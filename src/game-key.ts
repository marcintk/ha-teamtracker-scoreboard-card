import type { HassStates } from "./types.js";

/** A `gameKeyFor` result — branded so a bare string can't type-check where a game key is
 *  required. `gameKeyFor` is the one place allowed to mint this type. */
export type GameKey = string & { readonly __gameKey: unique symbol };

/** Identifies the game a sensor describes (date + sorted team/opponent abbr pair), so the
 *  two sibling sensors reporting the same game resolve to the same key regardless of which
 *  one's own perspective (team vs opponent) each attribute is read from. Shared with
 *  blink.ts, which needs the same game identity to survive dedup's winner picking a
 *  different sensor between renders. */
export function gameKeyFor(entityId: string, states: HassStates): GameKey {
  const { date, team_abbr, opponent_abbr } = states[entityId]?.attributes ?? {};
  if (date == null) return entityId as GameKey; // can't identify the game — keep row as unique
  return `${date}_${[team_abbr, opponent_abbr].sort().join("_")}` as GameKey;
}
