# trade-plan-chart Specification

## Purpose

Render a saved trade's compact visual plan as an expandable detail row under each trade in the trades list, reusing `riskPreviewSvg`/`tradePreviewGeometry`. Saved trades store prices, not ticks, so a pure price→ticks adapter derives the stop and target distances.

## Requirements

### Requirement: Price-to-Ticks Adapter

The system MUST derive tick distances from a saved trade's prices with a pure adapter: `stopTicks = |entry − stop| / tick` and `targetTicks = |exit − entry| / tick`. The adapter MUST return positive tick counts regardless of direction; the direction sign is applied by `tradePreviewGeometry`, never by the adapter. It MUST return no value when the instrument's tick is missing or non-positive.

#### Scenario: Long distances

- GIVEN a Largo trade on ES (tick 0.25) with entry 4800, stop 4798, and exit 4804
- WHEN the adapter runs
- THEN `stopTicks` is 8 and `targetTicks` is 16

#### Scenario: Short distances are absolute

- GIVEN a Corto trade on ES (tick 0.25) with entry 4800, stop 4802, and exit 4796
- WHEN the adapter runs
- THEN `stopTicks` is 8 and `targetTicks` is 16 (both positive)

#### Scenario: Tick size scales the count

- GIVEN a trade on FDAX (tick 0.5) with entry 19000 and stop 18996
- WHEN the adapter runs
- THEN `stopTicks` is 8

#### Scenario: Missing tick yields no distance

- GIVEN a trade whose instrument has no tick size (or tick ≤ 0)
- WHEN the adapter runs
- THEN no tick distance is produced

### Requirement: Expandable Detail Row

The system MUST render, under each trade row, an expandable detail row showing that trade's plan SVG. The row MUST be collapsed by default and MUST NOT be part of the table's sortable or filterable columns.

#### Scenario: Toggle open

- GIVEN a trades list with saved trades
- WHEN the user expands a trade's detail row
- THEN that trade's plan SVG is shown

#### Scenario: Toggle closed

- GIVEN an expanded detail row
- WHEN the user collapses it
- THEN the SVG is hidden and the list layout is unchanged

#### Scenario: Empty list

- GIVEN no trades exist
- WHEN the trades list renders
- THEN no detail rows are rendered

### Requirement: Plan Rendering from Saved Prices

The system MUST render the saved trade's plan by feeding the adapter's tick counts and the saved prices into the existing `tradePreviewGeometry` and `riskPreviewSvg` builders, reused unchanged.

#### Scenario: Full plan

- GIVEN a trade with entry, stop, and exit
- WHEN the detail row renders
- THEN the SVG shows Entry, Stop, and Target levels with their tick labels

### Requirement: Degraded and Edge Rendering

When a saved trade is missing stop or exit, the system MUST render the available levels (entry always; stop when present; target when exit present) plus a visible note, and MUST NEVER emit a broken or invalid SVG. A trade with no usable entry MUST render no SVG.

#### Scenario: Entry only

- GIVEN a trade with entry but no stop and no exit
- WHEN the detail row renders
- THEN it shows the entry-only plan and a note, and no invalid SVG

#### Scenario: Stop without exit

- GIVEN a trade with entry and stop but no exit
- WHEN the detail row renders
- THEN it shows Entry and Stop without a Target, plus a note

#### Scenario: No entry

- GIVEN a trade with no usable entry price
- WHEN the detail row renders
- THEN no SVG is emitted
