# Tasks: ux-and-risk-management

## Review Workload Forecast

Estimated changed lines: ~730–880. Split: PR 1 catalog → PR 2 settings/calculator → PR 3 defaults/balances/limit → PR 4 risk-discipline → PR 5 stop/drawdown warnings.

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High
```

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Strategy catalog + labels/charts/selects | PR 1 | Browser console: `Store.strategyLabel('E3')`, `STRATEGY_IDS.length` | `npx serve .` → login → seed → strategy chart | Revert catalog + call-site edits; legacy ids untouched |
| 2 | Risk settings + calculator + Ajustes UI | PR 2 | Browser console: `Store.computeRisk({balance:10000,riskPct:2,instrument:'MES',stopDistance:10})` | `npx serve .` → Registro risk panel + Ajustes save/reload | Revert settings keys + panel; `state.settings` additive |
| 3 | Entry defaults, balances, daily limit | PR 3 | Browser console: `nowTime()` + today-count check | `npx serve .` → open/reset form, inspect chips | Revert app/index/css edits; no persisted change |
| 4 | Risk bounds + R/R + recovery | PR 4 | `Store.computeRR({plannedRisk:100,target:150})`, `Store.recoveryPct(0.5)` | `npx serve .` → risk panel | Revert store helpers + panel edits |
| 5 | Stop discipline + drawdown/streak | PR 5 | `Store.stopDiscipline(trades,'Sim')`, `Store.intradayDrawdown('Sim')` | `npx serve .` → badges + banner | Revert discipline helpers + app/css |

## Phase 1: Foundation — reference data + pure logic

- [x] 1.1 `js/instruments.js`: replace `STRATEGIES` with 13 `{id,name,group}` objects (8 named + `E1..E5` legacy); add `STRATEGY_IDS`, `STRATEGY_GROUPS`, `DEFAULT_RISK_PCT=2`, `DEFAULT_DAILY_TRADE_LIMIT=3`.
- [x] 1.2 `js/instruments.js`: add `size` (`micro`|`full`) to every `INSTRUMENTS` entry and a `MICRO_PAIRS` map (`NQ`→`MNQ`, `ES`→`MES`, `YM`→`MYM`, `6E`→`M6E`, `CL`→`MCL`, `FDAX`→`FDXM`).
- [x] 1.3 `js/store.js`: add `strategyLabel(id)` (named→name, legacy→`id + ' (sin clasificar)'`, unknown→raw id), `strategyGroup(id)`, `getStrategies()`.
- [x] 1.4 `js/store.js`: add `setSettings(patch)` shallow-merge + persist + return; add `getRiskSettings()` normalizing per-account `riskPct`/`dailyTradeLimit` (defaults 2/3; 0 limit allowed).
- [x] 1.5 `js/store.js`: add pure `computeRisk({balance,riskPct,instrument,stopDistance})` and `minBalanceForOneContract(...)` per design contract; export both.
- [x] 1.6 `js/store.js`: update `seedSample` strategy values to named ids.
- [x] 1.7 `js/instruments.js`: add `RISK_PCT_MIN/MAX/HARD_MAX`, `DEFAULT_MIN_RR`, `DAILY_DD_WARN_PCT`, `STREAK_WARN`.
- [x] 1.8 `js/store.js`: add `clampRiskPct` ([0.5,3], flag), `computeRR({plannedRisk,target})`; normalize `minRR`.
- [x] 1.9 `js/store.js`: add `recoveryPct`, `stopDiscipline`, `intradayDrawdown`, `losingStreak`; normalize `trade.stop`.
- [x] 1.10 `js/instruments.js` + `index.html` + `js/app.js` + `css/styles.css`: add per-instrument reference metadata (`name`, `exchange`, `hours`, `tick`, `size`, `note`) and a Registro info button/panel showing name, exchange, hours, point value, tick, commission, size and note, reusing the dark design tokens.

## Phase 2: Core implementation — UI wiring

- [x] 2.1 `js/app.js`: add `nowTime()`; `resetForm` sets entry/exit date+time to now.
- [x] 2.2 `js/app.js`: build grouped strategy `<optgroup>`s (scalping→swing→legacy) in `initSelects`; label options via `Store.strategyLabel`; apply to `filterStrategy`; make `matchesSearch` match label text.
- [x] 2.3 `js/charts.js`: strategy chart order from `STRATEGY_IDS`, labels via `Store.strategyLabel`.
- [x] 2.4 `index.html` + `js/app.js`: add Registro risk panel (contracts, risk $, viability warning); wire inputs to `computeRisk`.
- [x] 2.5 `index.html` + `js/app.js`: add Ajustes per-account risk %/daily-limit fields; load via `getRiskSettings`, save via `setSettings`.
- [x] 2.6 `index.html` + `js/app.js`: chip sublabels showing initial balance; compact Registro capital card (initial/current/total).
- [x] 2.7 `js/app.js`: count today's trades for the selected account; show amber warn-only daily-limit message; never disable submit.
- [x] 2.8 `css/styles.css`: add `.app-status.warn`, `.chip-sub`, risk/suitability helpers reusing existing tokens.
- [x] 2.9 `index.html` + `js/app.js`: Registro target/stop inputs; persist `trade.target`/`stop`/`plannedRisk`.
- [x] 2.10 `js/app.js`: risk panel shows R/R (warn `< minRR`) + `recoveryPct`; keep expectancy.
- [x] 2.11 `js/app.js` + `css/styles.css`: flag rows without stop; summary missing/BE/trailing.
- [x] 2.12 `js/app.js`: amber warn-only at ≥5% drawdown or 3 losses; never block submit.
- [x] 2.13 `index.html` + `js/app.js`: Ajustes risk-% warns above 2%, clamps above 3%; add min-RR field.

## Phase 3: Verification (manual)

- [ ] 3.1 Verify `strategy-catalog`: 8 named, group order, `E3`/`unknown-code` fallback, id persisted, chart legacy entry.
- [ ] 3.2 Verify `risk-settings`: per-account independence, defaults 2/3, patch preserves keys, negative rejected, 0 limit stored.
- [ ] 3.3 Verify `entry-form-defaults`: four fields now at open/reset; stale replaced; override kept; invalid rejected.
- [ ] 3.4 Verify `balance-visibility`: initial+current+total shown; no-trade=initial; update reflected; no NaN.
- [ ] 3.5 Verify `risk-calculator` (BPT): 10000/3%/3 trades/8 ticks ES → 300 daily / 100 per-trade / 100 P_m / 1 contract; daily-budget division → 3; per-trade budget below P_m → 0 + warning; missing input incomplete; size metadata present.
- [ ] 3.6 Verify risk %: 1.5 ok; 4→3 + warning; <0.5 clamps; R/R 100/300 ok, 100/150 warns; expectancy shown.
- [ ] 3.7 Verify recovery 0.5→100%, 0→0%; stop flagged/present; BE/trailing counts.
- [ ] 3.8 Verify ≥5% drawdown + 3-loss warn, save not blocked; scaling 10000+2000→240.

## Phase 4: Daily scaling plan (`daily-scaling-plan`, new slice)

- [x] 4.1 `js/instruments.js` + `js/store.js`: add pure `dailyScalingPlan({capital,riskPct,rr,days})` → `{valid,reason,days,rr,clampedDays,rows:[{day,startCapital,risk,gain,endCapital}],finalCapital}`, compounding `capital_d = capital_{d-1} + (riskPct/100)*capital_{d-1}*rr`; defaults `rr=2`, `days=20`, horizon capped at `SCALING_DAYS_MAX=365`; export from `Store`.
- [x] 4.2 `index.html` + `js/app.js` + `css/styles.css`: add the "Plan de escalado diario" Dashboard card — inputs (capital, % riesgo diario, R/B, nº de días), a "Calcular" action, and a `Día | Capital inicial | Riesgo | Ganancia | Capital final` table reusing the dark tokens; defaults seeded from the selected account's current balance and risk %.

## Phase 5: BPT risk calculator (aligns `computeRisk` to the BPT method)

- [x] 5.1 `js/store.js`: rework pure `computeRisk` to the BPT method — `tickValue = tick × pointValue`, `P_m = stopTicks × tickValue`, `perTradeRiskPct = dailyRiskPct / tradesPerDay` (missing → default 3, `0`/negative → guarded to 1), `perTradeRisk$ = perTradeRiskPct × capital`, `contracts = floor(perTradeRisk$ / P_m)`; commission kept separate and never folded into `P_m`; return shape additive (`dailyBudget`/`budget`, `perTradeRisk`, `perTradeRiskPct`, `tickValue`, `stopTicks`, `pm`/`riskPerContract`, `commission`) with the viability flag when one contract exceeds the per-trade budget; `minBalanceForOneContract` aligned to ticks; legacy `stopDistance` (points) converted via `tick`.
- [x] 5.2 `index.html` + `js/app.js`: Registro risk panel works in ticks — stop-in-ticks input, plus `Capital`, `% Riesgo diario`, `Operaciones al día`, `Presupuesto diario`, `Valor del tick`, `P_m`, `Riesgo por operación`, `Contratos`, separate `Comisión` and `Riesgo de la posición`; labels/inputs updated in place reusing the dark tokens; a recorded stop price is converted to ticks (`|entry − stop| / tick`) and still wins over the tick input.

## Phase 6: Fast entry (PR 7)

- [x] 6.1 `js/store.js` + `js/app.js`: persist the last-used `account`/`instrument`/`strategy`/`direction`/`emotion` under `settings.lastEntry` (pure `getLastEntry`/`saveLastEntry`) and prefill them on open/reset; never clobber a value the user is editing.
- [x] 6.2 `js/app.js`: default the `contracts` field to the risk calculator's suggested contracts for the selected account/instrument while the field is untouched; stop auto-filling once the user edits it.
- [x] 6.3 `index.html` + `js/app.js` + `js/store.js`: add a "Duplicar último trade" action (`Store.getLastTrade`) that copies the last saved trade's setup fields (account, instrument, strategy, direction, emotion, contracts, target/stop) into the form as a NEW trade (new id, no tradeNumber/exit), ready to edit.
- [x] 6.4 `index.html` + `css/styles.css`: move `notes`, `target` and `plannedRisk` behind a "Más opciones" disclosure, collapsed by default, keeping the primary fields visible.
