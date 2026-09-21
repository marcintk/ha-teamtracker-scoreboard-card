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
still failing CI's `test:coverage` gate. 
</important>

<important if="you are adding, renaming, or changing a section/card config option, or about to report a task/slice complete">
Update the config tables in `README.md` (Section/Layout/Colors, whichever the option belongs to) in
the same slice — they're the only place config options are documented, and they drift silently
otherwise. This was missed once already (the `section.entities` option landed without a README
update until asked for separately). 
 </important>

<important if="you need to record or regenerate docs/demo.gif">
Run `npm run build` first (dist/card.js must be current), then `npm run demo:record` —
scripts/demo/record-demo.mjs. Needs ffmpeg on PATH and `npx playwright install chromium` once. In a
sandboxed shell, declare network access to `a.espncdn.com` (the team-logo CDN the demo harness loads
from) or the recording will show broken-image icons instead of logos. The script already forwards a
MITM'ing sandbox proxy to Chromium (which doesn't read HTTP_PROXY/HTTPS_PROXY itself, doesn't trust
the proxy's TLS-interception CA, and can lose the race to authenticate ~30 parallel logo requests
before any of them succeeds) — no extra setup needed beyond allowing the domain.
</important>
