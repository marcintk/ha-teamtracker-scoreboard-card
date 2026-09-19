# TeamTracker Scoreboard Card

[![TeamTracker Scoreboard Card][demo-img]][repo]

Home Assistant custom Lovelace card displaying live scores, pre-game odds, win probability, TV
network, and series info — one row per game.

Bug or feature request? [Open an issue][new-issue]. Idea, question, or setup to share? [Start a
discussion][discussions].

[![hacs_badge][hacs-shield]][hacs] [![GitHub Release][releases-shield]][releases]
[![License][license-shield]][license] ![Maintenance][maintenance-shield]
[![Coverage][coverage-shield]][ci] [![Downloads][downloads-shield]][releases]

[![CI][ci-shield]][ci] [![CodeQL][codeql-shield]][codeql]
[![OpenSSF Scorecard][scorecard-shield]][scorecard] [![Socket.dev][socket-shield]][socket]

## Requirements

Requires [ha-teamtracker](https://github.com/vasqued2/ha-teamtracker) (HACS Integration) — it
provides the `sensor.<sport>_<team>` entities this card reads.

To help with setup, [`docs/sensors/`][sensors] has example sensor definitions for several leagues
(NBA, NHL, NFL, Premier League, La Liga, Serie A) you can use as a starting point for your own.

## Installation

### Via HACS (recommended)

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=marcintk&repository=ha-teamtracker-scoreboard-card&category=plugin)

Click the badge to open this card in your own HACS, or find it manually: HACS → Frontend → search
**TeamTracker Scoreboard Card**. Then Install, reload your browser, and add the card to your
dashboard (see Configuration below).

### Manual

