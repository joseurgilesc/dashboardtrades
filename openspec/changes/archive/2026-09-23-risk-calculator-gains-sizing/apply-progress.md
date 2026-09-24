# Apply Progress: risk-calculator-gains-sizing

**Change**: `risk-calculator-gains-sizing`
**Mode**: Standard (strict_tdd = false)
**Artifact store**: hybrid
**Delivery strategy**: chained-pr, stacked-to-main, 3 work units (LOCAL commits only — no push, no PRs).

## Summary

Implemented the gain-based risk factor (per-account `gainFactor`, default 50, presets 20/30/50/60), relocated the Op/día stepper into the calculator "Tamaño" group next to contracts (keeping `#riskTradesPerDayInput`), and pinned the existing contracts ⇄ operations coupling with a dedicated harness. All 9 touched harnesses pass; the full non-rules suite (21 harnesses) is green.

## Completed Tasks

### Phase 1: Foundation (`js/store.js`)
- [x] 1.1 `todayGains({account,today,trades?})` — sums `computeTrade(trade).net` for today's `net>0` trades scoped to `account`, rounded via `roundMoney`.
- [x] 1.2 `normalizeGainFactor(value)` — returns value when in {20,30,50,60}, else default 50.
- [x] 1.3 `gainsAdjustedAvailable({dailyBudget,used,todayGains,gainFactor})` — `roundMoney(min(dailyBudget, dailyBudget−used+gainFactor/100×todayGains))`.
- [x] 1.4 `dailyRiskUsage` — computes `todayGains` in the same pass, applies `gainsAdjustedAvailable`, returns `todayGains`/`gainFactor`.
- [x] 1.5 `getRiskSettings` — exposes per-account `gainFactor` (default 50); exports the three new helpers.
- [x] 1.6 `computeRisk.usedToday` — sources the true loser sum (`dayLoss`), not `dailyBudget − available`.

### Phase 2: App wiring (`js/app.js`, `index.html`)
- [x] 2.1 `renderRiskPanel` passes per-account `gainFactor` into `Store.dailyRiskUsage`.
- [x] 2.2 "Ganancias hoy" row (`#riskGainsToday`) renders `usage.todayGains`.
- [x] 2.3 `#riskTradesPerDayInput` stepper moved into the calculator "Tamaño" group next to contracts; id + all 4 references kept.
- [x] 2.4 Ajustes gainFactor `<select>` (presets 20/30/50/60) for Sim/Real/Fondeo.
- [x] 2.5 `loadRiskSettingsIntoForm` populates each select; `handleSaveRiskSettings` persists `settings.gainFactor`.

### Phase 3: Tests
- [x] 3.1 `test/gain-factor.test.js` (new) — 39 passed.
- [x] 3.2 `test/contracts-ops-coupling.test.js` (new) — 13 passed.
- [x] 3.3 `test/risk-calculator.test.js` — gain-adjusted available + protections still hold.
- [x] 3.4 `test/trades-per-day-input.test.js` — stepper relocation structural checks.
- [x] 3.5 `test/contracts-override.test.js`, `test/stop-per-operation.test.js`, `test/risk-per-trade.test.js`, `test/budget-stop-default.test.js` — gain interaction + single `available` source.

