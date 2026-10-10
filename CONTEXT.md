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

**Blink window**: The fixed 1-second period after a live game's score changes during which that side
shows its previous score with the blink treatment, before the new score is revealed. Blinking is on
unless every section the id is tracked by sets `score_blink: false`. _Avoid_: flash duration,
highlight window
