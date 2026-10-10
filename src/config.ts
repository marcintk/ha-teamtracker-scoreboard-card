import type { CardConfig, ColorsConfig, NameFormat } from "./types.js";
import { DEFAULT_TV_BADGE_CHARS } from "./utils.js";

export interface RenderOptions {
  tvBadge: number;
  nameFormat: NameFormat;
  highlightWinner: boolean;
  liveFirst: boolean;
  colors: ColorsConfig;
}

/** Resolves render-affecting config to defaults/coerced values; invalid values fall back silently. */
export function resolveRenderOptions(config: CardConfig | null | undefined): RenderOptions {
  const n = config?.tv_badge;
  const f = config?.name_format;
  return {
    tvBadge: typeof n === "number" && n >= 0 ? n : DEFAULT_TV_BADGE_CHARS,
    nameFormat: f === "long_name" || f === "abbr" ? f : "name",
    highlightWinner: config?.highlight_winner ?? true,
    liveFirst: config?.live_first === true,
    colors: config?.colors ?? {},
  };
}
