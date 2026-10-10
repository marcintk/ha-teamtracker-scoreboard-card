import { html, nothing, type TemplateResult } from "lit";
import { keyed } from "lit/directives/keyed.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import type { BlinkTracker } from "./blink.js";
import type { RenderOptions } from "./config.js";
import { sectionBlinkOn } from "./config-match.js";
import { buildRowView, type RowFlags } from "./row-view.js";
import { selectRows } from "./section-rows.js";
import { CARD_STYLES } from "./styles.js";
import type { ColorsConfig, HassEntity, HassStates, SectionConfig } from "./types.js";
import { DEFAULT_TV_BADGE_CHARS } from "./utils.js";
import { logoHtml, messageHtml, tvHtml } from "./widgets.js";

const STYLE_BLOCK = unsafeHTML(`<style>${CARD_STYLES}</style>`);

export function rowHtml(
  stateObj: HassEntity | null,
  special: boolean,
  colors: ColorsConfig = {},
  flags: RowFlags & { tvBadge?: number } = {}
): TemplateResult {
  const { tvBadge = DEFAULT_TV_BADGE_CHARS } = flags;
  const {
    state: gs,
    attr,
    bg,
    colon,
    rankColor,
    home,
    away,
    homeSide,
    awaySide,
  } = buildRowView(stateObj, special, colors, flags);
  const freshClassHome = home.fresh ? " score-fresh" : "";
  const freshClassAway = away.fresh ? " score-fresh" : "";

  return html`
<div class="game-row">
  <div class="team-col team-col-a">
    <div class="team-name" style="color:${home.nameColor}">${home.name}</div>
    <div class="team-rank" style="color:${rankColor}">${home.rank}</div>
  </div>
  <div class="logo logo-a">${logoHtml(homeSide)}</div>
  <div class="score score-a${freshClassHome}" style="background:${bg};color:${home.scoreColor}">${keyed(home.liveScore, html`<span class="score-value">${home.score}</span>`)}</div>
  <div class="colon" style="background:${bg};color:${colon}">${gs ? ":" : ""}</div>
  <div class="score score-b${freshClassAway}" style="background:${bg};color:${away.scoreColor}">${keyed(away.liveScore, html`<span class="score-value">${away.score}</span>`)}</div>
  <div class="logo logo-b">${logoHtml(awaySide)}</div>
  <div class="team-col team-col-b">
    <div class="team-name" style="color:${away.nameColor}">${away.name}</div>
    <div class="team-rank" style="color:${rankColor}">${away.rank}</div>
  </div>
  <div class="message">${messageHtml(gs, attr, colors)}</div>
  <div class="tv">${tvHtml(gs, attr, colors, tvBadge)}</div>
</div>`;
}

/** Same-typed flags grouped behind one object, mirroring `RowFlags` — `sectionHtml` had
 *  the same 9-positional-param shallowness `rowHtml` was already fixed for. */
export interface SectionFlags extends Partial<Omit<RenderOptions, "colors">> {
  carousel?: boolean;
  controls?: TemplateResult | typeof nothing;
  /** per-row blink display; omitted means nothing blinks */
  blink?: Pick<BlinkTracker, "rowView">;
}

export function sectionHtml(
  section: SectionConfig,
  states: HassStates,
  entityIds: string[],
  colors: ColorsConfig = {},
  flags: SectionFlags = {}
): TemplateResult | typeof nothing {
  const {
    carousel = false,
    controls = nothing,
    highlightWinner = true,
    tvBadge = DEFAULT_TV_BADGE_CHARS,
    nameFormat = "name",
    liveFirst = false,
    blink,
  } = flags;
  const { name } = section;
  // per-section: the tracker policy is per-id (any matching section on), so a game shown in a
  // blink-off section must still not blink there
  const blinkOn = sectionBlinkOn(section);
  // the name always lives in .section-title, carousel controls or not — a stable
  // node for tests to read, so a future stack-mode control doesn't grow the
  // section's own textContent out from under them
  const header =
    controls === nothing
      ? html`<div class="section-header" style=${colors.header ? `color:${colors.header}` : nothing}><span class="section-title">${name}</span></div>`
      : html`<div class="section-header has-controls" style=${colors.header ? `color:${colors.header}` : nothing}><span class="section-title">${name}</span>${controls}</div>`;
  const emptyHtml = () =>
    html`${header}<div class="empty">No games found — check your section prefixes.</div>`;
  const rows = selectRows(section, states, entityIds, { liveFirst }).map(
    ({ entityId, special, opponentSpecial }) => {
      // selectRows only returns ids present in states with a valid state, so this is defined
      const entity = states[entityId] as HassEntity;
      return rowHtml(entity, special, colors, {
        opponentSpecial,
        ...((blinkOn && blink?.rowView(entityId, states)) || {
          freshHome: false,
          freshAway: false,
        }),
        highlightWinner,
        tvBadge,
        nameFormat,
      });
    }
  );

  if (!rows.length) return carousel ? emptyHtml() : nothing;
  return html`${header}${rows}`;
}

/** Everything `sectionHtml` needs to build every visible section, plus the card-level
 *  chrome (version badge, debug overlay) that sits alongside them. Grouped behind one
 *  object for the same reason as `RowFlags`/`SectionFlags`: a call site this wide reads
 *  as labeled fields, not a run of same-typed positional args. */
export interface CardTemplateInput {
  states: HassStates;
  trackedBySection: ReadonlyMap<number, string[]>;
  options: RenderOptions;
  blink: Pick<BlinkTracker, "rowView">;
  carousel: boolean;
  visibleSections: Array<[number, SectionConfig]>;
  slideControls: TemplateResult | typeof nothing;
  haCardStyle: string;
  versionBadge: TemplateResult | typeof nothing;
  /** pre-rendered debug-overlay table HTML, or null when `debug` is off. */
  debugTableHtml: string | null;
}

/** Builds the whole card's template — every visible section plus the card-level chrome
 *  — without touching the DOM. The caller (`index.ts`) owns mounting the result with
 *  lit's `render()`; this function owns none of that, so it's testable with a plain
 *  object in, a `TemplateResult` out. */
export function buildCardTemplate(input: CardTemplateInput): TemplateResult {
  const sectionTemplates = input.visibleSections.map(([i, section]) =>
    sectionHtml(
      section,
      input.states,
      input.trackedBySection.get(i) as string[],
      input.options.colors,
      {
        ...input.options,
        carousel: input.carousel,
        controls: input.slideControls,
        blink: input.blink,
      }
    )
  );
  const hasContent = sectionTemplates.some((t) => t !== nothing);

  return html`
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
}
