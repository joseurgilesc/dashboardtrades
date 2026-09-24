```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:4bf27fc9e8597aef60623a327099b2d901964cfc464e3507222ae6d2f4489519
verdict: pass
blockers: 0
critical_findings: 0
requirements: 7/7
scenarios: 18/18
test_command: node test/gain-factor.test.js && node test/contracts-ops-coupling.test.js && node test/risk-calculator.test.js && node test/contracts-override.test.js && node test/trades-per-day-input.test.js && node test/stop-per-operation.test.js && node test/risk-per-trade.test.js && node test/budget-stop-default.test.js && node test/ratio-target-preview.test.js
test_exit_code: 0
test_output_hash: sha256:4d238658065c7efe7390e09fd8fca2da83ffd191b8a8db7aff37817f23774491
build_command: ""
build_exit_code: 0
build_output_hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

## Verification Report

**Change**: risk-calculator-gains-sizing
**Version**: N/A
**Mode**: Standard (strict_tdd = false)

**Executive summary**: PASS. All 16 apply tasks are complete and all 9 touched harnesses re-run green (469 passed, 0 failed). The gain-based risk factor, the Op/día relocation, and the contracts ⇄ operations coupling are implemented exactly as specified and designed. The design's correctness note is honored: `computeRisk.usedToday` now sources the true loser sum (`opts.dayLoss`), not `dailyBudget − available`. No scope creep detected — the ceiling, circuit breakers, small-account=1, and `getMaxContracts` remain untouched.

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 16 |
| Tasks complete | 16 |
| Tasks incomplete | 0 |

### Build & Tests Execution

**Build**: ➖ Not applicable — static site, no build step (`verify.build_command` is empty in `openspec/config.yaml`).

**Tests**: ✅ 469 passed / 0 failed (9 touched harnesses, exit 0 each).

| Command | Result |
|---------|--------|
| `node test/gain-factor.test.js` | ✅ 39 passed, 0 failed (exit 0) |
| `node test/contracts-ops-coupling.test.js` | ✅ 13 passed, 0 failed (exit 0) |
| `node test/risk-calculator.test.js` | ✅ 73 passed, 0 failed (exit 0) |
| `node test/contracts-override.test.js` | ✅ 72 passed, 0 failed (exit 0) |
| `node test/trades-per-day-input.test.js` | ✅ 37 passed, 0 failed (exit 0) |
| `node test/stop-per-operation.test.js` | ✅ 40 passed, 0 failed (exit 0) |
| `node test/risk-per-trade.test.js` | ✅ 63 passed, 0 failed (exit 0) |
| `node test/budget-stop-default.test.js` | ✅ 53 passed, 0 failed (exit 0) |
| `node test/ratio-target-preview.test.js` | ✅ 79 passed, 0 failed (exit 0) |

**Coverage**: ➖ Not available (no coverage tool configured).

### Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| risk-calculator: Daily Risk Budget and Usage | Budget and usage | `risk-calculator.test.js` [3] `used = sum of \|net\| of today losers` + `available = 2000 - 208.36` | ✅ COMPLIANT |
| risk-calculator: Daily Risk Budget and Usage | Winners and empty days | `gain-factor.test.js` [2] `todayGains sums only today winners` + [4] `no losers -> used 0` | ✅ COMPLIANT |
| risk-calculator: Daily Risk Budget and Usage | Gain-adjusted available | `gain-factor.test.js` [3] `300 - 200 + 50% of 100 = 150` | ✅ COMPLIANT |
| risk-calculator: Daily Risk Budget and Usage | Hard cap never exceeds the daily budget | `gain-factor.test.js` [3] `hard cap clamps to the daily budget` | ✅ COMPLIANT |
| risk-calculator: Daily Risk Budget and Usage | No-op when nothing was lost | `gain-factor.test.js` [3] `no-op when used = 0 (equals daily budget)` | ✅ COMPLIANT |
| risk-calculator: Daily Risk Budget and Usage | Only today's winners feed the gain term | `gain-factor.test.js` [2] `todayGains is account-scoped` / `other account has no Sim winners` | ✅ COMPLIANT |
| risk-calculator: Gain Bonus Never Overrides Protections | Circuit breaker still blocks | `risk-calculator.test.js` [6] `boosted available + 5% drawdown -> still blocked` / `3-loss streak -> still blocked` | ✅ COMPLIANT |
| risk-calculator: Gain Bonus Never Overrides Protections | Small account still one contract | `risk-calculator.test.js` [6] `boosted available + small account -> still 1 contract` | ✅ COMPLIANT |
| risk-calculator: Single Source for Gain-Adjusted Available | Both consumers agree | `stop-per-operation.test.js` [6] + `budget-stop-default.test.js` (f) `both consumers read the same available` | ✅ COMPLIANT |
| risk-calculator: Trades-Per-Day Selector Location | Relocation keeps id and wiring | `trades-per-day-input.test.js` [5] structural checks (id present, next to contracts, 4 refs) | ✅ COMPLIANT |
| risk-calculator: Contracts ⇄ Operations Coupling | Increasing contracts recalculates operations | `contracts-ops-coupling.test.js` [2] `66 contracts -> 3 op/día` | ✅ COMPLIANT |
| risk-calculator: Contracts ⇄ Operations Coupling | Coupling respects the daily budget | `contracts-ops-coupling.test.js` [4] `300 contracts -> 0 op/día (budget-bounded)` | ✅ COMPLIANT |
| risk-settings: Per-Account Risk Settings | Independent values per account | `gain-factor.test.js` [5] `Sim gainFactor 30` + `riskPct still normalized alongside` | ✅ COMPLIANT |
| risk-settings: Per-Account Risk Settings | Defaults when unset | `gain-factor.test.js` [5] `default Sim/Real/Fondeo gainFactor 50` | ✅ COMPLIANT |
| risk-settings: Per-Account Risk Settings | Gain factor independent per account | `gain-factor.test.js` [5] `Sim 30` / `Real 45 -> 50` / `Fondeo 60` | ✅ COMPLIANT |
| risk-settings: Gain Factor Normalization | Valid preset preserved | `gain-factor.test.js` [1] `preset 60 preserved` | ✅ COMPLIANT |
| risk-settings: Gain Factor Normalization | Invalid value falls back to default | `gain-factor.test.js` [1] `45 falls back to 50` / `non-numeric falls back to 50` | ✅ COMPLIANT |
| risk-settings: Gain Factor Normalization | Missing value falls back to default | `gain-factor.test.js` [1] `missing falls back to 50` | ✅ COMPLIANT |

**Compliance summary**: 18/18 scenarios compliant (7/7 requirements).

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| `computeRisk.usedToday` sources true loser sum | ✅ Implemented | `js/store.js:1417` — `result.usedToday = dayLoss` (`Math.max(0, numOr(opts.dayLoss, 0))`), not `dailyBudget − available`. Confirmed by `contracts-override.test.js` [7]. |
| Gain term applied once in `dailyRiskUsage.available` | ✅ Implemented | `js/store.js:2020-2025` — `available = gainsAdjustedAvailable({...})`; `todayGains` computed in the same pass (lines 2000-2013). |
| Single `available` source for `computeRisk` + `budgetStopTicks` | ✅ Implemented | `js/app.js:1986` and `:2053` both pass `usage.available` from the same `Store.dailyRiskUsage` call; `riskBudget` (`store.js:1183-1186`) consumes it. |
| `normalizeGainFactor` presets {20,30,50,60}, default 50 | ✅ Implemented | `js/store.js:537-541`. |
| Per-account `gainFactor` in `getRiskSettings` | ✅ Implemented | `js/store.js:548-562` — `gainMap` sibling of `riskMap`/`limitMap`. |
| Ajustes gainFactor select (presets) + load/save | ✅ Implemented | `index.html:783-809`; `js/app.js:3168-3264` (load + persist). |
| Op/día stepper relocation (id + 4 refs) | ✅ Implemented | `index.html:260-269` — stepper inside "Tamaño" group, directly after `#riskContracts`; id `#riskTradesPerDayInput` retained; refs at `js/app.js:1868/1953/2779/3285` + reset list `:3939`. |

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| D1 — Contracts is the single coupling master; Op/día stays an editable sizing divisor | ✅ Yes | `contracts-ops-coupling.test.js` [1][5] confirm typed contracts never overwritten, `contractsTouched` gating, `getMaxContracts` caps suggestion only. |
| D2 — Gain term lives in `dailyRiskUsage.available` only (Approach A) | ✅ Yes | `js/store.js:2020-2025`; consumers unchanged. |
| D3 — `settings.gainFactor = {Sim,Real,Fondeo}`, additive/optional, no migration | ✅ Yes | `getRiskSettings` defaults to 50 on absence. |
| D4 — Ops readout divides raw `dailyBudget`; gain widens `available` for sizing only | ✅ Yes | `renderContractsHint` maxOps uses `dailyBudget`; AUTO stop reflects gain-adjusted `available` (`budget-stop-default.test.js` (f)). |
| Correctness note — `usedToday` = true loser sum | ✅ Yes | `js/store.js:1414-1417` + `contracts-override.test.js` [7]. |

