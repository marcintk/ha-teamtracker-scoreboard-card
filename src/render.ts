import { html, nothing, type TemplateResult } from "lit";
import {
  colonColor,
  isTeamSide,
  nameText,
  rankText,
  scoreBg,
  scoreColor,
  scoreText,
  teamColor,
} from "./display.js";
import { deduplicate, resolveSortMode, sortKeyFor } from "./sorting.js";
import type { ColorsConfig, GameState, HassEntity, HassStates, SectionConfig } from "./types.js";
import { DEFAULT_LIMIT, DEFAULT_SCORE_BLINK, VALID_STATES } from "./utils.js";
import { logoHtml, messageHtml, tvHtml } from "./widgets.js";

// schedule view: live (IN) games always sit above everything else. Every other
// state — PRE / BYE / POST — shares one band, ordered by distance from now
// (see the sort), so an imminent fixture and a just-finished game interleave.
const scheduleGroup = (state: string | undefined): number => (state === "IN" ? 0 : 1);

export function rowHtml(
  stateObj: HassEntity | null,
  special: boolean,
  colors: ColorsConfig = {},
  opponentSpecial = false,
  isFresh = false,
  // number → the rank; `null` → an empty gutter cell (alignment); `undefined` → no cell
  position: number | null | undefined = undefined,
  // schedule view: drop the tracked-team highlight (bold + team colour) so both
  // names read the same — see teamColor's `flat`
  schedule = false
): TemplateResult {
  const gs = (stateObj?.state ?? "") as GameState;
  const attr = stateObj?.attributes ?? {};
  const bg = scoreBg(gs);
  const freshClass = isFresh ? " score-fresh" : "";

  const homeColor = teamColor("home", attr, special, colors, opponentSpecial, schedule);
  const awayColor = teamColor("away", attr, special, colors, opponentSpecial, schedule);
  const posColor = attr.team_homeaway === "home" ? homeColor : awayColor;
  const homeWeight = !schedule && isTeamSide("home", attr) ? "bold" : "normal";
  const awayWeight = !schedule && isTeamSide("away", attr) ? "bold" : "normal";

  return html`
<div class="game-row">
  ${position === undefined ? nothing : html`<div class="team-pos" style=${position === null ? nothing : `color:${posColor}`}>${position ?? ""}</div>`}
  <div class="team-col team-col-a">
    <div class="team-name" style="color:${homeColor};font-weight:${homeWeight}">${nameText("home", attr)}</div>
    <div class="team-rank" style="color:${homeColor}">${rankText("home", attr)}</div>
  </div>
  <div class="logo logo-a">${logoHtml("home", attr)}</div>
  <div class="score score-a${freshClass}" style="background:${bg};color:${scoreColor("home", gs, attr, colors)}">${scoreText("home", gs, attr)}</div>
  <div class="colon${freshClass}" style="background:${bg};color:${colonColor(gs)}">${gs ? ":" : ""}</div>
  <div class="score score-b${freshClass}" style="background:${bg};color:${scoreColor("away", gs, attr, colors)}">${scoreText("away", gs, attr)}</div>
  <div class="logo logo-b">${logoHtml("away", attr)}</div>
  <div class="team-col team-col-b">
    <div class="team-name" style="color:${awayColor};font-weight:${awayWeight}">${nameText("away", attr)}</div>
    <div class="team-rank" style="color:${awayColor}">${rankText("away", attr)}</div>
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
  controls: TemplateResult | typeof nothing = nothing
): TemplateResult | typeof nothing {
  const {
    name,
    prefix = "",
    limit = DEFAULT_LIMIT,
    special_teams = [],
    rank_type = "win-draw-loss",
    view = "schedule",
    score_blink = DEFAULT_SCORE_BLINK,
    show_position = false,
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

  const sortMode = resolveSortMode(entities, states, rank_type, view);
  const now = Date.now();

  const items = entities.map((entityId) => {
    const attr = states[entityId]?.attributes;
    return {
      entityId,
      teamName: String(attr?.team_name ?? entityId),
      special: special_teams.includes(entityId.replace(prefix, "")),
      key: sortKeyFor(attr, sortMode, now),
    };
  });

  items.sort((a, b) => {
    if (sortMode === "by-date") {
      // live games first
      const ga = scheduleGroup(states[a.entityId]?.state);
      const gb = scheduleGroup(states[b.entityId]?.state);
      if (ga !== gb) return ga - gb;
      // then everything else by distance from now — the soonest kickoff and the
      // most-recent final float to the top, regardless of PRE vs POST
      const near = Math.abs(a.key - now) - Math.abs(b.key - now);
      if (near !== 0) return near;
    } else {
      const diff = b.key - a.key; // best record first
      if (diff !== 0) return diff;
    }
    const nameDiff = a.teamName.localeCompare(b.teamName);
    return nameDiff !== 0 ? nameDiff : a.entityId.localeCompare(b.entityId);
  });

  const ranked = items.map((it, i) => ({ ...it, position: i + 1 }));
  const rows = deduplicate(ranked, sortMode, states)
    .slice(0, limit)
    .map(({ entityId, special = false, opponentSpecial = false, position }) => {
      const isFresh = blinkMs > 0 && now - (scoreChangedAt.get(entityId) ?? -Infinity) < blinkMs;
      // no cell unless the section opts in; then the rank in a standings view, or a
      // blank cell in the schedule (keeps rows aligned in a mixed card)
      const pos = !show_position ? undefined : sortMode === "by-date" ? null : position;
      return rowHtml(
        states[entityId] as HassEntity,
        special,
        colors,
        opponentSpecial,
        isFresh,
        pos,
        sortMode === "by-date"
      );
    });

  if (!rows.length) return carousel ? emptyHtml() : nothing;
  return html`${header}${rows}`;
}
