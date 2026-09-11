# Proposal: ux-and-risk-management

## Intent
Six improvements to the static journal: surface balances at entry, default date/time to now, add per-account max risk % and daily limit, replace opaque `E1..E5` codes with 8 named BPT strategies, and add a risk/contracts calculator.

## Scope
### In Scope
- Show per-account initial + current balances at entry.
- Entry/exit date/time default to now (`nowTime()`).
- Per-account `riskPct` (default 2) and `dailyTradeLimit` (default 3) in `state.settings` / `meta/settings`; add `Store.setSettings(patch)`.
- Daily limit warn-only: amber message at/over limit; never blocks submit.
- Strategy catalog: 8 BPT strategies `{ id, name, group }`; groups `scalping` (first), `swing`, `legacy` (E1..E5); update `charts.js`.
- Risk panel in Registro: contracts, risk $, viability warning; `size` (micro/full) on `INSTRUMENTS`.

### Out of Scope
- Remapping `E1..E5`, order execution, backend, build step.

## Capabilities
### New Capabilities
- `risk-settings`: per-account max risk % and daily limit persistence.
- `strategy-catalog`: BPT identities, groups, labels, legacy fallback, charts.
- `entry-form-defaults`: entry/exit date/time default to now.
- `balance-visibility`: per-account initial/current balances at entry.
- `risk-calculator`: contracts/risk $ computation, viability warning, suitability.

### Modified Capabilities
- None (no specs exist under `openspec/specs/`).

## Approach
Adopt exploration 1a+2a+3a+4a+5a. Keep pure functions in `store.js` (`computeRisk`, `minBalanceForOneContract`, `strategyLabel`). `trade.strategy` stays a string id with raw-id fallback. Budget = `(riskPct/100 × currentBalance)`; `contracts = floor(budget / (stopDistance × pointValue + commission))`. Settings are additive.

## Affected Areas
| Area | Impact | Description |
|------|--------|-------------|
| `js/instruments.js` | Modified | Strategy objects, `size`, defaults |
| `js/store.js` | Modified | `setSettings`, risk helpers, lookup, seed/CSV |
| `index.html`, `js/app.js` | Modified | Risk panel, settings fields, balances, selects |
| `js/charts.js` | Modified | Map strategy ids to names/order |
| `css/styles.css` | Modified | `.app-status.warn`, risk styles |

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Legacy `E1..E5` break | Med | `legacy` group + raw-id fallback; no remap |
| `charts.js` breaks on object `STRATEGIES` | High | Update chart in same change |
| No test runner | High | Pure functions + manual checklist |

## Rollback Plan
Revert the merge; static redeploy restores the prior commit. New keys are additive and ignored by older code; trades keep `E1..E5`. Persisted impact: `state.settings` gains per-account `riskPct`/`dailyTradeLimit`; `bpt.journal.v1` is otherwise unchanged.

## Dependencies
- None external; existing `meta/settings` plumbing.

## Success Criteria
- [ ] Balances visible in Registro.
- [ ] Entry and exit date/time default to now.
- [ ] Risk %/daily limit persist per account.
- [ ] Daily limit warns at/over limit, never blocks save.
- [ ] 8 strategies grouped, `E1..E5` under `legacy`; charts work.
- [ ] Risk panel warns when 1 contract exceeds budget.
