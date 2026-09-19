import { html, nothing, type TemplateResult } from "lit";
import {
  colonColor,
  colorVar,
  isSideAheadOrWinning,
  isTeamSide,
  nameText,
  rankText,
  scoreBg,
  scoreColor,
  scoreText,
  teamColor,
} from "./display.js";
import { deduplicate, sortKeyFor } from "./sorting.js";
import type { ColorsConfig, GameState, HassEntity, HassStates, SectionConfig } from "./types.js";
import { DEFAULT_LIMIT, DEFAULT_SCORE_BLINK, VALID_STATES } from "./utils.js";
import { logoHtml, messageHtml, tvHtml } from "./widgets.js";

// live (IN) games always sit above everything else. Every other state — PRE /
// BYE / POST — shares one band, ordered by distance from now (see the sort),
// so an imminent fixture and a just-finished game interleave.
const scheduleGroup = (state: string | undefined): number => (state === "IN" ? 0 : 1);

export function rowHtml(
  stateObj: HassEntity | null,
  special: boolean,
  colors: ColorsConfig = {},
  opponentSpecial = false,
  isFresh = false,
  highlightWinner = false
): TemplateResult {
  const gs = (stateObj?.state ?? "") as GameState;
  const attr = stateObj?.attributes ?? {};
  const bg = scoreBg(gs);
  const freshClass = isFresh ? " score-fresh" : "";

  const opponentColor = colorVar(colors.opponent, "--ttsc-opponent-color", "#777"); /* gray */
  const homeAhead =
    highlightWinner && (gs === "IN" || gs === "POST") && isSideAheadOrWinning("home", gs, attr);
  const awayAhead =
    highlightWinner && (gs === "IN" || gs === "POST") && isSideAheadOrWinning("away", gs, attr);
  const homeColor = homeAhead ? teamColor("home", gs, attr, colors) : opponentColor;
  const awayColor = awayAhead ? teamColor("away", gs, attr, colors) : opponentColor;
  const homeWeight = homeAhead ? "bold" : "normal";
  const awayWeight = awayAhead ? "bold" : "normal";
  const homeStar = (isTeamSide("home", attr) ? special : opponentSpecial) ? "★" : "";
  const awayStar = (isTeamSide("away", attr) ? special : opponentSpecial) ? "★" : "";

  return html`
<div class="game-row">
  <div class="team-col team-col-a">
    <div class="team-name" style="color:${homeColor};font-weight:${homeWeight}">${nameText("home", attr)}${homeStar}</div>
    <div class="team-rank" style="color:${opponentColor}">${rankText("home", attr)}</div>
  </div>
  <div class="logo logo-a">${logoHtml("home", attr)}</div>
  <div class="score score-a${freshClass}" style="background:${bg};color:${scoreColor("home", gs, attr, colors)}">${scoreText("home", gs, attr)}</div>
  <div class="colon${freshClass}" style="background:${bg};color:${colonColor(gs)}">${gs ? ":" : ""}</div>
  <div class="score score-b${freshClass}" style="background:${bg};color:${scoreColor("away", gs, attr, colors)}">${scoreText("away", gs, attr)}</div>
  <div class="logo logo-b">${logoHtml("away", attr)}</div>
  <div class="team-col team-col-b">
    <div class="team-name" style="color:${awayColor};font-weight:${awayWeight}">${nameText("away", attr)}${awayStar}</div>
    <div class="team-rank" style="color:${opponentColor}">${rankText("away", attr)}</div>
  </div>
  <div class="message">${messageHtml(gs, attr, colors)}</div>
  <div class="tv">${tvHtml(gs, attr, colors)}</div>
</div>`;
}

export function sectionHtml(
  section: SectionConfig,
  states: HassStates,
  entityIds?: string[],
  colors: ColorsConfig = {},
  scoreChangedAt: Map<string, number> = new Map(),
  carousel = false,
  controls: TemplateResult | typeof nothing = nothing,
  highlightWinner = false
): TemplateResult | typeof nothing {
  const {
    name,
    prefix = "",
    limit = DEFAULT_LIMIT,
    special_teams = [],
    score_blink = DEFAULT_SCORE_BLINK,
  } = section;
  const blinkMs = score_blink * 1000;
  const resolvedIds = entityIds ?? Object.keys(states).filter((id) => id.startsWith(prefix));
  const entities = resolvedIds.filter((id) =>
    VALID_STATES.has((states[id]?.state ?? "") as GameState)
  );
  // the name always lives in .section-title, carousel controls or not — a stable
  // node for tests to read, so a future stack-mode control doesn't grow the
  // section's own textContent out from under them (see LESSONS.md)
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
      special: special_teams.includes(entityId.replace(prefix, "")),
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
      const isFresh = blinkMs > 0 && now - (scoreChangedAt.get(entityId) ?? -Infinity) < blinkMs;
      return rowHtml(
        states[entityId] as HassEntity,
        special,
        colors,
        opponentSpecial,
        isFresh,
        highlightWinner
      );
    });

  if (!rows.length) return carousel ? emptyHtml() : nothing;
  return html`${header}${rows}`;
}
