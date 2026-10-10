import { html, nothing, type TemplateResult } from "lit";
import { CSS_VARS } from "./css-vars.js";
import { colorVar } from "./display.js";
import type { Side } from "./game-view.js";
import type { ColorsConfig, GameAttr, GameState } from "./types.js";
import { DEFAULT_TV_BADGE_CHARS, firstSegment, GAME_STATE, safeLogoUrl } from "./utils.js";

// exact-match only: a finished game's clock abbreviation → spelled out
const POST_CLOCK_LABELS = new Map([
  ["FT", "Full Time"],
  ["HT", "Half Time"],
]);

export function logoHtml(side: Side): TemplateResult | typeof nothing {
  const url = safeLogoUrl(side.logo);
  return url ? html`<img src="${url}" alt="">` : nothing;
}

export function tvHtml(
  gs: GameState,
  attr: GameAttr,
  colors: ColorsConfig = {},
  chars: number = DEFAULT_TV_BADGE_CHARS
): TemplateResult | typeof nothing {
  if (chars === 0) return nothing;
  if (gs !== GAME_STATE.PRE && gs !== GAME_STATE.IN) return nothing;
  const tv = String(attr.tv_network ?? "").trim();
  if (!tv) return nothing;
  const networks = tv.split("/").map((n) => n.trim());
  const hasMultiple = networks.length > 1;
  const first = firstSegment(tv, "/").trim();
  const truncated = first.substring(0, chars);
  const label = first.length > chars || hasMultiple ? `${truncated}>` : truncated;
  const bg = gs === GAME_STATE.IN ? colorVar(colors.live, CSS_VARS.liveColor, "indianred") : "#666";
  const badge = html`<span class="tv-badge" style="background:color-mix(in srgb, ${bg} 75%, transparent)">${label}</span>`;
  if (hasMultiple) {
    const tooltip = networks.join(" · ");
    return html`<span class="tv-tooltip" data-tooltip="${tooltip}">${badge}</span>`;
  }
  return badge;
}

export function messageHtml(
  gs: GameState,
  attr: GameAttr,
  colors: ColorsConfig = {}
): TemplateResult {
  switch (gs) {
    case GAME_STATE.PRE: {
      const kickoff = attr.kickoff_in ?? "";
      const city = firstSegment(String(attr.location ?? ""), ",").trim();
      const odds = attr.odds ?? "";
      const sub = city && odds ? `${city}, ${odds}` : city || odds;
      return html`<span style="color:var(${CSS_VARS.subColor}, darkgray)">${kickoff}</span>${sub ? html`<span class="msg-sub">${sub}</span>` : nothing}`;
    }
    case GAME_STATE.BYE:
      return html`<span style="color:var(${CSS_VARS.subColor}, darkgray)">Bye</span>`;
    case GAME_STATE.IN: {
      const clock = attr.clock ?? "";
      const raw = String(attr.last_play ?? "");
      let subTemplate: TemplateResult | typeof nothing = nothing;
      if (raw) {
        if (raw.length > 50) {
          const fmt = raw.replace(/; /g, ";\n").replace(/ (\d+(?:'\+\d+)?')/g, "\n$1");
          subTemplate = html`<span class="msg-sub tv-tooltip" data-tooltip="${fmt}"><span class="msg-text">${raw.substring(0, 50)}</span></span>`;
        } else {
          subTemplate = html`<span class="msg-sub">${raw}</span>`;
        }
      }
      return html`<span style="color:${colorVar(colors.live, CSS_VARS.liveColor, "indianred")}">${clock}</span>${subTemplate}`;
    }
    default: {
      const raw = attr.clock ?? "";
      const clock = POST_CLOCK_LABELS.get(raw) ?? raw;
      const sub = attr.series_summary ?? "";
      return html`<span style="color:${colorVar(colors.score_winner, CSS_VARS.scoreWinnerColor, "orange")}">${clock}</span>${sub ? html`<span class="msg-sub">${sub}</span>` : nothing}`;
    }
  }
}
