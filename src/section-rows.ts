import { isSpecialTeam } from "./config-match.js";
import { comparatorFor, deduplicate, sortKeyFor } from "./sorting.js";
import type { HassStates, SectionConfig } from "./types.js";
import { DEFAULT_LIMIT, gameStateOf } from "./utils.js";

export interface SelectedRow {
  entityId: string;
  special: boolean;
  opponentSpecial: boolean;
}

/** Picks, orders, dedups and limits a section's rows — no markup. `limit` takes the
 *  first N rows of the single chronological order. */
export function selectRows(
  section: SectionConfig,
  states: HassStates,
  entityIds: string[],
  { liveFirst }: { liveFirst: boolean }
): SelectedRow[] {
  const items = entityIds
    .filter((id) => gameStateOf(states, id))
    .map((entityId) => {
      const attr = states[entityId]?.attributes;
      return {
        entityId,
        teamName: String(attr?.team_name ?? entityId),
        special: isSpecialTeam(section, entityId),
        key: sortKeyFor(attr),
      };
    });
  items.sort(comparatorFor({ liveFirst }, states));
  return deduplicate(items, states)
    .slice(0, section.limit ?? DEFAULT_LIMIT)
    .map(({ entityId, special = false, opponentSpecial = false }) => ({
      entityId,
      special,
      opponentSpecial,
    }));
}
