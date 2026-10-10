import type { GameState, HassStates } from "./types.js";

export const GAME_STATE = {
  PRE: "PRE",
  IN: "IN",
  POST: "POST",
  BYE: "BYE",
} as const satisfies Record<GameState, GameState>;

export const VALID_STATES: ReadonlySet<GameState> = new Set(Object.values(GAME_STATE));

/** the entity's `state` when it is a known game state, otherwise undefined */
export function gameStateOf(states: HassStates, entityId: string): GameState | undefined {
  const state = states[entityId]?.state as GameState;
  return VALID_STATES.has(state) ? state : undefined;
}

export const isLive = (states: HassStates, entityId: string): boolean =>
  gameStateOf(states, entityId) === GAME_STATE.IN;

// shared fallbacks — kept in one place so `section.limit`, `slide_sec`, and
// the row-geometry math (`layout.row_height` / `row_padding`) can't drift out of sync
// across index.ts and render.ts.
export const DEFAULT_LIMIT = 10;
/** how long (ms) the previous score blinks before the new one is revealed — internal, not configurable */
export const BLINK_MS = 1000;
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
