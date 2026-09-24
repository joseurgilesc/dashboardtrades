# Delta for risk-settings

## Purpose

Add a per-account `gainFactor` setting (default 50, presets 20/30/50/60) normalized by `normalizeGainFactor`, stored alongside `riskPct` and `dailyTradeLimit`.

## MODIFIED Requirements

### Requirement: Per-Account Risk Settings

The system MUST store a risk percentage, a daily trade limit, and a gain factor independently for each account (`Sim`, `Real`, `Fondeo`). The gain factor MUST default to 50 and accept only presets 20, 30, 50, or 60.

(Previously: stored only `riskPct` and `dailyTradeLimit`.)

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
- AND every account reports `gainFactor` = 50

#### Scenario: Gain factor independent per account

- GIVEN the user sets `gainFactor` for `Sim` to 30
- WHEN the settings are read
- THEN `Sim` gain factor is 30
- AND `Real` and `Fondeo` gain factors remain 50

## ADDED Requirements

### Requirement: Gain Factor Normalization

`normalizeGainFactor` MUST return the input when it is one of the presets 20, 30, 50, or 60, and MUST return the default 50 for any other, missing, or non-numeric value.

#### Scenario: Valid preset preserved

- GIVEN a stored `gainFactor` of 60
- WHEN it is normalized
- THEN it remains 60

#### Scenario: Invalid value falls back to default

- GIVEN a stored `gainFactor` of 45 or a non-numeric value
- WHEN it is normalized
- THEN it becomes 50

#### Scenario: Missing value falls back to default

- GIVEN no `gainFactor` is stored for an account
- WHEN it is read
- THEN it resolves to 50
