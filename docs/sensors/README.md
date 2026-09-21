# Ready-made ha-teamtracker sensor configs

Each file in this folder is a **complete `sensor:` block** (a top-level `sensor:` key with the team
list under it) for one league, ready to drop into Home Assistant.

Install [ha-teamtracker](https://github.com/vasqued2/ha-teamtracker) via HACS first. Each sensor
entry creates one entity; its `name` becomes the entity ID (`name: nba_bos` → `sensor.nba_bos`), and
the card's `prefix` field groups every sensor sharing a common prefix (`sensor.nba_`).

> [!WARNING]
>
> Each file loads a **full league roster (20–32 sensors)**. It'll work as-is, but loading everything
> means that many `sensor.teamtracker` entities each polling ESPN on its own schedule — real
> startup/update load for teams you'll never track. Treat these files as a **source to copy teams
> from**, not a config to enable wholesale: copy the file, then delete every team you don't follow
> before restarting. Most setups only need a handful of entities across one or two leagues.

## League files

All rosters were verified against ESPN in **September 2026** and reflect the **2026/27 season**
(2026 season for NFL).

| League                             | `league_id` | File                   | Sensors                              |
| ---------------------------------- | ----------- | ---------------------- | ------------------------------------ |
| NBA                                | `NBA`       | [nba.yaml](nba.yaml)   | All 30 teams, grouped by division    |
| NHL                                | `NHL`       | [nhl.yaml](nhl.yaml)   | All 32 teams, grouped by division    |
| NFL                                | `NFL`       | [nfl.yaml](nfl.yaml)   | All 32 teams, grouped by division    |
| Premier League (England)           | `EPL`       | [epl.yaml](epl.yaml)   | All 20 clubs (numeric ESPN team IDs) |
| La Liga / Primera División (Spain) | `LIGA`      | [liga.yaml](liga.yaml) | All 20 clubs (numeric ESPN team IDs) |
| Serie A (Italy)                    | `SERA`      | [sera.yaml](sera.yaml) | All 20 clubs (numeric ESPN team IDs) |

For the three soccer leagues the `team_id` is the **numeric ESPN team ID** rather than an
abbreviation — ha-teamtracker recommends this for soccer, where abbreviations are inconsistent
across competitions. Each entry carries a trailing `# comment` naming the club. Promotion and
relegation change the club list every season, so re-check those files against ESPN each August.

## Loading the sensors

Add the leagues you want as Home Assistant **packages** — one file per league:

```yaml
# configuration.yaml
homeassistant:
  packages: !include_dir_named packages/
```

Start with one league and trim it down: copy just that file into `<config>/packages/` and delete
every team you don't follow before restarting — don't drop the whole file in as-is:

```
config/
  configuration.yaml
  packages/
    nba.yaml
    nhl.yaml
    epl.yaml
```

Then **restart Home Assistant** (or use _Developer Tools → YAML → Check and Restart_).

You can also skip the files entirely and add `- platform: teamtracker` sensors by hand directly
under `sensor:` in `configuration.yaml`.

## Card config notes

- A section renders the schedule (date-sorted, live games first). See "Schedule" in the main README.
- `special_teams` takes the suffix **after** the prefix — e.g. `juv` for `sensor.sera_juv`, not the
  ESPN id.
