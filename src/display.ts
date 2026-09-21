import { CSS_VARS } from "./css-vars.js";
import type { ColorsConfig, GameAttr, GameState } from "./types.js";

export function isTeamSide(side: "home" | "away", attr: GameAttr): boolean {
  return side === "home" ? attr?.team_homeaway === "home" : attr?.team_homeaway !== "home";
}

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

export function sideRelation(side: "home" | "away", gs: GameState, attr: GameAttr): SideRelation {
  const isSide = isTeamSide(side, attr);
  if (gs === "IN") {
    const ts = parseFloat(String(attr.team_score ?? 0));
    const os = parseFloat(String(attr.opponent_score ?? 0));
    const mine = isSide ? ts : os;
    const other = isSide ? os : ts;
    return mine > other ? "ahead" : mine < other ? "trailing" : "tied";
  }
  return (isSide ? attr.team_winner : attr.opponent_winner) ? "ahead" : "trailing";
}

/** Shared leading/winner side-check used by `scoreColor()` — a tied score during IN
 *  counts as "ahead" here, matching the score cell's own always-colored-somehow look. */
export function isSideAheadOrWinning(
  side: "home" | "away",
  gs: GameState,
  attr: GameAttr
): boolean {
  return sideRelation(side, gs, attr) !== "trailing";
}

/** Like `isSideAheadOrWinning()`, but a tied score during IN counts as neither
 *  side leading — matching how a POST draw (no `team_winner`/`opponent_winner`)
 *  already highlights neither side. Used for the `.team-name` highlight, which
 *  should only call out a side with a clear edge, not the score cell. */
export function isSideOutrightWinning(
  side: "home" | "away",
  gs: GameState,
  attr: GameAttr
): boolean {
  return sideRelation(side, gs, attr) === "ahead";
}

// Both names fall back to the default gray by default; the outright leading
// (IN) side takes the leading colour and the outright winning (POST) side
// takes the winner colour — both theme-primary by default, independently
// overridable. A tie/draw highlights neither side. A section.special_teams
// entry overrides this with the special colour instead — see render.ts's
// rowHtml, which applies it regardless of leading/winning state.
export function teamColor(
  side: "home" | "away",
  gs: GameState,
  attr: GameAttr,
  colors: ColorsConfig = {}
): string {
  if (gs === "IN" && isSideOutrightWinning(side, gs, attr))
    return colorVar(colors.name_leading, CSS_VARS.nameLeadingColor, "var(--primary-text-color)");
  if (gs === "POST" && isSideOutrightWinning(side, gs, attr))
    return colorVar(colors.name_winner, CSS_VARS.nameWinnerColor, "var(--primary-text-color)");
  return colorVar(colors.name_default, CSS_VARS.nameDefaultColor, "#777"); /* gray */
}

export function scoreBg(gs: GameState): string {
  if (gs === "PRE") return "#303030"; /* near-black */
  if (gs === "IN") return "lightgray";
  return "transparent";
}

export function scoreColor(
  side: "home" | "away",
  gs: GameState,
  attr: GameAttr,
  colors: ColorsConfig = {}
): string {
  if (gs === "PRE") return "black";
  if (gs === "IN") {
    return isSideAheadOrWinning(side, gs, attr)
      ? colorVar(colors.score_leading, CSS_VARS.scoreLeadingColor, "brown")
      : "black";
  }
  if (gs === "POST") {
    return isSideAheadOrWinning(side, gs, attr)
      ? colorVar(colors.score_winner, CSS_VARS.scoreWinnerColor, "orange")
      : colorVar(colors.score_loser, CSS_VARS.scoreLoserColor, "darkgray");
  }
  return "black";
}

export function colonColor(gs: GameState): string {
  if (gs === "PRE" || gs === "IN") return "black";
  if (gs === "POST") return "#777"; /* gray */
  return "transparent";
}

export function scoreText(side: "home" | "away", gs: GameState, attr: GameAttr): string {
  if (gs === "PRE") return "–";
  return String(isTeamSide(side, attr) ? (attr.team_score ?? "") : (attr.opponent_score ?? ""));
}

export function nameText(side: "home" | "away", attr: GameAttr): string {
  return String(isTeamSide(side, attr) ? (attr.team_name ?? "") : (attr.opponent_name ?? ""));
}

export function rankText(side: "home" | "away", attr: GameAttr): string {
  return String(isTeamSide(side, attr) ? (attr.team_record ?? "") : (attr.opponent_record ?? ""));
}
