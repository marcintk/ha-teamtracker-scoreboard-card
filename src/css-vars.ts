// Single source of truth for every `--ttsc-*` custom property name. `index.ts`'s `_render`
// is the sole producer (it writes these onto `ha-card`'s inline style); `styles.ts`,
// `display.ts`, `render.ts` and `widgets.ts` are the consumers (CSS defaults / `colorVar`
// fallback chains). Renaming a var here is then a single edit instead of a silent runtime
// fallback if a literal string drifts out of sync at one of the call sites.
export const CSS_VARS = {
  // one var for both sides — `layout.team_width` has no per-side counterpart, so a
  // single width has always applied to both .team-col-a and .team-col-b
  teamColWidth: "--ttsc-team-col-width",
  logoWidth: "--ttsc-logo-width",
  scoreWidth: "--ttsc-score-width",
  colonWidth: "--ttsc-colon-width",
  rowHeight: "--ttsc-row-height",
  rowPadding: "--ttsc-row-padding",
  fontScale: "--ttsc-font-scale",
  headerColor: "--ttsc-header-color",
  nameDefaultColor: "--ttsc-name-default-color",
  nameSpecialColor: "--ttsc-name-special-color",
  nameLeadingColor: "--ttsc-name-leading-color",
  nameWinnerColor: "--ttsc-name-winner-color",
  scoreLeadingColor: "--ttsc-score-leading-color",
  scoreWinnerColor: "--ttsc-score-winner-color",
  scoreLoserColor: "--ttsc-score-loser-color",
  liveColor: "--ttsc-live-color",
  subColor: "--ttsc-sub-color",
} as const;
