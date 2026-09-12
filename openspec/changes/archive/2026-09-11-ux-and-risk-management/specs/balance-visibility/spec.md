# balance-visibility Specification

## Purpose

Define how per-account initial and current balances are surfaced to the user at the point of entry.

## Requirements

### Requirement: Per-Account Balance Display

The system MUST display the current balance and the initial balance for each account (`Sim`, `Real`, `Fondeo`) and SHALL display a combined total.

#### Scenario: Both balances shown per account

- GIVEN initial balances are `Sim` = 10000, `Real` = 5000, `Fondeo` = 25000
- WHEN the balance summary is rendered
- THEN each account shows its initial balance
- AND each account shows its current balance
- AND a combined total is shown

#### Scenario: Total reflects current balances

- GIVEN `Sim` current balance is 12000 and `Real` current balance is 4000
- WHEN the total is rendered
- THEN the total equals 16000

### Requirement: Current Balance Derivation

The system MUST derive each account's current balance as its initial balance plus the sum of net results of that account's trades.

#### Scenario: Current balance includes net results

- GIVEN `Sim` initial balance is 10000 and `Sim` trades have net results of +500 and -200
- WHEN the current balance is derived
- THEN `Sim` current balance equals 10300

#### Scenario: No trades yields initial balance

- GIVEN an account has an initial balance of 5000 and no trades
- WHEN the current balance is derived
- THEN the current balance equals 5000

### Requirement: Initial Balance Visible at Entry

The system MUST surface each account's initial balance in the entry context without requiring navigation to the settings view.

#### Scenario: Initial balance visible without navigation

- GIVEN the user is on the entry view
- WHEN the balance summary is rendered
- THEN the initial balance for each account is visible
- AND the user has not navigated to the settings view

#### Scenario: Updated initial balance reflected

- GIVEN the user changes the `Real` initial balance to 8000
- WHEN the entry view is rendered
- THEN the `Real` initial balance shows 8000

### Requirement: Balance Precision

The system MUST format displayed balances consistently with the app's currency formatting and MUST NOT display `NaN` or empty values for an account with a defined initial balance.

#### Scenario: Defined initial balance never blank

- GIVEN an account has a defined initial balance
- WHEN the balance summary is rendered
- THEN the account displays a numeric currency value
- AND the value is not `NaN` and not empty

#### Scenario: Missing initial balance treated as zero

- GIVEN an account has no stored initial balance
- WHEN the balance summary is rendered
- THEN the account displays zero
