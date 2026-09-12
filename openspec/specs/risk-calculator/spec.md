# risk-calculator Specification

## Purpose

Define how the system sizes contracts from a daily risk budget using the BPT (ticks) method and reports remaining budget, viability, and instrument suitability.

## Requirements

### Requirement: Daily Risk Budget and Usage

The system MUST compute an account's daily budget as `(riskPct / 100) × startOfDayBalance` — its configured DAILY risk percentage times the account's initial balance plus the net of trades dated before today. It MUST compute `usedToday` as the sum of `|net|` of the account's TODAY losing trades (`net < 0`), never reduced by winners, and `available = dailyBudget − usedToday`.

#### Scenario: Budget and usage

- GIVEN `Sim` start-of-day balance is 10000, its daily risk is 3%, and today's losers sum to −200
- WHEN the daily and remaining budgets are computed
- THEN the budget is 300, `usedToday` is 200, and `available` is 100

#### Scenario: Winners and empty days

- GIVEN today has a winner and a loser, or no losing trades at all
- WHEN the remaining budget is computed
- THEN only loser `|net|` values are counted

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
