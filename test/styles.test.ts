import { describe, expect, it } from "vitest";
import { rowHtml } from "../src/render.js";
import type { GameAttr } from "../src/types.js";
import { doc } from "./helpers.js";

// ─── rowHtml inline styles ────────────────────────────────────────────────────

const makeState = (state: string, attrs: GameAttr) => ({ state, attributes: attrs });

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
};

describe("rowHtml inline styles — score background", () => {
  it("uses dark background in PRE state", () => {
    expect(doc(rowHtml(makeState("PRE", baseAttrs), false)).innerHTML).toContain(
      "background:#303030"
    );
  });
  it("uses lightgray background in IN state", () => {
    expect(doc(rowHtml(makeState("IN", baseAttrs), false)).innerHTML).toContain(
      "background:lightgray"
    );
  });
  it("uses transparent background in POST state", () => {
    expect(doc(rowHtml(makeState("POST", baseAttrs), false)).innerHTML).toContain(
      "background:transparent"
    );
  });
});

describe("rowHtml inline styles — score text color", () => {
  it("uses black for both scores in PRE state", () => {
    const html = doc(rowHtml(makeState("PRE", baseAttrs), false)).innerHTML;
    expect(html.match(/color:black/g)?.length).toBeGreaterThanOrEqual(2);
  });
  it("highlights the leading team in IN state", () => {
    const html = doc(rowHtml(makeState("IN", baseAttrs), false)).innerHTML;
    expect(html).toContain("color:var(--ttsc-leading-color, brown)");
    expect(html).toContain("color:black");
  });
  it("marks winner and loser colours in POST state", () => {
    const html = doc(rowHtml(makeState("POST", baseAttrs), false)).innerHTML;
    expect(html).toContain("color:var(--ttsc-winner-color, orange)");
    expect(html).toContain("color:var(--ttsc-loser-color, darkgray)");
  });
});

describe("rowHtml inline styles — team name font-weight", () => {
  it("uses normal weight for both team names", () => {
    const html = doc(rowHtml(makeState("PRE", baseAttrs), false)).innerHTML;
    expect(html.match(/font-weight:normal/g)?.length).toBe(2);
  });
});

describe("rowHtml inline styles — colon visibility", () => {
  it("hides the colon for BYE and other non-game states", () => {
    expect(doc(rowHtml(makeState("BYE", baseAttrs), false)).innerHTML).toContain(
      "color:transparent"
    );
  });
  it("shows a black colon in PRE state", () => {
    expect(doc(rowHtml(makeState("PRE", baseAttrs), false)).innerHTML).toContain("color:black");
  });
});
