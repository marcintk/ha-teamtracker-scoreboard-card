# ha-teamtracker-scoreboard-card

A Home Assistant custom card that renders one or more scoreboard sections from `ha-teamtracker`
sensor entities.

## Language

**Section**: A named group of games on the card, resolved from config by an entity-id prefix, an
explicit entity list, or both (union, not either/or). _Avoid_: group, panel, block

**Tracked id**: An entity id the card is currently watching because it matches at least one section.
The same id can be tracked by more than one section at once. _Avoid_: matched id, subscribed entity

**Special team**: An entity id within a section that a config author has flagged for the
special-team highlight color, listed either as the full entity id or as the suffix left after
stripping the section's own prefix. _Avoid_: favorite, starred team

**Blink window**: The period after a live game's score changes during which that side's score is
shown with the fresh/blink visual treatment. Its length comes from the longest `score_blink` among
every section the id is tracked by. _Avoid_: flash duration, highlight window
