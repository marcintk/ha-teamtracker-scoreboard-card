import { CSS_VARS } from "./css-vars.js";
import {
  colonColor,
  colorVar,
  isSideOutrightWinning,
  nameText,
  rankText,
  scoreBg,
  scoreColor,
  scoreText,
  teamColor,
} from "./display.js";
import { gameView, type Side } from "./game-view.js";
import type { ColorsConfig, GameAttr, GameState, HassEntity, NameFormat } from "./types.js";
import { GAME_STATE } from "./utils.js";

/** Same-typed flags grouped behind one object so a call site reads as labeled fields —
 *  `{ freshHome, freshAway }` can't be silently transposed the way two adjacent
 *  positional booleans can. */
export interface RowFlags {
  opponentSpecial?: boolean;
  freshHome?: boolean;
  freshAway?: boolean;
  /** score to show instead of the live one while that side's blink window is open */
  heldHome?: number;
  heldAway?: number;
  highlightWinner?: boolean;
  nameFormat?: NameFormat;
}

export interface SideView {
  name: string;
  rank: string;
  nameColor: string;
  score: string;
  scoreColor: string;
  /** raw live score — the lit `keyed` key, so a held score still re-animates on the live change */
  liveScore: unknown;
  fresh: boolean;
}

export interface RowView {
  state: GameState;
  attr: GameAttr;
  bg: string;
  colon: string;
  rankColor: string;
  home: SideView;
  away: SideView;
  /** sides with held scores overlaid */
  homeSide: Side;
  awaySide: Side;
}

export function buildRowView(
  stateObj: HassEntity | null,
  special: boolean,
  colors: ColorsConfig = {},
  flags: RowFlags = {}
): RowView {
  const {
    opponentSpecial = false,
    freshHome = false,
    freshAway = false,
    heldHome,
    heldAway,
    highlightWinner = true,
    nameFormat = "name",
  } = flags;
  const state = (stateObj?.state ?? "") as GameState;
  // while a side's old score is held, everything derived from the score (leader colour,
  // score colour) follows the held value too, so the name never reveals the new lead early
  const live = gameView(stateObj);
  const homeSide = { ...live.home, score: heldHome ?? live.home.score };
  const awaySide = { ...live.away, score: heldAway ?? live.away.score };
  const rankColor = colorVar(colors.name_default, CSS_VARS.nameDefaultColor, "#777"); /* gray */
  const specialColor = colorVar(
    colors.name_special,
    CSS_VARS.nameSpecialColor,
    "#2196F3"
  ); /* Material Blue */
  const inPlay = state === GAME_STATE.IN || state === GAME_STATE.POST;
  const side = (self: Side, other: Side, fresh: boolean, liveScore: unknown): SideView => {
    // `special` is scoped to this row's own entity; `opponentSpecial` covers the other side:
    // the discarded duplicate sensor for this game was independently special too
    // (see sorting.ts's deduplicate()).
    const isSpecial = self.own ? special : opponentSpecial;
    const ahead = highlightWinner && inPlay && isSideOutrightWinning(self, other, state);
    return {
      name: nameText(self, nameFormat),
      rank: rankText(self),
      nameColor: isSpecial
        ? specialColor
        : ahead
          ? teamColor(self, other, state, colors)
          : rankColor,
      score: scoreText(self, state),
      scoreColor: scoreColor(self, other, state, colors),
      liveScore,
      fresh,
    };
  };
  return {
    state,
    attr: stateObj?.attributes ?? {},
    bg: scoreBg(state),
    colon: colonColor(state),
    rankColor,
    home: side(homeSide, awaySide, freshHome, live.home.score),
    away: side(awaySide, homeSide, freshAway, live.away.score),
    homeSide,
    awaySide,
  };
}
