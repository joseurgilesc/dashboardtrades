# Proposal: risk-calculator-gains-sizing

## Intent

Give traders flexibility to reinvest a fraction of today's winning trades into today's risk budget (with a hard daily ceiling) and make sizing controls clearer. Today only losers reduce `available`; winners never extend it, and the Op/día selector sits far from the contracts field it drives.

## Scope

### In Scope
- **Gain-based risk factor** — per-account `gainFactor` (default 50, presets 20/30/50/60). `available = min(dailyBudget, dailyBudget − usedToday + factor/100 × todayGains)`. Never exceeds the daily budget. No-op when there are no losses today.
- **Op/día selector** — relocate (or duplicate) the `tradesPerDay` stepper next to the contracts field, keeping id `#riskTradesPerDayInput`.
- **Contracts ⇄ operations coupling** — contracts is the master input; operations recalc live; both respect the daily budget.

### Out of Scope
- Anything that raises the ceiling above the daily budget (larger base capital, higher `riskPct`).
- Changing `usedToday` (losers-only), circuit breakers, small-account=1, or `getMaxContracts`.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `risk-calculator`: gain-adjusted `available` (hard cap) + contracts ⇄ operations coupling in sizing.
- `risk-settings`: new per-account `gainFactor` map + `normalizeGainFactor` (default/presets).

## Approach

Approach A (exploration recommendation): add pure `store.js` helpers `todayGains`, `gainsAdjustedAvailable`, `normalizeGainFactor`; apply the gain term ONCE inside `dailyRiskUsage`'s `available`. `computeRisk` and `budgetStopTicks` already consume `available`, so they need no change — a single source prevents drift. Persist `gainFactor` as a sibling per-account map to `riskPct`/`dailyTradeLimit`. Relocate the stepper markup keeping its id; extend `renderContractsHint` for the coupling.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `js/store.js` | Modified | `todayGains`, `gainsAdjustedAvailable`, `normalizeGainFactor`; extend `dailyRiskUsage`, `getRiskSettings` |
| `js/app.js` | Modified | `renderRiskPanel`, `renderContractsHint`, `#riskTradesPerDayInput` wiring (4 refs) |
| `index.html` | Modified | move Op/día stepper into calculator panel |
| `test/*.test.js` | Modified/New | see Tests below |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Drift if gain term not applied to the single `available` source | Med | apply once in `dailyRiskUsage`; both consumers read it |
| `#riskTradesPerDayInput` referenced in 4 places | Med | keep id; touch all 4 (render, change, reset, Ajustes mirror) |
| Selector relocation wiring/touched-semantics | Med | structural test pins touched flag + Ajustes mirror |
| Gain term leaks wrong day/account | Low | reuse `state.globalDate` + account scoping from `dailyRiskUsage` |

## Rollback Plan

Pure additive setting + markup move. Revert the merge/commit restoring prior `store.js`, `app.js`, `index.html`. `settings.gainFactor` is additive and optional — `normalizeGainFactor` falls back to default 50 and absence preserves current behavior — so persisted Firestore data stays valid with or without the field. No data migration to reverse.

## Dependencies

None external. Spec phase produces delta specs for `risk-calculator` and `risk-settings`.

## Tests

- **Extended**: `risk-calculator`, `contracts-override`, `stop-per-operation`, `risk-per-trade`, `budget-stop-default`, `trades-per-day-input`.
- **New**: `gain-factor` (pure helpers: `todayGains`, `normalizeGainFactor`, `gainsAdjustedAvailable`), `contracts-ops-coupling`.

## Success Criteria

- [ ] `available` matches `min(dailyBudget, dailyBudget − used + factor/100 × todayGains)` and never exceeds `dailyBudget`.
- [ ] Gain factor is a no-op when `usedToday = 0`; circuit breakers and small-account=1 still hold.
- [ ] Op/día stepper renders next to contracts; all 4 `#riskTradesPerDayInput` references intact.
- [ ] Increasing contracts recalculates operations (and vice versa) within the daily budget.
- [ ] `settings.gainFactor` persists per account with default 50 and presets 20/30/50/60.
