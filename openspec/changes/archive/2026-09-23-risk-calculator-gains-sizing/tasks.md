# Tasks: Risk Calculator Gains Sizing

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~400–450 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----|----------------------|-----------------|-------------------|
| 1 | Pure gain math in `js/store.js` | PR 1 | `node test/gain-factor.test.js` | same command | Revert `js/store.js`; delete `test/gain-factor.test.js` |
| 2 | App wiring + markup (`js/app.js`, `index.html`) | PR 2 | `node test/risk-calculator.test.js` | `node test/trades-per-day-input.test.js` | Revert `js/app.js`, `index.html` |
| 3 | Coupling + protection regression | PR 3 | `node test/contracts-ops-coupling.test.js` | `node test/contracts-override.test.js` | Delete new test; revert test edits |

## Phase 1: Foundation (`js/store.js`)

- [x] 1.1 Add `todayGains({account,today,trades?})` to `js/store.js`: sum `computeTrade(trade).net` for today's `net>0` trades scoped to `account`, rounded via `roundMoney`.
- [x] 1.2 Add `normalizeGainFactor(value)` to `js/store.js`: return value when in {20,30,50,60}, else default 50.
- [x] 1.3 Add `gainsAdjustedAvailable({dailyBudget,used,todayGains,gainFactor})` to `js/store.js`: `roundMoney(min(dailyBudget, dailyBudget−used+gainFactor/100×todayGains))`.
- [x] 1.4 Extend `dailyRiskUsage` in `js/store.js`: compute `todayGains` in the same pass, apply `gainsAdjustedAvailable` (gainFactor defaulted via `normalizeGainFactor`), return `todayGains`/`gainFactor`.
- [x] 1.5 Extend `getRiskSettings` in `js/store.js` to expose per-account `gainFactor` (default 50); export the three new helpers.
- [x] 1.6 Fix `computeRisk.usedToday` in `js/store.js` to read the true loser sum (`opts.dayLoss`) instead of `dailyBudget − available`.

## Phase 2: App wiring (`js/app.js`, `index.html`)

- [x] 2.1 In `js/app.js` `renderRiskPanel`, pass per-account `gainFactor` (from `Store.getRiskSettings()`) into `Store.dailyRiskUsage`.
- [x] 2.2 In `js/app.js`, add a "Ganancias hoy" row rendering `usage.todayGains`.
- [x] 2.3 In `index.html`, move the `#riskTradesPerDayInput` stepper (lines 55–62) into the calculator "Tamaño" group next to contracts; keep the id.
- [x] 2.4 In `index.html` Ajustes, add per-account gainFactor `<select>` (presets 20/30/50/60) for Sim/Real/Fondeo.
- [x] 2.5 In `js/app.js` `loadRiskSettingsIntoForm`, populate each gainFactor select; in `handleSaveRiskSettings`, persist `settings.gainFactor`.

## Phase 3: Tests

- [x] 3.1 Create `test/gain-factor.test.js`: `todayGains`, `normalizeGainFactor`, `gainsAdjustedAvailable`, hard cap, no-op when `used=0`. Run `node test/gain-factor.test.js`.
- [x] 3.2 Create `test/contracts-ops-coupling.test.js`: contracts→ops, ops→contracts, budget bounds, `contractsTouched` gating, `getMaxContracts` cap. Run `node test/contracts-ops-coupling.test.js`.
- [x] 3.3 Extend `test/risk-calculator.test.js`: gain-adjusted `available`; circuit breaker + small-account still hold.
- [x] 3.4 Extend `test/trades-per-day-input.test.js`: stepper next to contracts; id + 4 refs intact.
- [x] 3.5 Extend `test/contracts-override.test.js`, `test/stop-per-operation.test.js`, `test/risk-per-trade.test.js`, `test/budget-stop-default.test.js`: gain interaction + single `available` source.

## Phase 4: Verification

- [x] 4.1 Run all touched harnesses: `node test/gain-factor.test.js`, `node test/contracts-ops-coupling.test.js`, `node test/risk-calculator.test.js`, `node test/trades-per-day-input.test.js`, `node test/contracts-override.test.js`, `node test/stop-per-operation.test.js`, `node test/risk-per-trade.test.js`, `node test/budget-stop-default.test.js`.
