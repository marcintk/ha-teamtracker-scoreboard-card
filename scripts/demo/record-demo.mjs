#!/usr/bin/env node
// Regenerates docs/demo.gif.
//
// Serves the repo root over HTTP, opens scripts/demo/record-harness.html in headless
// Chromium (Playwright), drives the card's real slide controls, and samples page
// screenshots at a fixed cadence so the card's own transitions (slide swap, score
// blink) read as motion. Two-pass ffmpeg palette encode → docs/demo.gif.
//
// Read-only against the repo: never writes to src/, dist/ (rebuild with `npm run
// build`), or docs/* other than the output gif. See scripts/demo/record-demo.json
// for the full recipe.
//
// Usage:  npm run demo:record  [-- --out <gif-path>]
// Prereqs: `npm run build` (dist/card.js must be current); ffmpeg on PATH;
//          `npx playwright install chromium` once.

import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { chromium } from "playwright";

const ROOT = new URL("../..", import.meta.url).pathname;
const HARNESS_PATH = "/scripts/demo/record-harness.html";
const VIEW_WIDTH = 1100;
const FPS = 10;
const OUT_WIDTH = 660; // final gif width; height follows the card's own box

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

function serveRoot() {
  const server = http.createServer((req, res) => {
    const filePath = join(ROOT, decodeURIComponent(req.url.split("?")[0]));
    if (!filePath.startsWith(ROOT) || !existsSync(filePath)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream" });
    createReadStream(filePath).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FRAME_MS = 1000 / FPS;

function makeDriver(page, framesDir, clip) {
  let frame = 0;
  const shoot = () =>
    page.screenshot({ path: join(framesDir, `f${String(frame++).padStart(4, "0")}.png`), clip });
  // pace to the target FPS so wall-clock advances with the frame count — the slide
  // swap is a hard cut, so the rotation timer needs real time to pass to fire on camera
  const hold = async (n) => {
    for (let i = 0; i < n; i++) {
      const t = Date.now();
      await shoot();
      await sleep(Math.max(0, FRAME_MS - (Date.now() - t)));
    }
  };
  // click a control inside the card's shadow root by CSS selector
  const click = (sel) =>
    page.evaluate(
      (s) => document.getElementById("demo-card").shadowRoot.querySelector(s)?.click(),
      sel
    );
  return { hold, click, frameCount: () => frame };
}

async function runScenario(page, d) {
  const set = (id, patch, state) => page.evaluate(([i, p, st]) => window.__set(i, p, st), [id, patch, state]);
  await d.hold(20); // rest on the full stack of three sections

  // .score-fresh blink is disabled under prefers-reduced-motion — enable it for the updates
  await page.emulateMedia({ reducedMotion: "no-preference" });

  // goals land in different sections, one after another
  await set("sensor.nba_bos", { team_score: 91, clock: "Q3 3:50" });
  await d.hold(24);
  await set("sensor.nhl_col", { team_score: 4, clock: "2nd 5:12" });
  await d.hold(24);
  await set("sensor.epl_liv", { opponent_score: 2, clock: "71'" });
  await d.hold(24);

  // lead change: the trailing side scores
  await set("sensor.nhl_tb", { team_score: 2, clock: "1st 14:20" });
  await d.hold(24);

  // an upcoming game tips off (PRE → IN), then scores
  await set("sensor.nba_nyk", { team_score: 0, opponent_score: 0, clock: "Q1 12:00", kickoff_in: undefined }, "IN");
  await d.hold(20);
  await set("sensor.nba_nyk", { team_score: 3, clock: "Q1 11:21" });
  await d.hold(24);

  // a live game ends (IN → POST): winner marked, clock shows Final
  await set("sensor.epl_liv", { opponent_score: 2, team_score: 3, clock: "FT", team_winner: true }, "POST");
  await d.hold(30);

  await d.hold(12); // resting frames before the loop point
}

async function main() {
  const outArg = process.argv.indexOf("--out");
  const outPath = outArg !== -1 ? process.argv[outArg + 1] : join(ROOT, "docs", "demo.gif");

  if (!existsSync(join(ROOT, "dist", "card.js"))) {
    throw new Error("dist/card.js missing — run `npm run build` first");
  }

  const framesDir = mkdtempSync(join(tmpdir(), "ttsc-demo-frames-"));
  const server = await serveRoot();
  const port = server.address().port;
  // Chromium doesn't read HTTP_PROXY/HTTPS_PROXY itself (unlike curl/fetch) — forward it
  // explicitly so the team-logo fetches to espncdn.com work in a proxied/sandboxed shell.
  // No-op on a normal machine where these are unset. Bypass the proxy for the harness's
  // own localhost server, which the proxy wouldn't know how to route. Playwright wants
  // embedded basic-auth credentials split out into username/password, not left in the URL.
  const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  let proxy;
  if (proxyUrl) {
    try {
      const u = new URL(proxyUrl);
      proxy = {
        server: `${u.protocol}//${u.host}`,
        username: decodeURIComponent(u.username) || undefined,
        password: decodeURIComponent(u.password) || undefined,
        bypass: "localhost,127.0.0.1",
      };
    } catch {
      // a scheme-less or otherwise malformed proxy value (e.g. "localhost:3128") shouldn't
      // crash the recording — fall back to no proxy, same as if it were unset
      console.warn(`ignoring unparseable HTTPS_PROXY: ${proxyUrl}`);
    }
  }
  const browser = await chromium.launch(proxy ? { proxy } : undefined);
  const context = await browser.newContext({
    viewport: { width: VIEW_WIDTH, height: 1000 },
    deviceScaleFactor: 2,
    // record with prefers-reduced-motion: the card starts the slide rotation
    // paused, so the shoot deterministically opens on the first section and the
    // demo shows the manual ‹/› controls before the final toggle resumes auto-advance
    reducedMotion: "reduce",
    // the sandboxed proxy above MITMs TLS with its own CA, which Chromium (unlike
    // curl/node) doesn't trust out of the box — only relevant when a proxy is in play
    ignoreHTTPSErrors: Boolean(proxy),
  });
  if (proxy) {
    // the harness fires ~30 team-logo <img> requests to espncdn.com in parallel; if none
    // of them has authenticated against the proxy yet, they can all get a 407 back at once
    // (Chromium's proxy-auth cache isn't primed) and every logo fails to load. One sequential
    // request to the same host first primes that cache so the parallel batch succeeds — it
    // only needs to open an authenticated CONNECT tunnel, not fetch anything real, so the
    // bare origin works and doesn't couple this to any one team's logo path.
    const primer = await context.newPage();
    await primer.goto("https://a.espncdn.com/").catch(() => {});
    await primer.close();
  }
  const page = await context.newPage();

  try {
    await page.goto(`http://127.0.0.1:${port}${HARNESS_PATH}`);
    for (let i = 0; i < 40; i++) {
      if (await page.evaluate(() => window.__ready === true)) break;
      await sleep(250);
    }
    await sleep(2500); // let the ESPN logos finish loading

    const box = await page.evaluate(() =>
      document.getElementById("wrap").getBoundingClientRect().toJSON()
    );
    const clip = {
      x: Math.round(box.x),
      y: Math.round(box.y),
      // floor to an even number: rounding up can capture a 1px sliver of the
      // page background below the card's bottom edge (reads as a dark line)
      width: Math.floor(box.width / 2) * 2,
      height: Math.floor(box.height / 2) * 2,
    };
    console.log("clip", clip);

    const d = makeDriver(page, framesDir, clip);
    await runScenario(page, d);
    console.log("frames", d.frameCount());
  } finally {
    await context.close();
    await browser.close();
    server.close();
  }

  const palette = join(framesDir, "palette.png");
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-framerate", String(FPS),
    "-i", join(framesDir, "f%04d.png"),
    "-vf", `scale=${OUT_WIDTH}:-2:flags=lanczos,palettegen=max_colors=128:stats_mode=diff`,
    palette,
  ]);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-framerate", String(FPS),
    "-i", join(framesDir, "f%04d.png"),
    "-i", palette,
    "-lavfi", `scale=${OUT_WIDTH}:-2:flags=lanczos[s];[s][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
    outPath,
  ]);

  rmSync(framesDir, { recursive: true, force: true });
  console.log(`wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
