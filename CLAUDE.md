# ha-teamtracker-scoreboard-card

TypeScript + Rollup → `dist/card.js` | Vitest | Biome + Prettier | HACS plugin

## Commands

```bash
npm install
npm run build          # bundle src/ → dist/card.js
npm run build:prod     # minified build (VERSION env var stamps the bundle)
npm run dev            # rollup watch mode
npm test               # run tests
npm run test:watch     # vitest watch mode
npm run test:coverage  # run with coverage (must stay at 100%)
npm run typecheck      # tsc --noEmit
npm run check          # biome lint + format (src/ and test/, auto-fix)
npm run format:md      # prettier for markdown files
npm run check:ci       # CI gate: typecheck + biome check + prettier check
```

## Design Invariants

Durable behavioral/UX constraints. Preserve unless the user explicitly changes them.

- A section always renders the date-sorted schedule list — one entry per game. There is no
  standings/ranking mode. The sensor `season` attribute is not consulted.
- The schedule shows one entry per game (home sensor wins over away when both exist). `IN` (live)
  games sort first; every other state (`PRE`/`BYE`/`POST`) shares one band ordered by
  `|date − now|`, so the next kick-off and the just-finished game sit near the top
- Team-name rendering: both names render normal-weight in the `opponent` colour by default. With
  `highlight_winner: true` (off by default — no distinction), the side that is `>=` on score during
  `IN` takes the `leading` colour and bold (an exact tie highlights both names, mirroring
  `scoreColor()`'s score-cell comparison), and the winning side during `POST` takes the `winner`
  colour and bold (the losing/trailing side stays plain `opponent`/normal-weight). This highlight
  applies only to the `.team-name` text — the `.team-rank` (record) always stays in the plain
  `opponent` colour, never bold. A `special_teams` entry appends a ★ marker after the name,
  independent of colour/`highlight_winner`.
- Team logos render only for HTTPS URLs; non-HTTPS is silently dropped
- With `mode: slide` and **≥ 2 sections**, the card shows one section at a time and auto-advances
  every `slide_sec` seconds (default 45; `≤ 0` ⇒ 45; hard swap, wraps, empty sections take their
  turn). Three header buttons: `‹`/`›` step and pause; the stop/resume toggle (orange while paused)
  is the only way back to auto-advance; `prefers-reduced-motion` starts it paused. With `height`
  unset the card locks to the tallest slide. `mode: stack` (default) / a single section ⇒ the
  stacked render

## Architecture Notes

- **WebSocket subscription**: subscribed to `state_changed` on first `set hass`; callback arms
  `_renderTimer` debounce. Rendering always reads `_hass.states` — never the event payload.
- **Entity filter**: `_trackedIds` (Set) built from section prefixes once per config; reset on
  `setConfig`, rebuilt lazily on next `set hass`.
- **Deduplication**: two-pass — pass 1 builds home/special key sets, pass 2 keeps home sensor over
  away sensor per game key.
- **View state** (`mode: slide` only): `_slideIndex` / `_slidePaused` are instance fields, not
  derived from `hass`; reset in `setConfig` beside the score caches. The rotation timer is one
  idempotent `_syncSlideTimer()` (arms/stops to match state), called from `_render`, `setConfig` and
  the `@click` handlers; `disconnectedCallback` calls `_stopSlideTimer()` only. This is the card's
  one interactive-control pattern — follow it for any future click affordance.
