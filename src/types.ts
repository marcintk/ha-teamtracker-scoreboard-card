export type GameState = "PRE" | "IN" | "POST" | "BYE";

// Per-game score-blink timestamps, keyed by each side's own team_abbr (falling back to
// the literal "team"/"opponent" when a sensor has no team_abbr) rather than by whichever
// sensor currently wins game-key.ts's identity resolution — a game's two sibling sensors
// can flip which one is "displayed" between renders, so keying by the raw survivor id
// would let a blink armed on the other sensor silently vanish. A key is present only
// while its own blink window is still open, so sides blink independently of each other.
export type ScoreBlinkEntry = Record<string, number>;

export interface GameAttr {
  state?: string;
  season?: string;
  date?: string;
  team_homeaway?: "home" | "away";
  team_abbr?: string;
  team_name?: string;
  team_score?: string | number;
  team_winner?: boolean;
  team_record?: string;
  team_logo?: string;
  team_rank?: string | number;
  opponent_abbr?: string;
  opponent_name?: string;
  opponent_score?: string | number;
  opponent_winner?: boolean;
  opponent_record?: string;
  opponent_logo?: string;
  opponent_rank?: string | number;
  kickoff_in?: string;
  tv_network?: string;
  location?: string;
  odds?: string;
  clock?: string;
  last_play?: string;
  series_summary?: string;
  [key: string]: unknown;
}

export interface HassEntity {
  state: string;
  attributes: GameAttr;
}

export type HassStates = Record<string, HassEntity>;

import type { HasSubscribeEvents } from "./subscription.js";
export type HassConnection = HasSubscribeEvents;

export interface HomeAssistant {
  states: HassStates;
  connection: HassConnection;
}

export interface SectionConfig {
  name?: string;
  prefix?: string;
  /** explicit entity id list; when set, takes precedence over `prefix` */
  entities?: string[];
  limit?: number;
  special_teams?: string[];
  score_blink?: number;
}

export interface ColorsConfig {
  header?: string;
  name_default?: string;
  score_winner?: string;
  score_loser?: string;
  live?: string;
  score_leading?: string;
  name_leading?: string;
  name_winner?: string;
  name_special?: string;
}

/** Card-level size / spacing / text-scale knobs, grouped like `colors`. */
export interface LayoutConfig {
  /** outer card height (any CSS length); omit to fit content */
  height?: string;
  /** team-name column width; one CSS length applied to both sides */
  team_width?: string;
  logo_width?: string;
  score_width?: string;
  colon_width?: string;
  row_height?: string;
  /** padding above AND below every game row (CSS length; default 5px) */
  row_padding?: string;
  /** uniform multiplier over every font-size; 1 = baseline */
  font_scale?: number;
}

export interface SortItem {
  entityId: string;
  teamName?: string;
  special?: boolean;
  key?: number;
  /** the discarded duplicate sensor for this game was also in special_teams — see
   *  sorting.ts's deduplicate() for why this can't just be derived from `special`. */
  opponentSpecial?: boolean;
}

export interface CardConfig {
  sections?: SectionConfig[];
  /** size / spacing / text-scale knobs */
  layout?: LayoutConfig;
  colors?: ColorsConfig;
  /** color + bold the leading (IN) / winning (POST) team's name; on by default, `false` leaves both names plain */
  highlight_winner?: boolean;
  debug?: boolean;
  show_version?: boolean;
  /** throttle delay (seconds) before rendering after an event (default 5; `0` = render at once) */
  lazy_refresh?: number;
  fixed_refresh?: number;
  /** `stack` (default) shows every section; `slide` rotates one at a time (needs ≥2 sections) */
  mode?: "stack" | "slide";
  /** seconds per section while `mode: slide` (default 45; ≤0 falls back to 45) */
  slide_sec?: number;
  /** characters shown in the TV-network badge before the `>` overflow marker (default 4; `0` hides the badge) */
  tv_badge?: number;
}
