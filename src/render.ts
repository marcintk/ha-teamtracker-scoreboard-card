import { html, nothing, type TemplateResult } from "lit";
import { sectionMatches } from "./config-match.js";
import { CSS_VARS } from "./css-vars.js";
import {
  colonColor,
  colorVar,
  isSideOutrightWinning,
  isTeamSide,
  nameText,
  rankText,
  scoreBg,
  scoreColor,
  scoreText,
  teamColor,
} from "./display.js";
import { isBlinkFresh } from "./runtime/blink.js";
import { deduplicate, sortKeyFor } from "./sorting.js";
import type {
  ColorsConfig,
  GameState,
  HassEntity,
  HassStates,
  ScoreBlinkEntry,
  SectionConfig,
} from "./types.js";
import {
  DEFAULT_LIMIT,
  DEFAULT_SCORE_BLINK,
  DEFAULT_TV_BADGE_CHARS,
  VALID_STATES,
} from "./utils.js";
import { logoHtml, messageHtml, tvHtml } from "./widgets.js";

// live (IN) games always sit above everything else. Every other state — PRE /
// BYE / POST — shares one band, ordered by distance from now (see the sort),
// so an imminent fixture and a just-finished game interleave.
const scheduleGroup = (state: string | undefined): number => (state === "IN" ? 0 : 1);

/** Same-typed flags grouped behind one object so a call site reads as labeled fields —
 *  `{ freshHome, freshAway }` can't be silently transposed the way two adjacent
 *  positional booleans can. */
export interface RowFlags {
  opponentSpecial?: boolean;
  freshHome?: boolean;
  freshAway?: boolean;
  highlightWinner?: boolean;
  tvBadge?: number;
}

export function rowHtml(
  stateObj: HassEntity | null,
  special: boolean,
  colors: ColorsConfig = {},
  flags: RowFlags = {}
): TemplateResult {
  const {
    opponentSpecial = false,
    freshHome = false,
    freshAway = false,
    highlightWinner = true,
    tvBadge = DEFAULT_TV_BADGE_CHARS,
  } = flags;
  const gs = (stateObj?.state ?? "") as GameState;
  const attr = stateObj?.attributes ?? {};
  const bg = scoreBg(gs);
  const freshClassHome = freshHome ? " score-fresh" : "";
  const freshClassAway = freshAway ? " score-fresh" : "";

  const opponentColor = colorVar(colors.name_default, CSS_VARS.nameDefaultColor, "#777"); /* gray */
  const specialColor = colorVar(
    colors.name_special,
    CSS_VARS.nameSpecialColor,
    "#2196F3"
  ); /* Material Blue */
  const homeSpecial = isTeamSide("home", attr) ? special : opponentSpecial;
  const awaySpecial = isTeamSide("away", attr) ? special : opponentSpecial;
  const homeAhead =
    highlightWinner && (gs === "IN" || gs === "POST") && isSideOutrightWinning("home", gs, attr);
  const awayAhead =
    highlightWinner && (gs === "IN" || gs === "POST") && isSideOutrightWinning("away", gs, attr);
  const homeColor = homeSpecial
    ? specialColor
    : homeAhead
      ? teamColor("home", gs, attr, colors)
      : opponentColor;
  const awayColor = awaySpecial
    ? specialColor
    : awayAhead
      ? teamColor("away", gs, attr, colors)
      : opponentColor;
  const homeWeight = homeAhead ? "bold" : "normal";
  const awayWeight = awayAhead ? "bold" : "normal";

  return html`
<div class="game-row">
  <div class="team-col team-col-a">
    <div class="team-name" style="color:${homeColor};font-weight:${homeWeight}">${nameText("home", attr)}</div>
    <div class="team-rank" style="color:${opponentColor}">${rankText("home", attr)}</div>
  </div>
  <div class="logo logo-a">${logoHtml("home", attr)}</div>
  <div class="score score-a${freshClassHome}" style="background:${bg};color:${scoreColor("home", gs, attr, colors)}"><span class="score-value">${scoreText("home", gs, attr)}</span></div>
  <div class="colon" style="background:${bg};color:${colonColor(gs)}">${gs ? ":" : ""}</div>
  <div class="score score-b${freshClassAway}" style="background:${bg};color:${scoreColor("away", gs, attr, colors)}"><span class="score-value">${scoreText("away", gs, attr)}</span></div>
  <div class="logo logo-b">${logoHtml("away", attr)}</div>
  <div class="team-col team-col-b">
    <div class="team-name" style="color:${awayColor};font-weight:${awayWeight}">${nameText("away", attr)}</div>
    <div class="team-rank" style="color:${opponentColor}">${rankText("away", attr)}</div>
  </div>
  <div class="message">${messageHtml(gs, attr, colors)}</div>
  <div class="tv">${tvHtml(gs, attr, colors, tvBadge)}</div>
</div>`;
}

