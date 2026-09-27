# weekly-review Specification

## Purpose

Add a weekly review that compares one best and one worst execution, ranked by process quality (not P&L), presents an eight-field comparison, and captures three questions persisted additively per account and week.

## Requirements

### Requirement: Execution-Quality Score

The system MUST compute a derived execution-quality score per trade as `respectedEntry + respectedStop + respectedSize − (planDeviation ? 1 : 0)`, where booleans count as 1/0 and a non-empty `planDeviation` subtracts 1. The score MUST be independent of P&L.

#### Scenario: Full adherence

- GIVEN all three `respected*` flags are true and there is no `planDeviation`
- WHEN the score is computed
- THEN it equals 3

#### Scenario: Deviation penalized

- GIVEN all three `respected*` flags are true and `planDeviation` is non-empty
- WHEN the score is computed
- THEN it equals 2

#### Scenario: No adherence

- GIVEN all three `respected*` flags are false and `planDeviation` is non-empty
- WHEN the score is computed
- THEN it equals -1

### Requirement: Best/Worst Execution Picker

The system MUST rank the selected account's trades for the selected week by execution-quality score and pick one best (highest) and one worst (lowest). Ties MUST break deterministically by higher `net` for best, lower `net` for worst, then earliest entry date. With fewer than two trades the view MUST show an empty state.

#### Scenario: Distinct scores

- GIVEN the week has trades scoring 3, 1, and -1
- WHEN the picker runs
- THEN best is the score-3 trade and worst is the score-(−1) trade

#### Scenario: Score tie

- GIVEN two trades share the highest score
- WHEN the picker runs
- THEN the higher-`net` trade is selected deterministically

#### Scenario: Too few trades

- GIVEN the week has fewer than two trades
- WHEN the weekly review view renders
- THEN it shows an empty state

### Requirement: Weekly Comparison View

The system MUST render the best and worst executions side-by-side across eight fields sourced from the trades: strategy (`strategy`/`direction`), market context (`instrument`/`exitType`), emotion (`emotion`), plan (`plannedRisk`/`stop`/`target`), risk (`tradeRiskUsd`), changes (`planDeviation`), R result, and learning (`notes`).

#### Scenario: Both executions compared

- GIVEN a best and a worst execution are selected
- WHEN the comparison view renders
- THEN both trades show all eight fields sourced from their trade data

### Requirement: Realized R Result

The system MUST compute the "R result" column as `net / tradeRiskUsd` when a stop is recorded and the risk is usable; otherwise it MUST fall back to the planned ratio from `computeRR` (`target / plannedRisk`). When neither yields a value, the column MUST show an empty state.

#### Scenario: Stop recorded

- GIVEN a trade records a stop and `tradeRiskUsd` is finite and positive
- WHEN the R result is computed
- THEN it equals `net / tradeRiskUsd`

#### Scenario: No stop

- GIVEN a trade has no usable realized risk
- WHEN the R result is computed
- THEN it falls back to the planned `computeRR` ratio

#### Scenario: Neither available

- GIVEN a trade has neither realized risk nor a valid planned ratio
- WHEN the R result is computed
- THEN the column shows an empty state

### Requirement: Weekly Review Questions

The system MUST capture three free-text answers: "what to repeat", "what triggered the deviation", and "next week's goal".

#### Scenario: Three answers captured

- GIVEN the weekly review view is open
- WHEN the user fills the three question fields
- THEN all three answers are captured

### Requirement: Weekly Review Persistence and Scoping

The system MUST persist the weekly review additively in `settings.weeklyReviews` keyed by `account|weekStart`, mirroring `dailyGoals`/`sessionReviews` via `setSettings`. Each account/week pair MUST be independent and MUST round-trip unchanged.

#### Scenario: Save and read back

- GIVEN a completed review for an account and week
- WHEN it is saved then read back
- THEN the same answers and selections are returned

#### Scenario: Account and week isolation

- GIVEN reviews for two accounts or two weeks
- WHEN one is read
- THEN the other is unchanged
