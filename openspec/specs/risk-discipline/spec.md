# risk-discipline Specification

## Purpose

Client-side rules that record, compute, and warn on risk percentage, risk/reward, recovery, stop usage, and intraday drawdown. The journal flags recorded data; it does not execute orders.

## Requirements

### Requirement: Risk Percentage Bounds

The system MUST constrain each account's `riskPct` to a recommended band of 0.5%–2%, treat 3% as a hard maximum, and reject or clamp-with-warning any value above 3%. Values below 0.5% MUST clamp up.

#### Scenario: Within band

- GIVEN an account's `riskPct` is unset
- WHEN the user enters `1.5`
- THEN it stores 1.5 with no warning

#### Scenario: Above maximum

- GIVEN the stored `riskPct` is 2
- WHEN the user enters `4`
- THEN it is clamped to at most 3 (or rejected)
- AND a warning states the maximum was exceeded

### Requirement: Risk/Reward Minimum Warning

A trade MAY carry a target; the system MUST compute risk/reward from planned risk and target and MUST warn when it is below a configurable minimum (default 2:1, optionally 3:1). The expectancy KPI MUST remain available.

#### Scenario: Meets minimum

- GIVEN planned risk 100 and target 300
- WHEN the ratio is computed
- THEN it is 3:1 with no warning

#### Scenario: Below minimum

- GIVEN the minimum is 2:1, risk 100, and target 150
- WHEN the ratio is computed
- THEN it is 1.5:1
- AND a warning flags it below the minimum

#### Scenario: Expectancy preserved

- GIVEN trades have recorded results
- WHEN KPIs render
- THEN expectancy is still displayed

### Requirement: Asymmetric Recovery Display

The system MUST display the non-linear recovery percentage `recoveryPct = lossPct / (1 - lossPct)` for a given drawdown, for information only.

#### Scenario: Fifty percent drawdown

- GIVEN lossPct is 0.5
- WHEN recovery is displayed
- THEN it is 100%

#### Scenario: No drawdown

- GIVEN lossPct is 0
- WHEN recovery is displayed
- THEN it is 0%

### Requirement: Stop Discipline Flagging

A trade SHOULD record a stop; the system MUST flag trades without a stop and MUST report Break-Even and Trailing-Stop usage from exit type.

#### Scenario: Missing stop flagged

- GIVEN a saved trade has no stop
- WHEN it is displayed
- THEN it is flagged as missing a stop

#### Scenario: Stop present

- GIVEN a saved trade records a stop
- WHEN it is displayed
- THEN it is not flagged

#### Scenario: Exit-type usage

- GIVEN trades have Break-Even and Trailing-Stop exit types
- WHEN discipline usage is reported
- THEN their counts are shown

### Requirement: Intraday Drawdown and Losing Streaks

The system MUST compute the selected account's current-day drawdown and losing-trade streak, and MUST warn at/over 5–6% daily drawdown or 3 consecutive losses. Warnings MUST NOT block any action.

#### Scenario: Daily drawdown warned

- GIVEN the current-day drawdown is at or above 5%
- WHEN the account is evaluated
- THEN a warning is displayed

#### Scenario: Losing streak warned

- GIVEN the account has 3 consecutive losing trades
- WHEN the account is evaluated
- THEN a warning is displayed

#### Scenario: Warning never blocks

- GIVEN a warning is active
- WHEN the user submits a valid trade
- THEN the trade is saved successfully

### Requirement: Risk Budget Scaling Base

The system MUST derive the daily risk budget from the account's start-of-day capital (initial balance plus the net of trades dated before today), so prior-day gains scale size and today's losses are counted once via the remaining-budget model.

#### Scenario: Prior gains scale the base

- GIVEN initial balance 10000, `riskPct` 2, and prior-day net results +2000
- WHEN the start-of-day capital is derived
- THEN the budget uses 12000 (240), not 10000 (200)

#### Scenario: Today's results excluded from the base

- GIVEN today's realized results are already recorded
- WHEN the start-of-day capital is derived
- THEN it excludes today's trades
- AND today's losses are subtracted once via `usedToday`
