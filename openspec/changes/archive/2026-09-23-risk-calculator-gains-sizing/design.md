# Design: risk-calculator-gains-sizing

## Technical Approach

Additive gain-based risk factor + a sizing-control relocation, per proposal Approach A. Three pure `store.js` helpers (`todayGains`, `normalizeGainFactor`, `gainsAdjustedAvailable`) feed a single gain term applied **once** inside `dailyRiskUsage.available`, so `computeRisk` and `budgetStopTicks`/`resolveInstrumentConfig` — which already consume `available` via `min(perTradeBudget, available)` — need **no math change** and can never drift. `gainFactor` persists as an additive per-account map. The Op/día stepper moves into the calculator panel next to contracts, keeping id `#riskTradesPerDayInput` and all 4 references. The contracts ⇄ operations coupling is realized by the existing `renderContractsHint` readout (contracts → ops) plus the `computeRisk` suggestion prefill (ops → contracts), gated by `contractsTouched`.

## Architecture Decisions

### Decision 1: Precedence rule for contracts ⇄ operations

| option | tradeoff | decision |
|---|---|---|
| Contracts is the master; Op/día becomes a derived readout | Loses the sizing divisor + daily-limit persistence dual role | ✗ |
| Two equal masters (both write back) | Oscillation / fight between inputs | ✗ |
| Contracts master; Op/día stays an editable **sizing divisor**; coupling is readout + gated suggestion | Preserves dual role; one deterministic direction per edit | ✓ |

**Choice**: `#contracts` is the single master for the coupling. `#riskTradesPerDayInput` **stays editable** as the sizing divisor (feeds `perTradeBudget = dailyBudget/tradesPerDay` and the persisted `dailyTradeLimit`), and is *not* a second coupling master.

- **contracts → operations**: `renderContractsHint` recomputes `maxOps = P_m>0 && n>0 ? floor(dailyBudget/(n·P_m)) : 0` (already present), rendered as "N op/día". Never writes back to the Op/día input.
- **operations → contracts**: changing Op/día changes `perTradeBudget` → `effectiveBudget` → suggested `contracts = floor(effectiveBudget/P_m)`, prefilled **only while `contractsTouched === false`**, then clamped by `getMaxContracts`.

**Edge cases**: empty/invalid `#contracts` → hint shows `—` (n≤0 guard), no write-back; empty Op/día → `tradesFallback` (≥1) used without writing back (transient-edit guard); `contractsTouched=true` → only the readout direction runs; `getMaxContracts` caps only the suggestion, never `computeRisk` or the hint; blocked/small-account return 0/1 before any floor, so the gain term cannot resurrect them.

### Decision 2: Gain term lives in `dailyRiskUsage.available` only

| option | tradeoff | decision |
|---|---|---|
| Inline in `renderRiskPanel` | UI-only math, untestable in VM harness, drifts | ✗ |
| New helper at call site (Approach C) | UI assembles value; panel grows | ✗ |
| Inside `dailyRiskUsage.available` (Approach A) | One source; both consumers unchanged | ✓ |

**Choice**: Approach A. `dailyRiskUsage` gains optional `gainFactor` (default 50), computes `todayGains` in the same pass, and returns gain-adjusted `available` plus new `todayGains`/`gainFactor` fields. `computeRisk` and `budgetStopTicks` read the same `usage.available` passed from `renderRiskPanel` (lines 1979, 2046) — no drift.

### Decision 3: `gainFactor` persistence shape

**Choice**: `settings.gainFactor = { Sim, Real, Fondeo }`, sibling of `riskPct`/`dailyTradeLimit`, read in `getRiskSettings`, normalized by `normalizeGainFactor` (presets {20,30,50,60}, default 50). Additive/optional — no Firestore migration; absence falls back to 50.

### Decision 4: Coupling bound + gain interaction

