import { html, nothing, type TemplateResult } from "lit";
import { colorVar, isTeamSide } from "./display.js";
import type { ColorsConfig, GameAttr, GameState } from "./types.js";
import { firstSegment, safeLogoUrl } from "./utils.js";

export function logoHtml(side: "home" | "away", attr: GameAttr): TemplateResult | typeof nothing {
  const url = safeLogoUrl(isTeamSide(side, attr) ? attr.team_logo : attr.opponent_logo);
  return url ? html`<img src="${url}" alt="">` : nothing;
}

export function tvHtml(
  gs: GameState,
  attr: GameAttr,
  colors: ColorsConfig = {}
): TemplateResult | typeof nothing {
  if (gs !== "PRE" && gs !== "IN") return nothing;
  const tv = String(attr.tv_network ?? "").trim();
  if (!tv) return nothing;
  const networks = tv.split("/").map((n) => n.trim());
  const hasMultiple = networks.length > 1;
  const first = firstSegment(tv, "/").trim();
  const truncated = first.substring(0, 3);
  const label = first.length > 3 || hasMultiple ? `${truncated}>` : truncated;
  const bg = gs === "IN" ? colorVar(colors.live, "--ttsc-live-color", "indianred") : "#666";
  const badge = html`<span class="tv-badge" style="background:${bg}">${label}</span>`;
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
    case "PRE": {
      const kickoff = attr.kickoff_in ?? "";
      const city = firstSegment(String(attr.location ?? ""), ",").trim();
      const odds = attr.odds ?? "";
      const sub = city && odds ? `${city}, ${odds}` : city || odds;
      return html`<span style="color:var(--ttsc-sub-color, darkgray)">${kickoff}</span>${sub ? html`<span class="msg-sub">${sub}</span>` : nothing}`;
    }
    case "BYE":
      return html`<span style="color:var(--ttsc-sub-color, darkgray)">Bye</span>`;
    case "IN": {
      const clock = attr.clock ?? "";
      const raw = String(attr.last_play ?? "");
      let subTemplate: TemplateResult | typeof nothing = nothing;
      if (raw) {
        if (raw.length > 50) {
          const fmt = raw.replace(/; /g, ";\n").replace(/ (\d+(?:'\+\d+)?')/g, "\n$1");
          subTemplate = html`<span class="msg-sub tv-tooltip" data-tooltip="${fmt}">${raw.substring(0, 50)}></span>`;
        } else {
          subTemplate = html`<span class="msg-sub">${raw}</span>`;
        }
      }
      return html`<span style="color:${colorVar(colors.live, "--ttsc-live-color", "indianred")}">${clock}</span>${subTemplate}`;
    }
    default: {
      const clock = attr.clock ?? "";
      const sub = attr.series_summary ?? "";
      return html`<span style="color:${colorVar(colors.winner, "--ttsc-winner-color", "orange")}">${clock}</span>${sub ? html`<span class="msg-sub">${sub}</span>` : nothing}`;
    }
  }
}