Drop `card.js` from the
[latest release](https://github.com/marcintk/ha-teamtracker-scoreboard-card/releases/latest) into
`<config>/www/ha-teamtracker-scoreboard-card/`, then register
`/local/ha-teamtracker-scoreboard-card/card.js` as a **JavaScript Module** under Settings →
Dashboards → Resources.

## Usage

Add a **Manual card** to your dashboard and paste:

```yaml
type: custom:ha-teamtracker-scoreboard-card
sections:
  - name: Serie A
    prefix: sensor.sera_
    special_teams:
      - juv
  - name: Primera Division
    prefix: sensor.liga_
    limit: 5
  - name: NBA Scoreboard
    prefix: sensor.nba_
    limit: 5
```

## Schedule

A section renders one row per game: live games first, then every other game by nearness to now, so
the next kick-off and the just-finished game sit near the top; the two sensors for a game are merged
into one row.

## Configuration

### Card

| Option         | Type    | Default  | Description                                                                                                                                |
| -------------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `sections`     | list    | required | One entry per league — see [Section](#section)                                                                                             |
| `layout`       | map     | —        | Size / spacing / text-scale knobs — see [Layout](#layout)                                                                                  |
| `colors`       | map     | —        | Team colour overrides — see [Colors](#colors)                                                                                              |
| `mode`         | string  | `stack`  | `stack` shows every section; `slide` shows one at a time (needs ≥ 2 sections), auto-advancing with `‹` / stop-resume / `›` header controls |
| `slide_sec`    | number  | `45`     | Seconds per section while `mode: slide`                                                                                                    |
| `debug`        | boolean | `false`  | Pin a live-refresh overlay — **events** / **filtered** / **rendered** counters over 1m–3h windows, every 1s                                |
| `show_version` | boolean | `false`  | Show the card version badge, centred at the top                                                                                            |

### Refresh

The card subscribes to Home Assistant state changes and re-renders when a tracked sensor updates.

| Option          | Type   | Default | Description                                                                    |
| --------------- | ------ | ------- | ------------------------------------------------------------------------------ |
| `lazy_refresh`  | number | `5`     | Throttle delay (seconds) before rendering after an event; `0` = render at once |
| `fixed_refresh` | number | `60`    | Re-render every N seconds regardless of events; `0` = disabled                 |

### Section

```yaml
type: custom:ha-teamtracker-scoreboard-card
sections:
  - name: Premier League
    prefix: sensor.epl_
    limit: 12
    score_blink: 5
    special_teams:
      - liv
  - ...
```

| Field                   | Type   | Default  | Description                                                                             |
| ----------------------- | ------ | -------- | --------------------------------------------------------------------------------------- |
| `section.name`          | string | required | Header label shown above the section                                                    |
| `section.prefix`        | string | required | Entity ID prefix, e.g. `sensor.nba_`                                                    |
| `section.limit`         | number | `10`     | Max rows to show                                                                        |
| `section.score_blink`   | number | `5`      | Seconds to blink the score after a goal/basket; `0` disables                            |
| `section.special_teams` | list   | `[]`     | Team suffixes to highlight — the part after the prefix, e.g. `bos` for `sensor.nba_bos` |

### Layout

```yaml
type: custom:ha-teamtracker-scoreboard-card
layout:
  height: 600px # fixed card box (else fits content)
  row_height: 34px # roomier rows; the logo scales with it
  logo_width: 40px
  score_width: 42px # room for 3-digit basketball totals
  team_width: 130px # widen both team-name columns
  row_padding: 8px # space above and below each game row (default 5px)
  font_scale: 1.15 # ~15% larger text throughout
sections:
  - ...
```

| Key                  | Type   | Default | CSS property                                          | Controls                                                                       |
| -------------------- | ------ | ------- | ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| `layout.height`      | string | auto    | — (plain `height` on `ha-card`)                       | Outer card height (any CSS length); omit to fit content                        |
| `layout.row_height`  | string | `28px`  | `--ttsc-row-height`                                   | `.game-row` height, the logo / score / colon cell heights, the logo image      |
| `layout.logo_width`  | string | `30px`  | `--ttsc-logo-width`                                   | Logo cell width and the logo image width (aspect ratio preserved)              |
| `layout.score_width` | string | `34px`  | `--ttsc-score-width`                                  | Score cell width — widen for 3-digit totals                                    |
| `layout.colon_width` | string | `9px`   | `--ttsc-colon-width`                                  | Centre colon cell width                                                        |
| `layout.team_width`  | string | `99px`  | `--ttsc-team-col-a-width` / `--ttsc-team-col-b-width` | Team-name column width; one CSS length applied to both sides                   |
| `layout.row_padding` | string | `5px`   | `--ttsc-row-padding`                                  | Padding above **and** below every game row (divider sits centred in the space) |
| `layout.font_scale`  | number | `1`     | `--ttsc-font-scale`                                   | Uniform multiplier over every text size; raise `layout.row_height` too         |

### Colors

```yaml
type: custom:ha-teamtracker-scoreboard-card
colors:
  team: white
  opponent: gray
  special: "#2196F3" # Material Blue
  header: "#2196F3" # Material Blue
  winner: orange
  loser: darkgray
  live: indianred
  leading: brown
sections:
  - ...
```

| Key               | Default                            | CSS property            | Applies to                                 |
| ----------------- | ---------------------------------- | ----------------------- | ------------------------------------------ |
| `colors.team`     | `var(--primary-text-color, white)` | `--ttsc-team-color`     | Your tracked team name                     |
| `colors.opponent` | `#‌777` (grey)                     | `--ttsc-opponent-color` | Opponent name                              |
| `colors.special`  | `#2196F3` (Material Blue)          | `--ttsc-special-color`  | `special_teams` highlight                  |
| `colors.header`   | `#2196F3` (Material Blue)          | `--ttsc-header-color`   | Section header label                       |
| `colors.winner`   | `orange`                           | `--ttsc-winner-color`   | POST winner score and final clock          |
| `colors.loser`    | `darkgray`                         | `--ttsc-loser-color`    | POST loser score                           |
| `colors.live`     | `indianred`                        | `--ttsc-live-color`     | IN game clock text and TV badge background |
| `colors.leading`  | `brown`                            | `--ttsc-leading-color`  | IN score for the currently leading team    |

<!-- Reference links -->

[repo]: https://github.com/marcintk/ha-teamtracker-scoreboard-card
[new-issue]: https://github.com/marcintk/ha-teamtracker-scoreboard-card/issues/new
[discussions]: https://github.com/marcintk/ha-teamtracker-scoreboard-card/discussions
[sensors]: https://github.com/marcintk/ha-teamtracker-scoreboard-card/tree/main/docs/sensors
[hacs]: https://hacs.xyz
[hacs-shield]: https://img.shields.io/badge/HACS-Default-41BDF5.svg
[releases]: https://github.com/marcintk/ha-teamtracker-scoreboard-card/releases
[releases-shield]: https://img.shields.io/github/release/marcintk/ha-teamtracker-scoreboard-card.svg
[license]: https://github.com/marcintk/ha-teamtracker-scoreboard-card/blob/main/LICENSE
[license-shield]: https://img.shields.io/github/license/marcintk/ha-teamtracker-scoreboard-card.svg
[maintenance-shield]: https://img.shields.io/maintenance/yes/2026
[ci]:
  https://github.com/marcintk/ha-teamtracker-scoreboard-card/actions/workflows/card-build-and-test.yml
[ci-shield]:
  https://github.com/marcintk/ha-teamtracker-scoreboard-card/actions/workflows/card-build-and-test.yml/badge.svg
[coverage-shield]: https://img.shields.io/badge/coverage-100%25-brightgreen
[downloads-shield]:
  https://img.shields.io/github/downloads/marcintk/ha-teamtracker-scoreboard-card/total?label=downloads
[codeql]: https://github.com/marcintk/ha-teamtracker-scoreboard-card/security/code-scanning
[codeql-shield]:
  https://img.shields.io/github/actions/workflow/status/marcintk/ha-teamtracker-scoreboard-card/codeql-analysis.yml?branch=main&label=CodeQL
[scorecard]:
  https://securityscorecards.dev/viewer/?uri=github.com/marcintk/ha-teamtracker-scoreboard-card
[scorecard-shield]:
  https://img.shields.io/ossf-scorecard/github.com/marcintk/ha-teamtracker-scoreboard-card?label=OpenSSF&style=flat
[socket]: https://github.com/marcintk/ha-teamtracker-scoreboard-card/blob/main/socket.yml
[socket-shield]: https://img.shields.io/badge/Socket.dev-Firewall%20%2B%20Scanning-fb3387.svg
[demo-img]:
  https://raw.githubusercontent.com/marcintk/ha-teamtracker-scoreboard-card/main/docs/demo.gif
