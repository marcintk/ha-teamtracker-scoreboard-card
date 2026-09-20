import { describe, expect, it } from "vitest";
import type { GameAttr } from "../src/types.js";
import { logoHtml, messageHtml, tvHtml } from "../src/widgets.js";
import { doc } from "./helpers.js";

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

describe("logoHtml", () => {
  it("returns img tag for valid https logo URL", () => {
    const el = doc(logoHtml("home", homeAttr));
    expect(el.querySelector("img")).not.toBeNull();
    expect(el.querySelector("img")?.getAttribute("src")).toBe("https://cdn.example.com/lal.png");
  });

  it("rejects non-https logo URLs", () => {
    const attr = { ...homeAttr, team_logo: "http://insecure.example.com/logo.png" };
    expect(doc(logoHtml("home", attr)).querySelector("img")).toBeNull();
  });
});

describe("tvHtml", () => {
  it("returns empty for POST state", () => {
    expect(doc(tvHtml("POST", { tv_network: "ESPN" })).querySelector(".tv-badge")).toBeNull();
  });

  it("returns empty when tv_network is blank", () => {
    expect(doc(tvHtml("IN", { tv_network: "" })).querySelector(".tv-badge")).toBeNull();
    expect(doc(tvHtml("IN", { tv_network: "   " })).querySelector(".tv-badge")).toBeNull();
  });

  it("returns red badge for IN state", () => {
    const el = doc(tvHtml("IN", { tv_network: "ESPN" }));
    expect(el.querySelector(".tv-badge")?.textContent).toContain("ESP");
    expect(el.querySelector(".tv-badge")?.getAttribute("style")).toContain("indianred");
  });

  it("uses config live color for IN TV badge", () => {
    const el = doc(tvHtml("IN", { tv_network: "ESPN" }, { live: "steelblue" }));
    expect(el.querySelector(".tv-badge")?.getAttribute("style")).toContain("steelblue");
  });

  it("returns gray badge for PRE state", () => {
    const el = doc(tvHtml("PRE", { tv_network: "TNT" }));
    expect(el.querySelector(".tv-badge")?.textContent).toContain("TNT");
    expect(el.querySelector(".tv-badge")?.getAttribute("style")).toContain("#666");
  });

  it("truncates long network names to 3 chars with > suffix", () => {
    const el = doc(tvHtml("PRE", { tv_network: "VERY_LONG_CHANNEL_NAME" }));
    expect(el.querySelector(".tv-badge")?.textContent).toBe("VER>");
    expect(el.textContent).not.toContain("VERY_LONG_CHANNEL_NAME");
  });

  it("shows > suffix for single network name longer than 3 chars", () => {
    const el = doc(tvHtml("PRE", { tv_network: "ESPN" }));
    expect(el.querySelector(".tv-badge")?.textContent).toBe("ESP>");
  });

  it("shows no suffix for short network name (3 chars or fewer)", () => {
    const el = doc(tvHtml("PRE", { tv_network: "TNT" }));
    expect(el.querySelector(".tv-badge")?.textContent).toBe("TNT");
  });

  it("truncates long network names to a configurable char count with > suffix", () => {
    const el = doc(tvHtml("PRE", { tv_network: "VERY_LONG_CHANNEL_NAME" }, {}, 4));
    expect(el.querySelector(".tv-badge")?.textContent).toBe("VERY>");
  });

  it("shows no suffix for a network name exactly matching the configured char count", () => {
    const el = doc(tvHtml("PRE", { tv_network: "ESPN" }, {}, 4));
    expect(el.querySelector(".tv-badge")?.textContent).toBe("ESPN");
  });

  it("hides the badge entirely when chars is 0, even with a valid network and live state", () => {
    const el = doc(tvHtml("IN", { tv_network: "ESPN" }, {}, 0));
    expect(el.querySelector(".tv-badge")).toBeNull();
  });

  it("handles multi-network with slash", () => {
    const el = doc(tvHtml("PRE", { tv_network: "ESPN/ESPN2" }));
    expect(el.querySelector(".tv-badge")?.textContent).toContain(">");
  });

  it("wraps multi-network badge in tooltip element", () => {
    const el = doc(tvHtml("PRE", { tv_network: "ESPN/ESPN2" }));
    expect(el.querySelector(".tv-tooltip")).not.toBeNull();
    expect(el.querySelector(".tv-tooltip")?.hasAttribute("data-tooltip")).toBe(true);
  });

  it("tooltip contains all networks separated by ·", () => {
    const el = doc(tvHtml("PRE", { tv_network: "ESPN/ESPN2/TNT" }));
    expect(el.querySelector(".tv-tooltip")?.getAttribute("data-tooltip")).toBe(
      "ESPN · ESPN2 · TNT"
    );
  });

  it("trims whitespace around network names in tooltip", () => {
    const el = doc(tvHtml("PRE", { tv_network: "ESPN / ESPN2" }));
    expect(el.querySelector(".tv-tooltip")?.getAttribute("data-tooltip")).toBe("ESPN · ESPN2");
  });

  it("does not wrap single network in tooltip element", () => {
    const el = doc(tvHtml("PRE", { tv_network: "ESPN" }));
    expect(el.querySelector(".tv-tooltip")).toBeNull();
  });
});

