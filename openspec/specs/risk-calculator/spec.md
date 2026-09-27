# risk-calculator Specification

## Purpose

Define how the system sizes contracts from a daily risk budget using the BPT (ticks) method and reports remaining budget, viability, and instrument suitability.

## Requirements

### Requirement: Daily Risk Budget and Usage

The system MUST compute an account's daily budget as `(riskPct / 100) × startOfDayBalance`. It MUST compute `usedToday` as the sum of `|net|` of the account's TODAY losing trades (`net < 0`) and `todayGains` as the sum of `net` of the account's TODAY winning trades (`net > 0`), both scoped to the same account and `state.globalDate`. It MUST compute `available = min(dailyBudget, dailyBudget − usedToday + gainFactor/100 × todayGains)`. `available` MUST never exceed `dailyBudget`, and the gain term MUST be a no-op when `usedToday = 0`.

(Previously: `available = dailyBudget − usedToday`; winners never extended the budget.)

#### Scenario: Budget and usage

- GIVEN `Sim` start-of-day balance is 10000, its daily risk is 3%, and today's losers sum to −200
- WHEN the daily and remaining budgets are computed
- THEN the budget is 300, `usedToday` is 200, and `available` is 100

#### Scenario: Winners and empty days

- GIVEN today has a winner and a loser, or no losing trades at all
- WHEN the remaining budget is computed
- THEN only loser `|net|` values reduce `usedToday`

#### Scenario: Gain-adjusted available

- GIVEN daily budget 300, `usedToday` 200, today's winning trades net +100, and `gainFactor` 50
- WHEN `available` is computed
- THEN it equals `min(300, 300 − 200 + 50/100 × 100) = 150`

#### Scenario: Hard cap never exceeds the daily budget

- GIVEN daily budget 300, `usedToday` 200, today's wins net +500, and `gainFactor` 60
- WHEN `available` is computed
- THEN the raw value 400 is clamped and `available` equals 300

#### Scenario: No-op when nothing was lost

- GIVEN `usedToday` is 0 and today's wins net +300
- WHEN `available` is computed
- THEN it equals `dailyBudget` and the gain term changes nothing

#### Scenario: Only today's winners feed the gain term

- GIVEN the account has today's winner (+100) and loser (−50), plus a winner from another account
- WHEN `todayGains` is computed
- THEN only the account's winning trades (`net > 0`) are summed

### Requirement: Risk Per Contract and Contract Sizing

The system MUST compute `tickValue = tick × pointValue` and `P_m = stopTicks × tickValue`, keeping commission separate from `P_m`. It MUST compute `perTradeCap = dailyBudget / tradesPerDay` (guarded to at least 1) and `contracts = floor(min(perTradeCap, available) / P_m)`.

#### Scenario: P_m excludes commission

- GIVEN `ES` has tick 0.25, point value 50, stop 8 ticks, and commission 4.18
- WHEN `P_m` is computed
- THEN `tickValue` is 12.5 and `P_m` is 100

#### Scenario: Per-trade cap binds

- GIVEN `perTradeCap` is 100, `available` is 300, and `P_m` is 100
- WHEN contracts are computed
- THEN the suggestion is 1, not 3

#### Scenario: Remaining budget binds

- GIVEN `perTradeCap` is 100, `available` is 50, and `P_m` is 100
- WHEN contracts are computed
- THEN the suggestion is 0

#### Scenario: Zero trades per day guarded

- GIVEN `tradesPerDay` is 0 and daily budget is 300
- WHEN the cap is computed
- THEN the divisor is treated as 1 and `perTradeCap` is 300

### Requirement: Risk Panel Values

The system MUST display **Presupuesto diario**, **Cupo por operación**, **Usado hoy**, **Disponible**, and **Contratos** for the selected account and instrument.

#### Scenario: Panel shows the model-B values

- GIVEN daily budget 300, cap 100, used 200, available 100, and `P_m` 100
- WHEN the risk panel renders
- THEN it shows 300, 100, 200, 100, and 1

#### Scenario: Invalid input clears the values

- GIVEN a required input is missing or non-numeric
- WHEN the panel renders
- THEN no contracts suggestion is shown

### Requirement: Exhausted and Viability Warnings

When `available <= 0`, the system MUST suggest 0 contracts and show a visible "no risk budget available today" warning. When `available > 0` but one contract's `P_m` exceeds the effective budget, it MUST warn the instrument is not viable for the account.

#### Scenario: Budget exhausted

- GIVEN `available` is 0
- WHEN the panel renders
- THEN Contratos is 0 and the exhausted warning is visible

#### Scenario: One contract exceeds the budget

- GIVEN `available` is 40 and `P_m` is 100
- WHEN the result is displayed
- THEN the viability warning is shown

### Requirement: Legacy Stop Distance

The system MUST accept a legacy stop distance in points and convert it to ticks via the instrument's tick size when no explicit tick value is provided.

#### Scenario: Points converted to ticks

- GIVEN a legacy stop distance of 2 points and a tick of 0.25
- WHEN the stop is resolved
- THEN it equals 8 ticks

### Requirement: Instrument Size Suitability

The system MUST classify every instrument with a `size` of `micro` or `full` and SHOULD use the minimum balance for one contract to guide suitability.

#### Scenario: Size metadata and micro guidance

- GIVEN the instrument list is loaded
- WHEN instruments are inspected
- THEN every instrument has a `size` of `micro` or `full`
- AND a micro equivalent is shown as suitable when one full-size contract exceeds the account balance
### Requirement: Gain Bonus Never Overrides Protections

The gain-adjusted `available` MUST NOT resurrect a circuit-breaker block or override the forced-one-contract small-account branch. A ≥5% drawdown or a 3-loss streak MUST still force 0 contracts, and a small account MUST still be limited to 1 contract, regardless of `todayGains`.

#### Scenario: Circuit breaker still blocks

- GIVEN a ≥5% drawdown (or a 3-loss streak) and large today's winners
- WHEN contracts are computed
- THEN the result is 0 contracts

#### Scenario: Small account still one contract

- GIVEN a small account and a gain-boosted `available`
- WHEN contracts are computed
- THEN the result is 1 contract

### Requirement: Single Source for Gain-Adjusted Available

`computeRisk` and `budgetStopTicks` MUST consume the same gain-adjusted `available` value, so the contract suggestion and the AUTO stop default never drift.

#### Scenario: Both consumers agree

- GIVEN a gain-adjusted `available`
- WHEN `computeRisk` and `budgetStopTicks` are evaluated
- THEN both read the same `available` value

### Requirement: Trades-Per-Day Selector Location

The `tradesPerDay` stepper MUST render next to the contracts field in the calculator panel, keeping element id `#riskTradesPerDayInput`. All four references (render, change handler, reset, Ajustes mirror) MUST remain wired.

#### Scenario: Relocation keeps id and wiring

- GIVEN the calculator panel
- WHEN it renders
- THEN the stepper appears next to contracts
- AND id `#riskTradesPerDayInput` is present and all four references remain functional

### Requirement: Contracts ⇄ Operations Coupling

Contracts is the master input. The number of operations MUST be derived from contracts and recalculated live so `contracts × P_m` stays within the daily budget; changing contracts updates operations, and changing operations updates contracts.

#### Scenario: Increasing contracts recalculates operations

- GIVEN daily budget 300 and `P_m` 100
- WHEN contracts is set to 2
- THEN operations recalculates so `contracts × P_m` stays within the daily budget

#### Scenario: Coupling respects the daily budget

- GIVEN a contracts value that would exceed the daily budget
- WHEN it is entered
- THEN operations is clamped so the total stays within budget
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
