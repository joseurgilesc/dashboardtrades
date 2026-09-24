# Delta for risk-calculator

## Purpose

Add a gain-based risk factor that refills today's consumed budget from today's winning trades (hard-capped at the daily budget), relocate the Op/día selector next to the contracts field, and couple contracts to derived operations within the daily budget.

## MODIFIED Requirements

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

## ADDED Requirements

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
