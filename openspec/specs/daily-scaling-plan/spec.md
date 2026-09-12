# daily-scaling-plan Specification

## Purpose

Define the proportional daily scaling projection: a compounding forecast of capital over a chosen horizon at a fixed daily risk percentage and reward ratio.

## Requirements

### Requirement: Compounding Projection

The system MUST project capital day by day using `risk_d = (riskPct / 100) × capital_{d-1}`, `gain_d = risk_d × rr`, and `capital_d = capital_{d-1} + gain_d`, where `riskPct` is the daily risk percentage and `rr` is the R/B expectancy as a ratio.

#### Scenario: Known projection

- GIVEN capital 5000, daily risk 2%, rr 2, and 3 days
- WHEN the plan is computed
- THEN day 1 risk is 100, gain 200, and end capital 5200
- AND day 3 end capital is 5624.32

#### Scenario: Zero reward ratio stays flat

- GIVEN `rr` is 0
- WHEN the plan is computed
- THEN every day's gain is 0 and capital is unchanged

### Requirement: Plan Inputs and Defaults

The system MUST accept capital, daily risk percentage, R/B, and day count as inputs, defaulting `rr` to 2 and the horizon to 20 days when missing or non-numeric.

#### Scenario: Defaults applied

- GIVEN only capital and daily risk percentage are provided
- WHEN the plan is computed
- THEN `rr` is 2 and the horizon is 20 days

#### Scenario: Days below one replaced by the default

- GIVEN the day count is 0 or non-numeric
- WHEN the plan is computed
- THEN the default 20-day horizon is used

### Requirement: Day Count Cap

The system MUST cap the day count at 365 and SHALL indicate when the horizon was clamped.

#### Scenario: Oversized horizon clamped

- GIVEN the day count is 1000
- WHEN the plan is computed
- THEN the horizon is clamped to 365 days
- AND the clamp is indicated

### Requirement: Plan Table

The system MUST render a table with columns **Día**, **Capital inicial**, **Riesgo**, **Ganancia**, and **Capital final**, one row per projected day, plus a summary of the final capital.

#### Scenario: Table rows per day

- GIVEN a valid 3-day plan
- WHEN the table renders
- THEN it shows 3 rows with the five columns
- AND the summary reports the final capital

### Requirement: Invalid Input

The system MUST produce no rows and SHALL show a warning when capital is missing, non-numeric or negative, or when the daily risk percentage is missing, non-numeric or not greater than 0.

#### Scenario: Invalid risk percentage

- GIVEN the daily risk percentage is 0
- WHEN the plan is computed
- THEN no rows are produced
- AND a warning states the risk percentage must be greater than 0

#### Scenario: Negative capital

- GIVEN capital is negative
- WHEN the plan is computed
- THEN no rows are produced
- AND a warning is shown