describe("messageHtml", () => {
  it("shows kickoff and odds for PRE when no location", () => {
    const el = doc(messageHtml("PRE", { kickoff_in: "2h", odds: "LAL -3.5" }));
    expect(el.textContent).toContain("2h");
    expect(el.textContent).toContain("LAL -3.5");
  });

  it("shows only kickoff for PRE when no odds or location", () => {
    const el = doc(messageHtml("PRE", { kickoff_in: "Tomorrow" }));
    expect(el.textContent).toContain("Tomorrow");
    expect(el.querySelector(".msg-sub")).toBeNull();
  });

  it("shows city and odds as sub for PRE when both location and odds present", () => {
    const el = doc(
      messageHtml("PRE", { kickoff_in: "2h", location: "Houston, Texas, USA", odds: "LAL -3.5" })
    );
    expect(el.querySelector(".msg-sub")?.textContent).toBe("Houston, LAL -3.5");
  });

  it("extracts only city (text before first comma) from full location string", () => {
    const el = doc(messageHtml("PRE", { location: "San Antonio, TX", odds: "HOU -7" }));
    expect(el.querySelector(".msg-sub")?.textContent).toContain("San Antonio, HOU -7");
    expect(el.textContent).not.toContain("Texas");
  });

  it("shows only city in sub for PRE when odds is absent", () => {
    const el = doc(messageHtml("PRE", { location: "Dallas, Texas, USA" }));
    expect(el.querySelector(".msg-sub")).not.toBeNull();
    expect(el.querySelector(".msg-sub")?.textContent).toBe("Dallas");
  });

  it("shows only odds in sub for PRE when location is absent", () => {
    const el = doc(messageHtml("PRE", { odds: "BOS -2" }));
    expect(el.querySelector(".msg-sub")).not.toBeNull();
    expect(el.querySelector(".msg-sub")?.textContent).toBe("BOS -2");
  });

  it("does not inject raw HTML in location city and odds", () => {
    const el = doc(messageHtml("PRE", { location: "<city>, State", odds: "<b>odds</b>" }));
    expect(el.querySelector("city")).toBeNull();
    expect(el.querySelector("b")).toBeNull();
    expect(el.textContent).toContain("<city>");
  });

  it("shows clock and last_play for IN", () => {
    const el = doc(messageHtml("IN", { clock: "Q3 5:00", last_play: "Touchdown - LAL" }));
    expect(el.textContent).toContain("Q3 5:00");
    expect(el.textContent).toContain("Touchdown - LAL");
    expect(el.querySelector(".tv-tooltip")).toBeNull();
  });

  it("omits last_play span when last_play is absent", () => {
    const el = doc(messageHtml("IN", { clock: "Q3 5:00" }));
    expect(el.textContent).toContain("Q3 5:00");
    expect(el.querySelector(".msg-sub")).toBeNull();
  });

  it("truncates last_play longer than 50 chars and adds > with tooltip", () => {
    const long = "A".repeat(51);
    const el = doc(messageHtml("IN", { clock: "Q3 5:00", last_play: long }));
    expect(el.querySelector(".msg-sub")?.textContent).toBe(`${"A".repeat(50)}>`);
    expect(el.querySelector(".tv-tooltip")).not.toBeNull();
    expect(el.querySelector(".tv-tooltip")?.getAttribute("data-tooltip")).toBe(long);
  });

  it("inserts newlines before soccer minute markers in long last_play tooltip", () => {
    const plays = "GER 66.9%, CUW 33.1%; 6' Goal: Nmecha 21' Goal: Other Player";
    const el = doc(messageHtml("IN", { clock: "90'", last_play: plays }));
    expect(el.querySelector(".tv-tooltip")).not.toBeNull();
    const tooltip = el.querySelector(".tv-tooltip")?.getAttribute("data-tooltip") ?? "";
    expect(tooltip).toContain(";\n6'");
    expect(tooltip).toContain("\n21'");
  });

  it("inserts newlines before injury-time minute markers in tooltip", () => {
    const plays = "GER 1-0 CUW; 45'+5' Penalty - Scored: Havertz 90'+3' Goal: Musiala";
    const el = doc(messageHtml("IN", { clock: "90'+3'", last_play: plays }));
    const tooltip = el.querySelector(".tv-tooltip")?.getAttribute("data-tooltip") ?? "";
    expect(tooltip).toContain(";\n45'+5'");
    expect(tooltip).toContain("\n90'+3'");
  });

  it("does not truncate last_play of exactly 50 chars", () => {
    const exact = "B".repeat(50);
    const el = doc(messageHtml("IN", { clock: "Q2 1:00", last_play: exact }));
    expect(el.textContent).toContain(exact);
    expect(el.querySelector(".tv-tooltip")).toBeNull();
    expect(el.querySelector(".msg-sub")?.textContent).toBe(exact);
  });

  it("shows clock and series summary for POST", () => {
    const el = doc(messageHtml("POST", { clock: "Final", series_summary: "LAL leads 3-2" }));
    expect(el.textContent).toContain("Final");
    expect(el.textContent).toContain("LAL leads 3-2");
  });

  it("shows only clock for POST when no series summary", () => {
    const el = doc(messageHtml("POST", { clock: "Final" }));
    expect(el.textContent).toContain("Final");
    expect(el.querySelector(".msg-sub")).toBeNull();
  });

  it("handles missing clock in POST state", () => {
    const el = doc(messageHtml("POST", {}));
    expect(el.querySelector("span")?.getAttribute("style")).toContain("orange");
  });

  it("uses config live color for IN clock", () => {
    const el = doc(
      messageHtml("IN", { clock: "Q1 10:00", team_win_probability: null }, { live: "teal" })
    );
    expect(el.querySelector("span")?.getAttribute("style")).toContain("teal");
  });

  it("uses config winner color for POST clock", () => {
    const el = doc(messageHtml("POST", { clock: "Final" }, { score_winner: "gold" }));
    expect(el.querySelector("span")?.getAttribute("style")).toContain("gold");
  });

  it("renders a bye label for BYE state", () => {
    const el = doc(messageHtml("BYE", {}));
    expect(el.textContent?.trim().toLowerCase()).toContain("bye");
  });

  it("does not render orange clock/series for BYE state", () => {
    const el = doc(messageHtml("BYE", { clock: "", series_summary: "" }));
    // BYE should not fall through to the POST branch's orange clock span
    expect(el.querySelector("span")?.getAttribute("style") ?? "").not.toContain("orange");
  });
});