**Choice**: the ops readout (`maxOps`) keeps dividing the raw `dailyBudget` (spec's "within the daily budget"); the gain term widens `available` for sizing only. The Ajustes instrument-config AUTO stop keeps `dailyBudget`-based defaults (no live gains), so the calculator and the Ajustes table stay consistent in scope.

## Data Flow

```
dailyRiskUsage(account, riskPct, balance, today, gainFactor)
  ├─ used      = Σ |net| of today's losers
  ├─ todayGains = Σ net  of today's winners (net > 0)
  └─ available = min(dailyBudget, dailyBudget − used + gainFactor/100·todayGains)
                      │
        ┌─────────────┴──────────────┐
        ▼                            ▼
  computeRisk(available)       resolveInstrumentConfig/budgetStopTicks(available)
        │                            │
  contracts = floor(effectiveBudget/P_m)   AUTO stop = floor(effectiveBudget/tickValue)
        │
  (gated by contractsTouched + getMaxContracts) ──► renderContractsHint: maxOps = floor(dailyBudget/(n·P_m))
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `js/store.js` | Modify | Add `todayGains`, `normalizeGainFactor`, `gainsAdjustedAvailable`; extend `dailyRiskUsage` (gain term + `todayGains`/`gainFactor` fields) and `getRiskSettings` (gainFactor); export new helpers |
| `js/app.js` | Modify | Pass `gainFactor` into `dailyRiskUsage`; surface "Ganancias hoy" row; wire Ajustes gainFactor selector + persist in `btnSaveRiskSettings`/`loadRiskSettingsIntoForm`; ensure `computeRisk.usedToday` reads true loser sum (see risk below) |
| `index.html` | Modify | Move `#riskTradesPerDayInput` stepper (55–62) into calculator "Tamaño" group next to contracts; add gainFactor selectors in Ajustes |
| `test/gain-factor.test.js` | Create | Pure helpers: `todayGains`, `normalizeGainFactor`, `gainsAdjustedAvailable` |
| `test/contracts-ops-coupling.test.js` | Create | Precedence + both recalculation directions + bounds |
| `test/risk-calculator.test.js` etc. | Modify | Gain scenarios + relocation structural checks |

## Interfaces / Contracts

```js
todayGains({ account, today, trades? }) → number        // Σ net of today's net>0 trades, account-scoped, rounded
normalizeGainFactor(value) → 20|30|50|60               // default 50
gainsAdjustedAvailable({ dailyBudget, used, todayGains, gainFactor }) → number
// roundMoney(min(dailyBudget, dailyBudget - used + (gainFactor/100)*todayGains))
dailyRiskUsage(inputs) → { ..., todayGains, gainFactor, available } // available now gain-adjusted
getRiskSettings() → { [acct]: { riskPct, dailyTradeLimit, gainFactor } }
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (store) | `todayGains`/`normalizeGainFactor`/`gainsAdjustedAvailable` hard cap, negative/zero; `available` formula; no-op when `used=0` | `node test/gain-factor.test.js` |
| Unit (store) | Circuit breakers + small-account still win with boosted `available` | extend `risk-calculator.test.js` |
| Integration (VM) | Relocation keeps id + 4 refs; touched semantics + Ajustes mirror | extend `trades-per-day-input.test.js` |
| Integration (VM) | contracts→ops and ops→contracts bounded by `dailyBudget`/`P_m`; `contractsTouched` gating; `getMaxContracts` cap | `test/contracts-ops-coupling.test.js` |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No migration required. `settings.gainFactor` is additive; `normalizeGainFactor` falls back to 50 on absence, so persisted Firestore data stays valid with or without the field. Rollback = revert the three files.

## Open Questions

- [ ] Whether the "cupo por operación" warning threshold should read `effectiveBudget` instead of `perTradeBudget` (exploration Q4 — out of current scope; deferred).

### Implementation note (correctness)

`computeRisk` derives `usedToday = dailyBudget − available` (store.js:1398). Once `available` includes the gain term, this under-reports the true loser sum when gains exist. Apply phase must source `usedToday` from the true loser sum (the `opts.dayLoss`/guard value, already passed in) so the field stays truthful. The displayed "Usado hoy" already reads `usage.used` directly (app.js:2123) and is unaffected.
