import type { HassEntity } from "./types.js";

export interface Side {
  abbr: string;
  score: string | number | undefined;
  own: boolean;
  /** raw name fields, no fallback */
  names: { name?: unknown; long_name?: unknown; abbr?: unknown };
  record: unknown;
  logo: unknown;
  winner: boolean | undefined;
}
export interface GameView {
  home: Side;
  away: Side;
}

/** A sensor's game as home/away sides, whichever side the sensor's own team is on. */
export function gameView(stateObj: HassEntity | null | undefined): GameView {
  const a = stateObj?.attributes;
  const team: Side = {
    abbr: a?.team_abbr ?? "team",
    score: a?.team_score,
    own: true,
    names: { name: a?.team_name, long_name: a?.team_long_name, abbr: a?.team_abbr },
    record: a?.team_record,
    logo: a?.team_logo,
    winner: a?.team_winner,
  };
  const opp: Side = {
    abbr: a?.opponent_abbr ?? "opponent",
    score: a?.opponent_score,
    own: false,
    names: { name: a?.opponent_name, long_name: a?.opponent_long_name, abbr: a?.opponent_abbr },
    record: a?.opponent_record,
    logo: a?.opponent_logo,
    winner: a?.opponent_winner,
  };
  return a?.team_homeaway === "home" ? { home: team, away: opp } : { home: opp, away: team };
}