### Phase 4: Verification
- [x] 4.1 All 9 touched harnesses pass (plus full non-rules suite).

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `js/store.js` | Modified | Added `todayGains`/`normalizeGainFactor`/`gainsAdjustedAvailable`; extended `dailyRiskUsage` (gain term + fields) and `getRiskSettings` (gainFactor); fixed `computeRisk.usedToday`; added `GAIN_FACTOR_DEFAULT` const; exported new helpers |
| `js/app.js` | Modified | Passed `gainFactor` into `dailyRiskUsage`; added "Ganancias hoy" row; wired Ajustes gainFactor select load/save |
| `index.html` | Modified | Moved Op/día stepper into "Tamaño" group; added "Ganancias hoy" row; added 3 gainFactor selects in Ajustes |
| `test/gain-factor.test.js` | Created | Pure helper tests (39) |
| `test/contracts-ops-coupling.test.js` | Created | Coupling tests (13) |
| `test/risk-calculator.test.js` | Modified | Gain + protection scenarios (+11) |
| `test/trades-per-day-input.test.js` | Modified | Relocation structural checks (+4) |
| `test/contracts-override.test.js` | Modified | usedToday true-loser-sum checks (+3) |
| `test/stop-per-operation.test.js` | Modified | Single `available` source + gain bind (+4) |
| `test/risk-per-trade.test.js` | Modified | Gain widens effectiveBudget/maxTicks (+5) |
| `test/budget-stop-default.test.js` | Modified | AUTO stop reflects gain-adjusted available (+3) |
| `test/ratio-target-preview.test.js` | Modified | Gain is an Ajustes setting; R/B untouched (+4) |

## Work Unit Evidence

### WU1 — pure gain math in `js/store.js`
| Evidence | Value |
|---|---|
| Focused test command + result | `node test/gain-factor.test.js` → **39 passed, 0 failed** (exit 0) |
| Runtime harness | `node test/gain-factor.test.js` — VM harness loads real `instruments.js` + `store.js`; this IS the runtime boundary for pure store math. Result: 39/39. |
| Rollback boundary | Revert `js/store.js`; delete `test/gain-factor.test.js` |

### WU2 — app wiring + markup (`js/app.js`, `index.html`)
| Evidence | Value |
|---|---|
| Focused test command + result | `node test/trades-per-day-input.test.js` → **37 passed, 0 failed**; `node test/contracts-override.test.js` → **72 passed, 0 failed** |
| Runtime harness | Same two integration harnesses (fake DOM + real extracted `renderRiskPanel`/`persistTradesPerDay`/`syncContracts`) — 37/0 and 72/0. `node --check js/app.js` → exit 0. |
| Rollback boundary | Revert `js/app.js`, `index.html`; revert `test/trades-per-day-input.test.js`, `test/contracts-override.test.js` |

### WU3 — coupling + protection regressions
| Evidence | Value |
|---|---|
| Focused test command + result | `node test/contracts-ops-coupling.test.js` → **13 passed, 0 failed** (exit 0) |
| Runtime harness | `node test/contracts-ops-coupling.test.js` (fake DOM + real `renderContractsHint`/`renderRiskPanel`) → 13/0; extended regression harnesses `risk-calculator` (73/0), `stop-per-operation` (40/0), `risk-per-trade` (63/0), `budget-stop-default` (53/0), `ratio-target-preview` (79/0) |
| Rollback boundary | Delete `test/contracts-ops-coupling.test.js`; revert the 5 extended test files |

## Deviations from Design

None — implementation matches design. The contracts ⇄ operations coupling was already realized by the existing `renderContractsHint` readout + `computeRisk` suggestion (gated by `contractsTouched` + `getMaxContracts`), per design Decision 1; WU3 pinned it with a dedicated harness rather than introducing new production code.

## Issues Found

None. The `computeRisk.usedToday` fix was applied in WU1 (store.js) per the design's "Implementation note (correctness)"; it is covered by the task 1.6 and the `contracts-override.test.js` structural + behavioral checks.

## Workload / PR Boundary

- Mode: chained PR slice (stacked-to-main)
- Work units: 3 (WU1 → WU2 → WU3), each committed locally
- Commits: `aadd912` (WU1), `f32419d` (WU2), `7418fbd` (WU3)
- Boundary: WU1 store helpers + test → WU2 UI wiring + markup + relocation/usedToday tests → WU3 coupling test + 5 regression extensions
- No push, no PRs (orchestrator coordinates delivery)

## Status

16/16 tasks complete. Ready for verify.
