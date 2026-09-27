# Delta for risk-calculator

## Purpose

Add two additive readouts to the calculator: a ticks↔points relationship line in the instrument info, and a read-only Stop reference (ticks + points) in the "Objetivo y R/B" result group. Neither changes any existing computed value.

## ADDED Requirements

### Requirement: Ticks↔Points Relationship Readout

The system MUST show, in the calculator's instrument info, the instrument's ticks↔points relationship using the existing `ticksToPoints`/`pointsToTicks` helpers: "1 tick = X puntos" where X is `ticksToPoints(1, instrument)`, and "1 punto = Y ticks" where Y is `pointsToTicks(1, instrument)`. When the instrument or its tick size is missing or invalid, the readout MUST show nothing.

#### Scenario: Tick size 0.25

- GIVEN ES (tick 0.25) is selected
- WHEN the instrument info renders
- THEN it shows "1 tick = 0.25 puntos" and "1 punto = 4 ticks"

#### Scenario: Tick size 1

- GIVEN YM (tick 1) is selected
- WHEN the instrument info renders
- THEN it shows "1 tick = 1 punto" and "1 punto = 1 tick"

#### Scenario: Missing or invalid instrument

- GIVEN no valid instrument (or an unknown tick size)
- WHEN the instrument info renders
- THEN no ticks↔points relationship line is shown

### Requirement: Stop Reference Readout

The system MUST show, in the "Objetivo y R/B" `preview-group--result` group, a read-only "Stop" row with the stop distance in ticks and points, from `risk.ticksSL` (which equals `risk.stopTicks`) and its points equivalent. The points value MUST be `ticksToPoints(stopTicks, instrument)`. It MUST NOT change any existing computed value.

#### Scenario: Stop shown in ticks and points

- GIVEN a computed `risk.ticksSL` of 8 for ES (tick 0.25)
- WHEN the risk panel renders
- THEN the Stop row shows "8 ticks" and "2.00 puntos"

#### Scenario: Invalid instrument hides the points

- GIVEN the instrument has no usable tick size
- WHEN the risk panel renders
- THEN the Stop reference does not show a points value
