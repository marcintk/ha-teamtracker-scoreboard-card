import { html, nothing, type TemplateResult } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { isBlinkFresh } from "./blink.js";
import { isSpecialTeam, sectionMatches } from "./config-match.js";
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
import { deduplicate, sortKeyFor } from "./sorting.js";
import { CARD_STYLES } from "./styles.js";
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

const STYLE_BLOCK = unsafeHTML(`<style>${CARD_STYLES}</style>`);

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
  // `special` is scoped to this row's own entity — whichever visual side that entity's
  // own perspective (team_homeaway) puts it on is the side that gets highlighted.
  // `opponentSpecial` covers the other side: the discarded duplicate sensor for this
  // game was independently special too (see sorting.ts's deduplicate()).
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
  const { name, limit = DEFAULT_LIMIT } = section;
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
      special: isSpecialTeam(section, entityId),
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

/** Everything `sectionHtml` needs to build every visible section, plus the card-level
 *  chrome (version badge, debug overlay) that sits alongside them. Grouped behind one
 *  object for the same reason as `RowFlags`/`SectionFlags`: a call site this wide reads
 *  as labeled fields, not a run of same-typed positional args. */
export interface CardTemplateInput {
  states: HassStates;
  trackedBySection: ReadonlyMap<number, string[]> | null;
  colors: ColorsConfig;
  blinkEntries: ReadonlyMap<string, ScoreBlinkEntry>;
  blinkMsFor: (entityId: string) => number;
  carousel: boolean;
  visibleSections: Array<[number, SectionConfig]>;
  slideControls: TemplateResult | typeof nothing;
  highlightWinner: boolean;
  tvBadge: number;
  haCardStyle: string;
  versionBadge: TemplateResult | typeof nothing;
  /** pre-rendered debug-overlay table HTML, or null when `debug` is off. */
  debugTableHtml: string | null;
}

/** Builds the whole card's template — every visible section plus the card-level chrome
 *  — without touching the DOM. The caller (`index.ts`) owns mounting the result with
 *  lit's `render()`; this function owns none of that, so it's testable with a plain
 *  object in, a `TemplateResult` out. */
export function buildCardTemplate(input: CardTemplateInput): {
  template: TemplateResult;
  hasContent: boolean;
} {
  const sectionTemplates = input.visibleSections.map(([i, section]) =>
    sectionHtml(
      section,
      input.states,
      input.trackedBySection?.get(i),
      input.colors,
      input.blinkEntries,
      {
        carousel: input.carousel,
        controls: input.slideControls,
        highlightWinner: input.highlightWinner,
        tvBadge: input.tvBadge,
        blinkMsFor: input.blinkMsFor,
      }
    )
  );
  const hasContent = sectionTemplates.some((t) => t !== nothing);

  const template = html`
    ${STYLE_BLOCK}
    <ha-card style=${input.haCardStyle || nothing}>
      ${input.versionBadge}
      ${
        input.debugTableHtml !== null
          ? unsafeHTML(
              `<div id="sc-debug" style="position:absolute;bottom:0;left:0;right:0;z-index:10;background:rgba(0,0,0,0.5);color:#00e676;font-family:monospace;font-size:11px;line-height:1;padding:2px 6px;pointer-events:none;">${input.debugTableHtml}</div>`
            )
          : nothing
      }
      ${
        hasContent
          ? sectionTemplates
          : html`<div class="empty">No games found — check your section prefixes.</div>`
      }
    </ha-card>
  `;
  return { template, hasContent };
}
