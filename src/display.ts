import type { ColorsConfig, GameAttr, GameState } from "./types.js";

export function isTeamSide(side: "home" | "away", attr: GameAttr): boolean {
  return side === "home" ? attr?.team_homeaway === "home" : attr?.team_homeaway !== "home";
}

/** `colors.<key>` config override, or the `--ttsc-*` custom property with its default —
 *  the single source of truth for every colour's fallback chain. */
export function colorVar(override: string | undefined, cssVar: string, fallback: string): string {
  return override ?? `var(${cssVar}, ${fallback})`;
}

/** Shared leading/winner side-check used by both `scoreColor()` and `teamColor()` —
 *  callers only invoke this once they've already gated on `gs === "IN" | "POST"`. */
export function isSideAheadOrWinning(
  side: "home" | "away",
  gs: GameState,
  attr: GameAttr
): boolean {
  const isSide = isTeamSide(side, attr);
  if (gs === "IN") {
    const ts = parseFloat(String(attr.team_score ?? 0));
    const os = parseFloat(String(attr.opponent_score ?? 0));
    return isSide ? ts >= os : os >= ts;
  }
  return Boolean(isSide ? attr.team_winner : attr.opponent_winner);
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
  const isSide = isTeamSide(side, attr);
  if (gs === "IN") {
    const ts = parseFloat(String(attr.team_score ?? 0));
    const os = parseFloat(String(attr.opponent_score ?? 0));
    return isSide ? ts > os : os > ts;
  }
  return Boolean(isSide ? attr.team_winner : attr.opponent_winner);
}

// Both names fall back to the opponent gray by default; the outright leading
// (IN) or winning (POST) side takes the live/winner colour — the same colour
// already used for the score cell and, during IN, the live clock/TV badge. A
// tie/draw highlights neither side. A special_teams entry no longer affects
// colour — it drives the ★ marker in render.ts instead.
export function teamColor(
  side: "home" | "away",
  gs: GameState,
  attr: GameAttr,
  colors: ColorsConfig = {}
): string {
  if (gs === "IN" && isSideOutrightWinning(side, gs, attr))
    return colorVar(colors.live, "--ttsc-live-color", "indianred");
  if (gs === "POST" && isSideOutrightWinning(side, gs, attr))
    return colorVar(colors.winner, "--ttsc-winner-color", "orange");
  return colorVar(colors.opponent, "--ttsc-opponent-color", "#777"); /* gray */
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
      ? colorVar(colors.live, "--ttsc-live-color", "indianred")
      : "black";
  }
  if (gs === "POST") {
    return isSideAheadOrWinning(side, gs, attr)
      ? colorVar(colors.winner, "--ttsc-winner-color", "orange")
      : colorVar(colors.loser, "--ttsc-loser-color", "darkgray");
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
