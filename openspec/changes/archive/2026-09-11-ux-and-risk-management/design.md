# Design: ux-and-risk-management

## Technical Approach

Keep all new logic as pure functions on the existing IIFE globals (`Store`, `instruments.js`); `app.js` stays the DOM controller. Data stays additive: `trade.strategy` remains a string id and `state.settings` gains two per-account maps, so existing `E1..E5` trades and the `meta/settings` document keep working. `charts.js` changes only its strategy-chart ordering/labels. No build step, no new dependency, no new visual language — the just-applied dark tokens are reused.

## Architecture Decisions

| Decision | Choice | Alternatives rejected | Rationale |
|---|---|---|---|
| Strategy shape | `STRATEGIES = [{id,name,group}]` (13 entries: 8 named + `E1..E5`) + derived `STRATEGY_IDS` | ids + parallel `STRATEGY_META` map | Single source of truth matches spec `{id,name,group}`; only 4 call sites consume `STRATEGIES`, all inside this change |
| Strategy id | Stable slug (`vela-a-vela`); `trade.strategy` keeps the id | Store display names; remap `E1..E5` | Rename-safe; no ambiguous history rewrite; legacy values stay byte-identical |
| Label lookup | `Store.strategyLabel(id)`: named→name, legacy→`id + ' (sin clasificar)'`, unknown→raw id | None | One resolver for table/filter/search/charts; raw fallback never throws |
| Settings shape | Flat maps: `settings.riskPct = {Sim,Real,Fondeo}`, `settings.dailyTradeLimit = {…}` | Nested `settings.accounts[acct]` | `setSettings` stays a shallow top-level merge; per-account independence per spec |
| Risk balance | Current balance (`getAccountBalances()`) | Initial balance | Spec "Risk Budget From Current Balance"; reflects realized P&L |
| Risk input | Stop distance in points (number input) | Entry/stop prices | Formula is point-based; smaller scope; prices can be added later |
| Commission | Round-trip `INSTRUMENTS[inst].commission` added to risk/contract | Exclude | Spec "Risk Per Contract Includes Commission" |
| Balances | Chip sublabels (initial) + compact Registro card reusing `.preview` | Settings-only; chips-only | Spec "Initial Balance Visible at Entry"; no new visual language |
| Daily limit | Warn-only amber `.app-status.warn`; count `entryDate === todayISO()` for the selected account | Block submit; global count | Spec "Warn-Only"; per-account limit |
| Size metadata | Explicit `size` + `MICRO_PAIRS` | pointValue heuristic | `YM`/`MES` both have pointValue 5; heuristic is unreliable |

## Data Flow

```
instruments.js ──STRATEGIES/STRATEGY_IDS/INSTRUMENTS(size)/MICRO_PAIRS──▶ store.js
                                                                           │  pure: computeRisk, minBalanceForOneContract, strategyLabel, setSettings
index.html (form/panel) ◀── app.js (render) ◀── Store.subscribe ───────────┘
app.js: form + getAccountBalances() + getRiskSettings() → computeRisk → panel
```

## File Changes

| File | Action | Description |
|---|---|---|
| `js/instruments.js` | Modify | `STRATEGIES` object array, `STRATEGY_IDS`, `STRATEGY_GROUPS`, `DEFAULT_RISK_PCT=2`, `DEFAULT_DAILY_TRADE_LIMIT=3`, `size` per instrument, `MICRO_PAIRS` |
| `js/store.js` | Modify | `setSettings(patch)`, `getRiskSettings()`, pure `computeRisk`, `minBalanceForOneContract`, `strategyLabel`, `strategyGroup`, `getStrategies`; `seedSample` uses named ids |
| `js/app.js` | Modify | `nowTime()`; `resetForm` now-defaults; grouped strategy selects; risk panel + listeners; daily-limit warning; balance sublabels + capital card; Ajustes risk fields |
| `js/charts.js` | Modify | Strategy chart order via `STRATEGY_IDS`; labels via `Store.strategyLabel` |
| `index.html` | Modify | Chip sublabels; Registro capital/risk cards; Ajustes risk inputs |
| `css/styles.css` | Modify | `.app-status.warn`, `.chip-sub`, risk/suitability helpers (reuse tokens) |
| `js/firebase.js` | None | `meta/settings` read/subscribe/write plumbing already exists |

## Interfaces / Contracts

```js
// store.js (pure)
computeRisk({ balance, riskPct, instrument, stopDistance })
// -> { valid, reason, budget, riskPerContract, contracts, viable, minBalanceForOneContract }
// budget = (riskPct/100)*balance
// riskPerContract = stopDistance*pointValue + commission
// contracts = Math.floor(budget/riskPerContract)
// valid=false when inputs are missing/non-numeric or stopDistance<=0 (no suggestion)

minBalanceForOneContract({ instrument, stopDistance, riskPct })
// -> riskPerContract / (riskPct/100), or null when riskPct <= 0

setSettings(patch)   // shallow-merge top-level keys into state.settings, persist, return getSettings()
getRiskSettings()    // -> { Sim:{riskPct,dailyTradeLimit}, Real:{...}, Fondeo:{...} }, defaults 2/3
strategyLabel(id)    // named -> name; E1..E5 -> "E3 (sin clasificar)"; unknown -> id
```

Settings validation: `getRiskSettings` normalizes each value; negative/non-numeric `riskPct` falls back to a valid non-negative default; `dailyTradeLimit` of 0 is allowed.

## Testing Strategy

No runner (`strict_tdd: false`). Logic stays pure in `store.js`; verification is manual against each spec scenario.

| Layer | What to verify | Approach |
|---|---|---|
| Pure | `computeRisk` budget/contracts/viability; `minBalanceForOneContract`; `strategyLabel` fallback | Browser console with spec fixtures (10000/2/10pt/5/4 → 200/54/3; budget 40 → 0 + warning) |
| UI | now-defaults; grouped selects; balances; amber limit warning; Ajustes persistence | Manual pass over `risk-settings`, `entry-form-defaults`, `balance-visibility` scenarios |
| Regression | `E1..E5` still render/filter/chart; Firestore settings sync | Manual: seed a legacy trade, check filter + strategy chart legacy group |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

Additive only. `state.settings` gains `riskPct`/`dailyTradeLimit`; older code ignores them and missing keys fall back to 2/3. `trade.strategy` values and `E1..E5` are untouched (legacy group + raw-id fallback). The `bpt.journal.v1` / `meta/settings` shape is otherwise unchanged; no remap, no destructive delta.

## Open Questions

- [ ] Product: exit time defaulting to "now" may equal entry time — accepted; validation only rejects exit < entry.
- [ ] Out of scope: adding a visible strategy-name column to the trades table.
