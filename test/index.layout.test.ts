import { describe, expect, it } from "vitest";
import { haCardStyle } from "./helpers.js";
import { baseAttrs, makeCard, makeHass, makeState, nbaSection } from "./index.fixtures.js";

describe("SportScoreboardCard layout options", () => {
  describe("team_col_width", () => {
    it("team_col_width alias sets both sides", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], team_col_width: "130px" };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(haCardStyle(card)).toContain("--ttsc-team-col-a-width:130px");
      expect(haCardStyle(card)).toContain("--ttsc-team-col-b-width:130px");
    });

    it("does not emit --ttsc-team-col-a/b-width when omitted", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(haCardStyle(card)).not.toContain("--ttsc-team-col-a-width");
      expect(haCardStyle(card)).not.toContain("--ttsc-team-col-b-width");
    });
  });

  describe("team_width", () => {
    it("string value sets both sides", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], team_width: "120px" };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(haCardStyle(card)).toContain("--ttsc-team-col-a-width:120px");
      expect(haCardStyle(card)).toContain("--ttsc-team-col-b-width:120px");
    });

    it("team_width wins over team_col_width when both are set", () => {
      const card = makeCard();
      card._config = {
        sections: [nbaSection],
        team_width: "120px",
        team_col_width: "200px",
      };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(haCardStyle(card)).toContain("--ttsc-team-col-a-width:120px");
      expect(haCardStyle(card)).toContain("--ttsc-team-col-b-width:120px");
      expect(haCardStyle(card)).not.toContain("200px");
    });

    it("emits no team column width properties when neither option is set", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      const style = haCardStyle(card);
      expect(style).not.toContain("--ttsc-team-col-a-width");
      expect(style).not.toContain("--ttsc-team-col-b-width");
      expect(style).not.toContain("--ttsc-team-col-width");
    });
  });

  describe("layout dimension options", () => {
    const cases = [
      { option: "logo_width", prop: "--ttsc-logo-width", value: "44px" },
      { option: "score_width", prop: "--ttsc-score-width", value: "50px" },
      { option: "colon_width", prop: "--ttsc-colon-width", value: "12px" },
      { option: "row_height", prop: "--ttsc-row-height", value: "40px" },
    ] as const;

    for (const { option, prop, value } of cases) {
      it(`emits ${prop} on ha-card when ${option} is configured`, () => {
        const card = makeCard();
        card._config = { sections: [nbaSection], [option]: value };
        card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
        card._render();
        expect(haCardStyle(card)).toContain(`${prop}:${value}`);
      });

      it(`does not emit ${prop} when ${option} is omitted`, () => {
        const card = makeCard();
        card._config = { sections: [nbaSection] };
        card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
        card._render();
        expect(haCardStyle(card)).not.toContain(prop);
      });
    }
  });

  describe("font_scale", () => {
    it("emits --ttsc-font-scale:1.15 when font_scale is 1.15", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], font_scale: 1.15 };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(haCardStyle(card)).toContain("--ttsc-font-scale:1.15");
    });

    it("does not emit --ttsc-font-scale when font_scale is omitted", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(haCardStyle(card)).not.toContain("--ttsc-font-scale");
    });

    it("does not emit --ttsc-font-scale when font_scale is 1", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection], font_scale: 1 };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(haCardStyle(card)).not.toContain("--ttsc-font-scale");
    });
  });

  describe("layout: map", () => {
    const cases = [
      { key: "team_width", prop: "--ttsc-team-col-a-width", value: "120px" },
      { key: "logo_width", prop: "--ttsc-logo-width", value: "44px" },
      { key: "score_width", prop: "--ttsc-score-width", value: "50px" },
      { key: "colon_width", prop: "--ttsc-colon-width", value: "12px" },
      { key: "row_height", prop: "--ttsc-row-height", value: "40px" },
      { key: "row_padding", prop: "--ttsc-row-padding", value: "6px" },
      { key: "position_width", prop: "--ttsc-position-width", value: "32px" },
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

    it("does not emit --ttsc-position-width when layout.position_width is omitted", () => {
      const card = makeCard();
      card._config = { sections: [nbaSection] };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(haCardStyle(card)).not.toContain("--ttsc-position-width");
    });

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

    it("layout.* wins over the deprecated flat key when both are set", () => {
      const card = makeCard();
      card._config = {
        sections: [nbaSection],
        row_height: "40px",
        team_col_width: "200px",
        layout: { row_height: "60px", team_width: "120px" },
      };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      const style = haCardStyle(card);
      expect(style).toContain("--ttsc-row-height:60px");
      expect(style).toContain("--ttsc-team-col-a-width:120px");
      expect(style).not.toContain("40px");
      expect(style).not.toContain("200px");
    });

    it("falls back to a flat key the layout map omits", () => {
      const card = makeCard();
      card._config = {
        sections: [nbaSection],
        row_height: "40px",
        layout: { team_width: "120px" },
      };
      card._hass = makeHass({ "sensor.nba_lal": makeState("PRE", baseAttrs) });
      card._render();
      expect(haCardStyle(card)).toContain("--ttsc-row-height:40px");
    });
  });
});