/** Same-typed flags grouped behind one object, mirroring `RowFlags` — `sectionHtml` had
 *  the same 9-positional-param shallowness `rowHtml` was already fixed for. `blinkMsFor`
 *  defaults to this section's own `score_blink`, but a caller tracking blink windows
 *  across every section an id matches (see `blinkMsForId` in config-match.ts) should pass its
 *  own resolver so the row-freshness check agrees with wherever else that window is used. */
export interface SectionFlags {
  carousel?: boolean;
  controls?: TemplateResult | typeof nothing;
  highlightWinner?: boolean;
  tvBadge?: number;
  blinkMsFor?: (entityId: string) => number;
}

export function sectionHtml(
  section: SectionConfig,
  states: HassStates,
  entityIds?: string[],
  colors: ColorsConfig = {},
  scoreChangedAt: ReadonlyMap<string, ScoreBlinkEntry> = new Map(),
  flags: SectionFlags = {}
): TemplateResult | typeof nothing {
  const {
    carousel = false,
    controls = nothing,
    highlightWinner = true,
    tvBadge = DEFAULT_TV_BADGE_CHARS,
    blinkMsFor = () => (section.score_blink ?? DEFAULT_SCORE_BLINK) * 1000,
  } = flags;
  const { name, prefix = "", limit = DEFAULT_LIMIT, special_teams = [] } = section;
  const resolvedIds = entityIds ?? Object.keys(states).filter((id) => sectionMatches(section, id));
  const entities = resolvedIds.filter((id) =>
    VALID_STATES.has((states[id]?.state ?? "") as GameState)
  );
  // the name always lives in .section-title, carousel controls or not — a stable
  // node for tests to read, so a future stack-mode control doesn't grow the
  // section's own textContent out from under them
  const header =
    controls === nothing
      ? html`<div class="section-header" style=${colors.header ? `color:${colors.header}` : nothing}><span class="section-title">${name}</span></div>`
      : html`<div class="section-header has-controls" style=${colors.header ? `color:${colors.header}` : nothing}><span class="section-title">${name}</span>${controls}</div>`;
  const emptyHtml = () =>
    html`${header}<div class="empty">No games found — check your section prefixes.</div>`;
  if (!entities.length) return carousel ? emptyHtml() : nothing;

  const now = Date.now();

  const items = entities.map((entityId) => {
    const attr = states[entityId]?.attributes;
    return {
      entityId,
      teamName: String(attr?.team_name ?? entityId),
      special:
        special_teams.includes(entityId) || special_teams.includes(entityId.replace(prefix, "")),
      key: sortKeyFor(attr, now),
    };
  });

  items.sort((a, b) => {
    // live games first
    const ga = scheduleGroup(states[a.entityId]?.state);
    const gb = scheduleGroup(states[b.entityId]?.state);
    if (ga !== gb) return ga - gb;
    // then everything else by distance from now — the soonest kickoff and the
    // most-recent final float to the top, regardless of PRE vs POST
    const near = Math.abs(a.key - now) - Math.abs(b.key - now);
    if (near !== 0) return near;
    const nameDiff = a.teamName.localeCompare(b.teamName);
    return nameDiff !== 0 ? nameDiff : a.entityId.localeCompare(b.entityId);
  });

  const rows = deduplicate(items, states)
    .slice(0, limit)
    .map(({ entityId, special = false, opponentSpecial = false }) => {
      const entry = scoreChangedAt.get(entityId);
      // entities was filtered above to ids present in states with a valid state, so this is defined
      const entity = states[entityId] as HassEntity;
      const attr = entity.attributes;
      const blinkMs = blinkMsFor(entityId);
      // each side's own timestamp gates its own window independently — a change on one
      // side must not cut the other side's blink short
      const freshHome = isBlinkFresh(
        isTeamSide("home", attr) ? entry?.team : entry?.opponent,
        blinkMs,
        now
      );
      const freshAway = isBlinkFresh(
        isTeamSide("away", attr) ? entry?.team : entry?.opponent,
        blinkMs,
        now
      );
      return rowHtml(entity, special, colors, {
        opponentSpecial,
        freshHome,
        freshAway,
        highlightWinner,
        tvBadge,
      });
    });

  if (!rows.length) return carousel ? emptyHtml() : nothing;
  return html`${header}${rows}`;
}
