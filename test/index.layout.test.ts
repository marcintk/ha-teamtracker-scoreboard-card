import { describe, expect, it } from "vitest";
import type { CardConfig } from "../src/types.js";
import { haCardStyle } from "./helpers.js";
import { baseAttrs, makeCard, makeHass, makeState, nbaSection } from "./index.fixtures.js";

describe("SportScoreboardCard layout options", () => {
  describe("layout: map", () => {
    const cases = [
      { key: "team_width", prop: "--ttsc-team-col-a-width", value: "120px" },
      { key: "logo_width", prop: "--ttsc-logo-width", value: "44px" },
      { key: "score_width", prop: "--ttsc-score-width", value: "50px" },
      { key: "colon_width", prop: "--ttsc-colon-width", value: "12px" },
      { key: "row_height", prop: "--ttsc-row-height", value: "40px" },
      { key: "row_padding", prop: "--ttsc-row-padding", value: "6px" },
    ] as const;

    for (const { key, prop, value } of cases) {
      it(`emits ${prop} from layout.${key}`, () => {
        const card = makeCard();
        card._config = { sections: [nbaSection], layout: { [key]: value } };
        card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
        card._render();
        expect(haCardStyle(card)).toContain(`${prop}:${value}`);
      });
    }

    it("layout.team_width sets both team columns", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], layout: { team_width: "120px" } };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(haCardStyle(card)).toContain("--ttsc-team-col-a-width:120px");
      expect(haCardStyle(card)).toContain("--ttsc-team-col-b-width:120px");
    });

    it("layout.font_scale emits --ttsc-font-scale", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], layout: { font_scale: 1.15 } };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(haCardStyle(card)).toContain("--ttsc-font-scale:1.15");
    });

    it("layout.height sets the ha-card height and drives getCardSize", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], layout: { height: "600px" } };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(haCardStyle(card)).toContain("height:600px;");
      expect(card.getCardSize()).toBe(12);
    });

    it("ignores a flat top-level key entirely when there is no layout map at all", () => {
      const card = makeCard();
      card._config = {
        sections: [nbaSection],
        team_width: "120px",
      } as unknown as CardConfig;
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      const style = haCardStyle(card);
      expect(style).not.toContain("--ttsc-team-col-a-width:120px");
      expect(style).not.toContain("--ttsc-team-col-b-width:120px");
    });
  });
});
