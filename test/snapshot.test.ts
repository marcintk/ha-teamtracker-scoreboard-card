import { describe, expect, it } from "vitest";
import "../src/index.js";
import type { SportScoreboardCard } from "../src/index.js";
import { rowHtml } from "../src/render.js";
import { CARD_STYLES } from "../src/styles.js";
import type { GameAttr, HassStates, HomeAssistant } from "../src/types.js";
import { logoHtml, messageHtml, tvHtml } from "../src/widgets.js";
import { snap, snapHtml } from "./helpers.js";

// ─── shared fixtures ──────────────────────────────────────────────────────────

const makeHass = (states: HassStates = {}): HomeAssistant =>
  ({ states }) as unknown as HomeAssistant;

const makeState = (state: string, attrs: GameAttr = {}) => ({ state, attributes: attrs });

const baseAttrs: GameAttr = {
  team_homeaway: "home",
  team_name: "Lakers",
  opponent_name: "Celtics",
  team_record: "20-10",
  opponent_record: "18-12",
  team_score: "95",
  opponent_score: "90",
  team_winner: true,
  opponent_winner: false,
  team_logo: "https://cdn.example.com/lal.png",
  opponent_logo: "https://cdn.example.com/bos.png",
  season: "regular",
};

const homeAttr: GameAttr = {
  team_homeaway: "home",
  team_name: "Lakers",
  opponent_name: "Celtics",
  team_record: "20-10",
  opponent_record: "18-12",
  team_score: "95",
  opponent_score: "90",
  team_winner: true,
  opponent_winner: false,
  team_logo: "https://cdn.example.com/lal.png",
  opponent_logo: "https://cdn.example.com/bos.png",
};

const nbaSection = {
  name: "NBA",
  prefix: "sensor.nba_",
  limit: 10,
  special_teams: [] as string[],
  rank_type: "win-loss" as const,
};

function makeCard(): SportScoreboardCard {
  return document.createElement("ha-teamtracker-scoreboard-card") as unknown as SportScoreboardCard;
}

// ─── SportScoreboardCard snapshots ───────────────────────────────────────────

describe("SportScoreboardCard snapshots", () => {
  it("version badge HTML", () => {
    const card = makeCard();
    card._config = { sections: [nbaSection], show_version: true };
    card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
    card._render();
    const badge = card.shadowRoot?.getElementById("sc-version");
    expect(snapHtml(badge?.outerHTML ?? "")).toMatchSnapshot();
  });
});

// ─── CARD_STYLES ─────────────────────────────────────────────────────────────