### Issues Found

**CRITICAL**: None.

**WARNING**: None.

**SUGGESTION**:
- (Informational) The "cupo por operación" advisory threshold still reads `perTradeBudget`, not `effectiveBudget` — deferred per design "Open Questions", out of scope. No action required for this change.

### Scope-Creep Check

| Out-of-scope item | Status |
|-------------------|--------|
| Raising the ceiling above `dailyBudget` | ✅ Untouched — `available = min(dailyBudget, …)` hard cap verified. |
| Circuit breakers (≥5% drawdown / 3-loss streak) | ✅ Untouched — still force 0 contracts (`store.js:1380-1388`). |
| Small-account=1 | ✅ Untouched — still forces 1 contract (`store.js:1388-1390`). |
| `getMaxContracts` | ✅ Untouched — still caps the suggestion only, never `computeRisk`/hint. |

### Next Recommended

`archive` (sdd-archive) — the change is fully implemented, verified, and ready to sync delta specs into the main spec tree.

### Risks

- **Low**: `settings.gainFactor` is additive; Firestore rows without the field fall back to 50 via `normalizeGainFactor`. Rollback = revert `js/store.js`, `js/app.js`, `index.html`.

### Skill Resolution

`sdd-verify` (this phase) → next phase `sdd-archive`.

### Verdict

**PASS** — 16/16 tasks complete; 9/9 harnesses green (469 passed, 0 failed); 7/7 requirements and 18/18 scenarios compliant; design and correctness note honored; no scope creep.
