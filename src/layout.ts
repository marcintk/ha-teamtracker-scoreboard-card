import { CSS_VARS } from "./css-vars.js";
import type { LayoutConfig, SectionConfig } from "./types.js";
import { DEFAULT_LIMIT, DEFAULT_ROW_HEIGHT, DEFAULT_ROW_PADDING } from "./utils.js";

/** A pixel length ("34px") → its number; anything else (a bare number, rem, %, auto,
 *  undefined) → null, so callers fall back to their own default instead of a wrong number. */
export function asPx(v: string | undefined): number | null {
  const m = /^(\d+(?:\.\d+)?)px$/.exec((v ?? "").trim());
  return m ? Number(m[1]) : null;
}

/** Each row is row_height + padding above and below it — shared by the slide-mode
 *  min-height calc and `getCardSize` so the two can't drift out of sync. */
export function rowGeometryPx(
  row_height: string | undefined,
  row_padding: string | undefined
): number {
  return (asPx(row_height) ?? DEFAULT_ROW_HEIGHT) + 2 * (asPx(row_padding) ?? DEFAULT_ROW_PADDING);
}

/** Every CSS custom property plus `ha-card`'s own inline style that a layout config and
 *  the current carousel state produce, collapsed into one string — the single place
 *  config → inline style is computed, so it can't drift between `_render`'s own markup
 *  and a future caller. */
export function buildHaCardStyle(
  layout: LayoutConfig,
  sections: SectionConfig[],
  carousel: boolean
): string {
  const {
    height,
    team_width,
    logo_width,
    score_width,
    colon_width,
    row_height,
    row_padding,
    font_scale,
  } = layout;

  let slideMinH = "";
  if (carousel && !height && sections.length) {
    const slideH = rowGeometryPx(row_height, row_padding);
    const maxRows = Math.max(...sections.map((s) => 1 + (s.limit ?? DEFAULT_LIMIT)));
    slideMinH = `min-height:${maxRows * slideH}px;`;
  }

  const cssVars: Record<string, string | undefined> = {
    [CSS_VARS.teamColWidth]: team_width,
    [CSS_VARS.logoWidth]: logo_width,
    [CSS_VARS.scoreWidth]: score_width,
    [CSS_VARS.colonWidth]: colon_width,
    [CSS_VARS.rowHeight]: row_height,
    [CSS_VARS.rowPadding]: row_padding,
    [CSS_VARS.fontScale]: font_scale != null && font_scale !== 1 ? String(font_scale) : undefined,
  };
  const varStr = Object.entries(cssVars)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}:${String(v)};`)
    .join("");

  const heightStyle = height
    ? `height:${String(height)};min-height:${String(height)};max-height:${String(height)};overflow:hidden;`
    : "";

  return `${slideMinH}${heightStyle}${varStr}`;
}

/** The section(s) currently visible, paired with their original config index: every
 *  section in stack mode, or just the one at `slideIndex` (wrapped into range) in
 *  carousel mode. */
export function resolveVisibleSections(
  sections: SectionConfig[],
  carousel: boolean,
  slideIndex: number
): Array<[number, SectionConfig]> {
  if (!carousel) return Array.from(sections.entries());
  const idx = ((slideIndex % sections.length) + sections.length) % sections.length;
  return [[idx, sections[idx] as SectionConfig]];
}
