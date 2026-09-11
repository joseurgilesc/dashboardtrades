# risk-settings Specification

## Purpose

Define how per-account risk percentage and daily trade limit are stored, defaulted, and enforced as non-blocking guidance.

## Requirements

### Requirement: Per-Account Risk Settings

The system MUST store a risk percentage and a daily trade limit independently for each account (`Sim`, `Real`, `Fondeo`).

#### Scenario: Independent values per account

- GIVEN the settings store is empty
- WHEN the user sets `riskPct` for `Sim` to 3
- THEN `Sim` risk percentage is 3
- AND `Real` and `Fondeo` risk percentages retain their own values

#### Scenario: Defaults when unset

- GIVEN no risk settings have ever been saved
- WHEN the settings are read
- THEN every account reports `riskPct` = 2
- AND every account reports `dailyTradeLimit` = 3

### Requirement: Additive Settings Persistence

The system MUST persist risk settings through a settings mutation that merges a patch into existing settings without removing unrelated keys, and MUST expose the merged result through the existing settings read path.

#### Scenario: Patch preserves unrelated settings

- GIVEN settings already contain an unrelated key
- WHEN a risk-settings patch is persisted
- THEN the unrelated key remains present
- AND the risk-settings values are updated

#### Scenario: Missing fields fall back to defaults

- GIVEN a persisted settings record omits `dailyTradeLimit`
- WHEN settings are loaded
- THEN the missing field resolves to the default value

### Requirement: Daily Trade Limit Is Warn-Only

The system MUST count today's trades per account and MUST NOT block trade submission when the count reaches or exceeds `dailyTradeLimit`. When the limit is reached or exceeded, the system SHALL display a non-blocking warning.

#### Scenario: Warning at the limit

- GIVEN `dailyTradeLimit` for `Sim` is 3 and 3 trades for `Sim` have `entryDate` equal to today
- WHEN the user opens the entry form for `Sim`
- THEN a warning message is shown
- AND the submit action remains enabled

#### Scenario: No warning below the limit

- GIVEN `dailyTradeLimit` for `Real` is 3 and only 2 trades for `Real` have `entryDate` equal to today
- WHEN the user opens the entry form for `Real`
- THEN no limit warning is shown

#### Scenario: Warning never blocks save

- GIVEN the daily limit is exceeded
- WHEN the user submits a valid trade
- THEN the trade is saved successfully

### Requirement: Settings Input Validation

The system MUST reject or normalize non-numeric, negative, or empty risk-settings input, keeping a valid stored value.

#### Scenario: Negative risk percentage rejected

- GIVEN the stored `riskPct` is 2
- WHEN the user submits `-1` as the risk percentage
- THEN the stored `riskPct` remains a valid non-negative value
- AND the invalid value is not persisted

#### Scenario: Zero daily limit allowed

- GIVEN the user enters a daily limit of 0
- WHEN the value is submitted
- THEN the limit is stored as 0
