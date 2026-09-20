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

<important if="you are writing or modifying tests, or about to report a task/slice complete">

Run `npm run test:coverage` (not bare `npm test`) before considering work or a slice done — only the
`--coverage` flag enforces the 100% thresholds configured in `vitest.config.mjs`. `npm test` runs
the same suite without checking those thresholds, so a slice can look green under `npm test` while
still failing CI's `test:coverage` gate. </important>
