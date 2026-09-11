export type GameState = "PRE" | "IN" | "POST" | "BYE";

export type SortMode = "win-loss" | "win-draw-loss" | "win-loss-otl" | "by-date";

export type ViewMode = "auto" | "standings" | "schedule";

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

import type { HasSubscribeEvents } from "ha-card-shared/runtime";
export type HassConnection = HasSubscribeEvents;

export interface HomeAssistant {
  states: HassStates;
  connection: HassConnection;
}

export interface SectionConfig {
  name?: string;
  prefix?: string;
  limit?: number;
  special_teams?: string[];
  rank_type?: SortMode;
  /** default `schedule`; `standings` for the standings table, `auto` for the record heuristic */
  view?: ViewMode;
  score_blink?: number;
  /** default `false`; `true` draws the position gutter (the rank in a standings view) */
  show_position?: boolean;
}

export interface ColorsConfig {
  header?: string;
  opponent?: string;
  special?: string;
  team?: string;
  winner?: string;
  loser?: string;
  leading?: string;
  live?: string;
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
  opponentSpecial?: boolean;
  position?: number;
}

export interface CardConfig {
  sections?: SectionConfig[];
  /** size / spacing / text-scale knobs; the flat keys below are deprecated aliases */
  layout?: LayoutConfig;
  /** @deprecated use `layout.height` */
  height?: string;
  /** @deprecated use `layout.team_width` */
  team_width?: string;
  /** @deprecated use `layout.team_width` */
  team_col_width?: string;
  /** @deprecated use `layout.logo_width` */
  logo_width?: string;
  /** @deprecated use `layout.score_width` */
  score_width?: string;
  /** @deprecated use `layout.colon_width` */
  colon_width?: string;
  /** @deprecated use `layout.row_height` */
  row_height?: string;
  /** @deprecated use `layout.font_scale` */
  font_scale?: number;
  colors?: ColorsConfig;
  debug?: boolean;
  show_version?: boolean;
  /** throttle window (seconds) after the first event before rendering; further events during
   *  the window don't extend it (default 5; `0` = render at once) */
  lazy_refresh?: number;
  fixed_refresh?: number;
  /** `stack` (default) shows every section; `slide` rotates one at a time (needs ≥2 sections) */
  mode?: "stack" | "slide";
  /** seconds per section while `mode: slide` (default 45; ≤0 falls back to 45) */
  slide_sec?: number;
}
