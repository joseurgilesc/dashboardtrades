# risk-calculator Specification

## Purpose

Define how the system computes risk budget, risk per contract, and suggested contracts, and how it warns about viability and instrument suitability.

## Requirements

### Requirement: Risk Budget From Current Balance

The system MUST compute an account's risk budget as `(riskPct / 100) × currentBalance`, using that account's current balance and configured risk percentage.

#### Scenario: Budget uses current balance

- GIVEN `Sim` current balance is 10000 and `Sim` risk percentage is 2
- WHEN the risk budget is computed
- THEN the budget equals 200

#### Scenario: Budget uses per-account risk percentage

- GIVEN `Real` current balance is 10000 and `Real` risk percentage is 3
- WHEN the risk budget is computed for `Real`
- THEN the budget equals 300
- AND the `Sim` risk percentage does not affect the `Real` budget

### Requirement: Risk Per Contract Includes Commission

The system MUST compute risk per contract as `stopDistance × pointValue + commission`, where `stopDistance` is in points/ticks and `commission` is round-trip.

#### Scenario: Commission included

- GIVEN stop distance is 10 points, point value is 5, and commission is 4
- WHEN risk per contract is computed
- THEN risk per contract equals 54

#### Scenario: Zero stop distance rejected

- GIVEN stop distance is 0
- WHEN the risk computation runs
- THEN no contracts suggestion is produced
- AND the result is treated as invalid input

### Requirement: Suggested Contracts

The system MUST compute suggested contracts as `floor(riskBudget / riskPerContract)`, and MUST suggest zero contracts when the budget is below one contract's risk.

#### Scenario: Whole contracts suggested

- GIVEN risk budget is 200 and risk per contract is 54
- WHEN contracts are computed
- THEN the suggested contracts equal 3

#### Scenario: Budget below one contract

- GIVEN risk budget is 40 and risk per contract is 54
- WHEN contracts are computed
- THEN the suggested contracts equal 0

### Requirement: Viability Warning

When risk per contract exceeds the risk budget, the system MUST warn that one contract already exceeds the budget and the instrument is not viable for that account and risk percentage.

#### Scenario: Warning when one contract exceeds budget

- GIVEN risk budget is 40 and risk per contract is 54
- WHEN the result is displayed
- THEN a viability warning is shown
- AND the warning states the instrument is not viable for the account at the configured risk percentage

#### Scenario: No warning when one contract fits

- GIVEN risk budget is 200 and risk per contract is 54
- WHEN the result is displayed
- THEN no viability warning is shown

### Requirement: Instrument Size Suitability

The system MUST classify each instrument with a `size` of `micro` or `full` and SHOULD use the minimum balance for one contract to guide micro versus full-size suitability.

#### Scenario: Micro instrument suggested for small balance

- GIVEN the minimum balance for one full-size contract exceeds the account balance
- AND a micro equivalent is available
- WHEN suitability guidance is displayed
- THEN the micro instrument is shown as suitable
- AND the full-size instrument is shown as not suitable

#### Scenario: Size metadata present for every instrument

- GIVEN the instrument list is loaded
- WHEN instruments are inspected
- THEN every instrument has a `size` value of either `micro` or `full`

### Requirement: Graceful Handling of Missing Inputs

The system MUST NOT produce a contracts suggestion when required inputs (account balance, risk percentage, stop distance, instrument) are missing or non-numeric, and SHALL indicate that the calculation is incomplete.

#### Scenario: Missing instrument

- GIVEN no instrument is selected
- WHEN the risk computation runs
- THEN no contracts suggestion is shown
- AND the result indicates the calculation is incomplete
