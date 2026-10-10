import { CSS_VARS } from "./css-vars.js";
import type { Side } from "./game-view.js";
import type { ColorsConfig, GameState, NameFormat } from "./types.js";
import { GAME_STATE } from "./utils.js";

/** `colors.<key>` config override, or the `--ttsc-*` custom property with its default —
 *  the single source of truth for every colour's fallback chain. */
export function colorVar(override: string | undefined, cssVar: string, fallback: string): string {
  return override ?? `var(${cssVar}, ${fallback})`;
}

/** A side's standing relative to its opponent: "ahead" (leading during IN, or the
 *  winner in a settled state), "trailing" (behind, or the loser), or "tied" — only
 *  reachable during IN, since a settled state's `team_winner`/`opponent_winner`
 *  flags carry no draw information of their own. Single source of truth for the two
 *  ahead/winning checks below, so they can't silently diverge on the tie case. */
export type SideRelation = "ahead" | "trailing" | "tied";

export function sideRelation(self: Side, other: Side, gs: GameState): SideRelation {
  if (gs === GAME_STATE.IN) {
    const mine = parseFloat(String(self.score ?? 0));
    const theirs = parseFloat(String(other.score ?? 0));
    return mine > theirs ? "ahead" : mine < theirs ? "trailing" : "tied";
  }
  return self.winner ? "ahead" : "trailing";
}

/** Shared leading/winner side-check used by `scoreColor()` — a tied score during IN
 *  counts as "ahead" here, matching the score cell's own always-colored-somehow look. */
export function isSideAheadOrWinning(self: Side, other: Side, gs: GameState): boolean {
  return sideRelation(self, other, gs) !== "trailing";
}

/** Like `isSideAheadOrWinning()`, but a tied score during IN counts as neither
 *  side leading — matching how a POST draw (no `team_winner`/`opponent_winner`)
 *  already highlights neither side. Used for the `.team-name` highlight, which
 *  should only call out a side with a clear edge, not the score cell. */
export function isSideOutrightWinning(self: Side, other: Side, gs: GameState): boolean {
  return sideRelation(self, other, gs) === "ahead";
}

// Both names fall back to the default gray by default; the outright leading
// (IN) side takes the leading colour and the outright winning (POST) side
// takes the winner colour — both theme-primary by default, independently
// overridable. A tie/draw highlights neither side. A section.special_teams
// entry overrides this with the special colour instead — see row-view.ts's
// buildRowView, which applies it regardless of leading/winning state.
export function teamColor(
  self: Side,
  other: Side,
  gs: GameState,
  colors: ColorsConfig = {}
): string {
  if (gs === GAME_STATE.IN && isSideOutrightWinning(self, other, gs))
    return colorVar(colors.name_leading, CSS_VARS.nameLeadingColor, "var(--primary-text-color)");
  if (gs === GAME_STATE.POST && isSideOutrightWinning(self, other, gs))
    return colorVar(colors.name_winner, CSS_VARS.nameWinnerColor, "var(--primary-text-color)");
  return colorVar(colors.name_default, CSS_VARS.nameDefaultColor, "#777"); /* gray */
}

export function scoreBg(gs: GameState): string {
  if (gs === GAME_STATE.PRE) return "#303030"; /* near-black */
  if (gs === GAME_STATE.IN) return "lightgray";
  return "transparent";
}

export function scoreColor(
  self: Side,
  other: Side,
  gs: GameState,
  colors: ColorsConfig = {}
): string {
  if (gs === GAME_STATE.PRE) return "black";
  if (gs === GAME_STATE.IN) {
    return isSideAheadOrWinning(self, other, gs)
      ? colorVar(colors.score_leading, CSS_VARS.scoreLeadingColor, "brown")
      : "black";
  }
  if (gs === GAME_STATE.POST) {
    return isSideAheadOrWinning(self, other, gs)
      ? colorVar(colors.score_winner, CSS_VARS.scoreWinnerColor, "orange")
      : colorVar(colors.score_loser, CSS_VARS.scoreLoserColor, "darkgray");
  }
  return "black";
}

export function colonColor(gs: GameState): string {
  if (gs === GAME_STATE.PRE || gs === GAME_STATE.IN) return "black";
  if (gs === GAME_STATE.POST) return "#777"; /* gray */
  return "transparent";
}

export function scoreText(self: Side, gs: GameState): string {
  if (gs === GAME_STATE.PRE) return "–";
  return String(self.score ?? "");
}

export function nameText(self: Side, format: NameFormat = "name"): string {
  const chosen = self.names[format];
  return String(String(chosen ?? "").trim() ? chosen : (self.names.name ?? ""));
}

export function rankText(self: Side): string {
  return String(self.record ?? "");
}
