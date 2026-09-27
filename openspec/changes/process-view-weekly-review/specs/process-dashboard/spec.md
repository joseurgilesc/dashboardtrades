# process-dashboard Specification

## Purpose

Split the Dashboard tab into a "Proceso" view (process KPIs) and a "Resultados" view (financial KPIs), selected by an in-tab toggle. Process indicators are derived from existing trade fields and `settings`; financial KPIs stay in Resultados.

## Requirements

### Requirement: Proceso/Resultados Toggle

The system MUST render a Proceso/Resultados segmented control inside the existing Dashboard tab (no new top-level tab). Selecting Proceso MUST show the process cards and indicators and hide the financial KPIs; selecting Resultados MUST show the KPI grid, outcome card, and charts and hide the process indicators. Financial KPIs MUST NOT appear in Proceso.

#### Scenario: Proceso shows indicators, hides financials

- GIVEN the Dashboard tab is open
- WHEN the user selects "Proceso"
- THEN the process indicators render
- AND the KPI grid, outcome card, and charts are hidden

#### Scenario: Resultados keeps financial KPIs

- GIVEN the Dashboard tab is open
- WHEN the user selects "Resultados"
- THEN the KPI grid, outcome card, and charts render
- AND no process indicator is shown

### Requirement: Plan-Registered Percentage

The system MUST derive "% of trades with a plan registered" as the share of the account's trades where `plannedRisk`, `stop`, and `target` are all greater than 0, with no new trade field. With zero trades the percentage MUST be 0.

#### Scenario: Every trade has a plan

- GIVEN every trade has `plannedRisk`, `stop`, and `target` greater than 0
- WHEN the indicator is computed
- THEN it equals 100%

#### Scenario: Partial plan is not registered

- GIVEN a trade has `stop` and `target` but no `plannedRisk`
- WHEN the indicator is computed
- THEN that trade is not counted as plan-registered

#### Scenario: Empty account

- GIVEN the account has no trades
- WHEN the indicator is computed
- THEN it equals 0% without error

### Requirement: Respected Stop and Risk Percentage

The system MUST derive "% of trades that respected the planned stop and risk" as the share of the account's trades where `respectedStop` is true and the trade is within the per-trade risk cap at the time it was taken (the `riskRespectedCount` criterion).

#### Scenario: Stop and risk respected

- GIVEN a trade has `respectedStop` true and risk within the cap
- WHEN the indicator is computed
- THEN the trade is counted as respected

#### Scenario: Over-cap risk is not respected

- GIVEN a trade has `respectedStop` true but risk above the per-trade cap
- WHEN the indicator is computed
- THEN the trade is not counted as respected

#### Scenario: Empty account

- GIVEN the account has no trades
- WHEN the indicator is computed
- THEN it equals 0% without error

### Requirement: Daily Process-Goal Compliance

The system MUST aggregate daily process-goal compliance from `settings.dailyGoals` statuses as the percentage of recorded days whose `status` is `cumplida`. Statuses `parcial`, `no`, and empty MUST NOT count as complied.

#### Scenario: Mixed statuses

- GIVEN two days are recorded, one `cumplida` and one `no`
- WHEN compliance is computed
- THEN it equals 50%

#### Scenario: No goals recorded

- GIVEN `settings.dailyGoals` has no entries
- WHEN compliance is computed
- THEN an empty state is shown without error

### Requirement: Sessions-Reviewed Count

The system MUST report the number of sessions reviewed as the count of dates present in `settings.sessionReviews`.

#### Scenario: Several reviews

- GIVEN `settings.sessionReviews` has three dates
- WHEN the count is computed
- THEN it equals 3

#### Scenario: No reviews

- GIVEN `settings.sessionReviews` has no entries
- WHEN the count is computed
- THEN it equals 0

### Requirement: Repeating Behavior Patterns

The system MUST aggregate repeating behavior patterns with case counts from the categorical trade fields `emotion`, `exitType`, and `planDeviation`. Each field MUST be counted independently; empty string values MUST be excluded.

#### Scenario: Recurring emotion

- GIVEN three trades share `emotion` "Miedo"
- WHEN patterns are computed
- THEN "Miedo" appears with a case count of 3

#### Scenario: Empty values excluded

- GIVEN a trade has an empty `planDeviation`
- WHEN patterns are computed
- THEN the empty value is not listed as a pattern

#### Scenario: No trades

- GIVEN the account has no trades
- WHEN patterns are computed
- THEN an empty state is shown without error
