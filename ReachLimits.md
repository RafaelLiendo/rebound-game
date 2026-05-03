# Player Reach Limits

This guide summarizes the current measured player reach limits for level
design. The source of truth is `smoke-test.js`; run `node .\smoke-test.js` and
check the `PLAYER LIMITS` output after tuning movement, rebound, permeation, or
ceiling-hang behavior.

All gap numbers are measured as empty tile gaps between standable block edges,
matching the authored-level reachability audit. One tile is 32 px. The player is
24 px wide and 40 px tall, so some one-tile vertical spaces are physically too
tight even when they look close in the map.

## Vertical Reach

Normal jump peak:

| Move | Peak rise |
| --- | ---: |
| Full jump | 2.00 tiles |

Rebound height is measured from the planned top exit of the mass, not from the
release depth. Manual release and Ctrl+Shift assist use the same target.

| Solid mass height | Center-depth rebound | Bottom rebound |
| ---: | ---: | ---: |
| 1 tile | 1.21 tiles | 2.00 tiles |
| 2 tiles | 2.00 tiles | 4.00 tiles |
| 3 tiles | 2.91 tiles | 7.00 tiles |
| 4 tiles | 4.00 tiles | 12.00 tiles |
| 5 tiles | 5.33 tiles | 21.00 tiles |

Rebounds deeper than 5 tile rows are capped at the 5-row target: 21.00 tiles.

## Permeation Entry

These are the minimum fall heights needed to punch through a static solid mass
while holding permeate, instead of being dragged back toward the mass center.

| Solid mass height | Minimum fall-through height |
| ---: | ---: |
| 1 tile | 2.00 tiles |
| 2 tiles | 4.00 tiles |
| 3 tiles | 5.00 tiles |
| 4 tiles | 5.00 tiles |
| 5 tiles | 5.00 tiles |

Free fall reaches max speed after 5.00 tiles. At max fall speed, pass-through
works through up to 5 tile rows.

## Horizontal Gaps

The raw gap is the measured limit. The safe authored gap is
`floor(raw - 0.10)`, giving a small buffer for human play and map readability.
These measurements assume committed horizontal input and the same max-speed
model used by the reachability audit.

Normal jump horizontal gaps:

| Target ledge rise | Raw empty gap | Safe authored gap |
| ---: | ---: | ---: |
| 0 tiles | 5.59 tiles | 5 tiles |
| 1 tile | 4.97 tiles | 4 tiles |
| 2 tiles | 3.41 tiles | 3 tiles |

Bottom rebound horizontal gaps at the full target rise, using the 1.5x rebound
horizontal boost:

| Solid mass height | Target rise | Raw empty gap | Safe authored gap |
| ---: | ---: | ---: | ---: |
| 1 tile | 2.00 tiles | 4.73 tiles | 4 tiles |
| 2 tiles | 4.00 tiles | 6.14 tiles | 6 tiles |
| 3 tiles | 7.00 tiles | 7.78 tiles | 7 tiles |
| 4 tiles | 12.00 tiles | 9.89 tiles | 9 tiles |
| 5 tiles | 21.00 tiles | 12.70 tiles | 12 tiles |

## Ceiling Hang Gaps

Ceiling-hang gaps are vertical empty rows between a floor and the bottom of a
ceiling block. The measured setup is a grounded full jump, then holding
permeate during ascent to catch the ceiling with the upper body only.

| Empty vertical gap | Result | Design note |
| ---: | --- | --- |
| 1 row | Too tight | The player overlaps too deeply for a clean top-half hang. |
| 2 rows | Reachable | Clean normal-jump ceiling hang, then Space can pull inward. |
| 3 rows | Reachable | Higher but still reachable by normal jump into hang. |
| 4 rows | Too high | Beyond normal jump hang reach. |
| 5 rows | Too high | Beyond normal jump hang reach. |

Use 2-3 empty rows when a route expects a normal jump into ceiling hang. Use 4+
rows when the player should need rebound, moving matter, or another route.