describe("CARD_STYLES", () => {
  it("matches snapshot", () => {
    expect(CARD_STYLES).toMatchSnapshot();
  });

  it("wires .team-col-a width to the nested team-col-a custom property fallback chain", () => {
    expect(CARD_STYLES).toContain("var(--ttsc-team-col-a-width, var(--ttsc-team-col-width, 99px))");
  });

  it("wires .team-col-b width to the nested team-col-b custom property fallback chain", () => {
    expect(CARD_STYLES).toContain("var(--ttsc-team-col-b-width, var(--ttsc-team-col-width, 99px))");
  });

  it("keeps a 60px shrink floor on the team columns", () => {
    expect(CARD_STYLES).toMatch(/\.team-col\s*\{[^}]*min-width:\s*60px/);
  });

  it("wires logo width to the --ttsc-logo-width custom property", () => {
    expect(CARD_STYLES).toContain("width: var(--ttsc-logo-width, 30px)");
  });

  it("gives the logo cell and the logo image the same 30px fallback", () => {
    // both `.logo` and `.logo img` fall back to the same width — a mismatch here
    // leaves the image narrower than its cell when no layout.logo_width is set
    expect(CARD_STYLES).toMatch(/\.logo\s*\{[^}]*[^-]width:\s*var\(--ttsc-logo-width, 30px\)/);
    expect(CARD_STYLES).toMatch(/\.logo img\s*\{[^}]*[^-]width:\s*var\(--ttsc-logo-width, 30px\)/);
  });

  it("disables the score-fresh blink animation under prefers-reduced-motion", () => {
    expect(CARD_STYLES).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.score-fresh\s*\{\s*animation:\s*none;/
    );
  });

  it("wires score width to the --ttsc-score-width custom property", () => {
    expect(CARD_STYLES).toContain("width: var(--ttsc-score-width, 34px)");
  });

  it("wires colon width to the --ttsc-colon-width custom property", () => {
    expect(CARD_STYLES).toContain("width: var(--ttsc-colon-width, 9px)");
  });

  it("wires row height to the --ttsc-row-height custom property", () => {
    expect(CARD_STYLES).toContain("height: var(--ttsc-row-height, 28px)");
  });

  it("wraps the .score font-size in the --ttsc-font-scale custom property", () => {
    expect(CARD_STYLES).toContain("font-size: calc(20px * var(--ttsc-font-scale, 1))");
  });

  it("pads every game row by the --ttsc-row-padding custom property (above and below)", () => {
    expect(CARD_STYLES).toContain("padding: var(--ttsc-row-padding, 5px) 0;");
  });

  it("paints the whole slide control group orange while paused", () => {
    expect(CARD_STYLES).toContain(".slide-ctrls.paused .slide-btn {");
    expect(CARD_STYLES).toContain("color: orange;");
  });

  it("makes the carousel header a flex row", () => {
    expect(CARD_STYLES).toContain(".section-header.has-controls {");
  });
});

// ─── rowHtml structural snapshots ────────────────────────────────────────────

describe("rowHtml structural snapshots", () => {
  for (const state of ["PRE", "IN", "POST", "BYE"]) {
    it(`renders ${state} markup`, () => {
      expect(snap(rowHtml(makeState(state, baseAttrs), false))).toMatchSnapshot();
    });
  }

  it("renders with showLogos enabled", () => {
    expect(snap(rowHtml(makeState("IN", baseAttrs), true))).toMatchSnapshot();
  });

  it("renders IN with fresh score", () => {
    expect(snap(rowHtml(makeState("IN", baseAttrs), false, {}, false, true))).toMatchSnapshot();
  });
});

// ─── widget structural snapshots ─────────────────────────────────────────────

describe("widget structural snapshots", () => {
  it("logoHtml", () => expect(snap(logoHtml("home", homeAttr))).toMatchSnapshot());

  it("tvHtml PRE single", () =>
    expect(snap(tvHtml("PRE", { tv_network: "ESPN" }))).toMatchSnapshot());
  it("tvHtml IN", () => expect(snap(tvHtml("IN", { tv_network: "ESPN" }))).toMatchSnapshot());
  it("tvHtml multi-network", () =>
    expect(snap(tvHtml("PRE", { tv_network: "ESPN/ESPN2/TNT" }))).toMatchSnapshot());

  it("messageHtml PRE with sub", () =>
    expect(
      snap(messageHtml("PRE", { kickoff_in: "2h", location: "Houston, TX", odds: "LAL -3.5" }))
    ).toMatchSnapshot());
  it("messageHtml IN short", () =>
    expect(
      snap(messageHtml("IN", { clock: "Q3 5:00", last_play: "Touchdown - LAL" }))
    ).toMatchSnapshot());
  it("messageHtml IN truncated", () =>
    expect(
      snap(messageHtml("IN", { clock: "Q3 5:00", last_play: "A".repeat(60) }))
    ).toMatchSnapshot());
  it("messageHtml BYE", () => expect(snap(messageHtml("BYE", {}))).toMatchSnapshot());
  it("messageHtml POST", () =>
    expect(
      snap(messageHtml("POST", { clock: "Final", series_summary: "LAL leads 2-1" }))
    ).toMatchSnapshot());
});
