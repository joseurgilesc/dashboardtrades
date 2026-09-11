# Apply Progress: ux-and-risk-management

**Mode**: Standard (no app test runner; `strict_tdd: false`)
**Artifact store**: hybrid (file + Engram)
**Delivery strategy**: `ask-on-risk` → resolved to **chained PR slice**; Chain strategy **stacked-to-main**
**Attempt tokens**:
- PR 1 — `sha256:c88ce505…`
- PR 2 — `sha256:763a47618ef6ced5c237750c7c690118bf2a172d8bdef357a38202434f26b3f9`
- PR 3 — `sha256:414f8ef3aa924adaa78ebb1e760331b08920cd02327628009d33e7fbd0ae0258`
- PR 4 — `sha256:3e7954e01bfbea1cb8b0fe413c7994caa409187f28df451f7a56038d2c7ff58b`
- PR 5 (this batch) — `sha256:d079a8b292f282c5a7d973b74379d4759b461e946c6c3973e6564a08438b722e`
**Batches**:
- **PR 1** — Phase 1 Foundation (tasks 1.1–1.6) + instrument-info (1.10).
- **PR 2** — risk bounds/R-R/recovery/discipline pure logic (1.7–1.9) + Ajustes risk settings UI (2.5, 2.13) + Registro risk calculator panel (2.4, 2.10).
- **PR 3** — entry now-defaults (2.1) + balances visibility (2.6, 2.8) + daily-limit warn-only (2.7) + stop/drawdown banners (2.11, 2.12).
- **PR 4** — Registro target/stop/planned-risk inputs + persistence + live risk-panel feed (2.9); 2.2/2.3 confirmed complete.
- **PR 5** (this batch) — new `daily-scaling-plan`: pure `Store.dailyScalingPlan` compounding projection (4.1) + "Plan de escalado diario" Dashboard panel (4.2).

## Completed Tasks (cumulative)

### PR 1 batch

- [x] 1.1 `js/instruments.js`: `STRATEGIES` → 13 `{id,name,group}` objects (8 named + `E1..E5` legacy); added `STRATEGY_IDS`, `STRATEGY_GROUPS`, `DEFAULT_RISK_PCT=2`, `DEFAULT_DAILY_TRADE_LIMIT=3`.
- [x] 1.2 `js/instruments.js`: added `size` (`micro`|`full`) to all 12 `INSTRUMENTS` entries and `MICRO_PAIRS` (`NQ→MNQ`, `ES→MES`, `YM→MYM`, `6E→M6E`, `CL→MCL`, `FDAX→FDXM`).
- [x] 1.3 `js/store.js`: added `strategyLabel(id)` (named→name, legacy→`id + ' (sin clasificar)'`, unknown→raw id), `strategyGroup(id)`, `getStrategies()`.
- [x] 1.4 `js/store.js`: added `setSettings(patch)` (shallow-merge + persist + return) and `getRiskSettings()` (per-account normalization, defaults 2/3, 0 limit allowed).
- [x] 1.5 `js/store.js`: added pure `computeRisk({balance,riskPct,instrument,stopDistance})` and `minBalanceForOneContract(...)`; both exported.
- [x] 1.6 `js/store.js`: `seedSample` strategies now use named ids.
- [x] 1.10 `js/instruments.js` + `index.html` + `js/app.js` + `css/styles.css`: per-instrument metadata plus a Registro **Info** button/panel reusing the dark tokens.

Catalog-coherence call sites (PR 1): `js/charts.js` strategy chart keyed/ordered/labelled by id; `js/app.js` grouped `<optgroup>`s + label-aware search; `js/store.js` CSV read-only `strategyName` column.

### PR 2 batch

- [x] 1.7 `js/instruments.js`: added `RISK_PCT_MIN=0.5`, `RISK_PCT_MAX=2`, `RISK_PCT_HARD_MAX=3`, `DEFAULT_MIN_RR=2`, `DAILY_DD_WARN_PCT=5`, `STREAK_WARN=3` (+ header doc).
- [x] 1.8 `js/store.js`: added pure `clampRiskPct(value)` (band `[0.5, 3]`, `warned` above 2 %, `clamped` above 3 % / below 0.5 %, `valid:false` for negative/non-numeric), `clampDailyLimit(value)` (0 allowed), `getMinRR()` (normalizes `settings.minRR`, default 2), and `computeRR({plannedRisk,target,minRR})`; all exported.
- [x] 1.9 `js/store.js`: added pure `recoveryPct(lossPct)` (`lossPct/(1-lossPct)`, 0.5→1, ≥1→Infinity), `stopDiscipline(trades,account)` (`{total,withStop,missingStop,missing,breakEven,trailing}`), `intradayDrawdown(trades,account)` (`{dollars,pct,warned,trades}`), `losingStreak(trades,account)` (`{count,warned}`); `sanitizeTrade` now normalizes `trade.stop` (missing → 0).
- [x] 2.4 `index.html` + `js/app.js`: added the Registro **Calculadora de riesgo** card (stop-distance and target inputs; budget, risk per contract, suggested contracts, total risk, R/R, recovery) wired to `Store.computeRisk`; shows a viability warning when even one contract exceeds the budget.
- [x] 2.5 `index.html` + `js/app.js`: added the Ajustes **Riesgo y límites** card (per-account risk % and daily limit + min-RR); loads via `Store.getRiskSettings()`/`getMinRR()`, persists via `Store.setSettings({riskPct, dailyTradeLimit, minRR})`.
- [x] 2.10 `js/app.js`: risk panel renders R/R (`target / totalRisk`) with an amber `.warn` class below the configured minimum and the non-linear `recoveryPct` (from planned risk / current balance); expectancy KPI untouched.
- [x] 2.13 `index.html` + `js/app.js`: Ajustes risk-% warns above 2 % (`above-recommended`), clamps above 3 % (`hard-max`) and below 0.5 % (`below-min`); min-RR field added. Invalid/negative/empty input keeps the stored value (never persisted).

### PR 3 batch

- [x] 2.1 `js/app.js`: added `nowTime()` (local `HH:MM`); `resetForm` now defaults **entry and exit** date/time to the current date/time on every reset, so a save never leaves a stale time behind.
- [x] 2.6 `index.html` + `js/app.js`: added a `.chip-sub` line to every header chip; `renderBalances` writes each account's **initial** balance under its current balance and the combined initial total under the Total chip (chips already carry current balances + combined current total).
- [x] 2.7 `js/app.js` + `js/store.js`: added pure `countTradesToday(a,b)` and `dailyLimitStatus(account)` (`{account,count,limit,exceeded}`); `renderEntryWarnings` shows a non-blocking amber `.app-status.warn` at/over the selected account's `dailyTradeLimit`; submit is never disabled.
- [x] 2.8 `css/styles.css`: added `.app-status.warn`, `.app-status-inline`, `.chip-sub`, `.badge-warn`, `.table-discipline` (reusing `--amber`, `--text-faint`, `--text-muted`).
- [x] 2.11 `js/app.js` + `css/styles.css`: rows whose normalized `trade.stop` is not positive get an amber `Sin stop` badge; a `.table-discipline` line reports missing / Break-Even / Trailing-stop counts (amber when any stop is missing).
- [x] 2.12 `js/app.js`: `renderEntryWarnings` shows an amber `.risk-warning` banner for ≥5 % intraday drawdown and/or ≥3 consecutive losses (via `Store.intradayDrawdown`/`Store.losingStreak`); never blocks submit.

### PR 4 batch (this slice)

- [x] 2.2 `js/app.js`: confirmed complete from PR 1 — grouped `<optgroup>`s in `initSelects` (both `strategy` and `filterStrategy`) in `STRATEGY_GROUPS` order (scalping→swing→legacy), labels via `Store.strategyLabel`, and `matchesSearch` includes the resolved label. Marked `[x]` now that the boundary is no longer pending.
- [x] 2.3 `js/charts.js`: confirmed complete from PR 1 — the strategy chart keys by `t.strategy` and orders via `STRATEGY_IDS` (`charts.js` ~L349–350), labels via `Store.strategyLabel` (~L68). Marked `[x]`.
- [x] 2.9 `index.html` + `js/app.js` + `js/store.js`: added three optional trade-form fields — `stop` (precio), `target` (USD reward), `plannedRisk` (USD). `readForm` reads them, `handleEdit` populates them, `resetForm` clears them, and `wireEvents` re-renders the panel live. `sanitizeTrade` now normalizes `trade.target` / `trade.plannedRisk` (missing → 0) alongside the existing `trade.stop`, so the values persist through `addTrade`/`updateTrade`/JSON import and reach Firestore via the unchanged `tradeData` copy. The risk panel derives the stop distance from `|entry − stop|` when a stop price is recorded, and uses the recorded `plannedRisk` / `target` for R/R in place of the computed total risk and the calculator's own target input. The `Sin stop` badge (reading `trade.stop > 0`) clears automatically for trades that record a stop.

### PR 5 batch (this slice)

- [x] 4.1 `js/instruments.js` + `js/store.js`: added the scaling-plan defaults (`DEFAULT_SCALING_RR=2`, `DEFAULT_SCALING_DAYS=20`, `SCALING_DAYS_MAX=365`) and the pure `dailyScalingPlan({capital,riskPct,rr,days})`. It compounds proportionally (`risk_d = (riskPct/100)*capital_{d-1}`, `gain_d = risk_d*rr`, `capital_d = capital_{d-1}+gain_d`) and returns `{valid,reason,days,rr,clampedDays,rows:[{day,startCapital,risk,gain,endCapital}],finalCapital}`. `rr` defaults to 2, `days` to 20 and is capped at 365; `valid:false` (empty rows) when `capital` is missing/negative or `riskPct` is missing/`<=0`. Exported as `Store.dailyScalingPlan`.
- [x] 4.2 `index.html` + `js/app.js` + `css/styles.css`: added the **Plan de escalado diario** card to the Dashboard (inputs: capital, % riesgo diario, R/B, nº de días; a **Calcular** action; and a `Día | Capital inicial | Riesgo | Ganancia | Capital final` table). `loadScalingDefaults` seeds capital/risk % from the entry form's selected account (current balance + configured `riskPct`) and R/B/days from the new defaults; `renderScalingPlan` calls `Store.dailyScalingPlan` and renders the rows plus a final-capital/growth summary. Reuses `.card`, `.form-grid-narrow`, `.field`, `.btn`, `.risk-warning`, `.table-wrap`/`.trades-table` and the amber `.warn` tokens; one small `.scaling-table thead th { cursor: default; }` rule marks the table as static.

## Files Changed (cumulative)

| File | Action | What Was Done |
|------|--------|---------------|
| `js/instruments.js` | Modified | PR 1 catalog/metadata/MICRO_PAIRS/defaults; PR 2 risk-discipline constants; **PR 5 scaling-plan defaults (`DEFAULT_SCALING_RR`, `DEFAULT_SCALING_DAYS`, `SCALING_DAYS_MAX`).** |
| `js/store.js` | Modified | PR 1 strategy helpers, settings, `computeRisk`; PR 2 `clampRiskPct`/`clampDailyLimit`/`getMinRR`/`computeRR`/`recoveryPct`/`stopDiscipline`/`intradayDrawdown`/`losingStreak`, `trade.stop` normalization, exports; PR 3 `countTradesToday`/`dailyLimitStatus` + exports; **PR 4 `sanitizeTrade` now also normalizes `trade.target` / `trade.plannedRisk` (2 fields, no new exports); PR 5 pure `dailyScalingPlan` + export + local scaling defaults.** |
| `js/app.js` | Modified | PR 1 selects/labels/info panel; PR 2 `renderRiskPanel`/`setRiskItem`, `loadRiskSettingsIntoForm`, `handleSaveRiskSettings`, event wiring, `renderAll`/`updatePreview` hooks; PR 3 `nowTime`, `resetForm` now-defaults, `renderBalances` chip sublabels, `missingStopBadge`, `renderDisciplineSummary`, `renderTable` row flag + summary call, `renderEntryWarnings`, 2 hook calls; **PR 4 `readForm` stop/target/plannedRisk, `renderRiskPanel` recorded-stop distance + recorded R/R inputs, `handleEdit` population, `resetForm` clearing, `wireEvents` live listeners; PR 5 `loadScalingDefaults` + `renderScalingPlan`, `btnScalingCalc` wiring, `enterApp` initial call.** |
| `index.html` | Modified | PR 1 instrument Info button/panel; PR 2 Registro risk calculator card + Ajustes Riesgo y límites card; PR 3 four chip sublabels, `dailyLimitWarning`, `disciplineWarning`, `disciplineSummary`; **PR 4 `#stop` / `#target` / `#plannedRisk` trade-form fields + calculator hint note; PR 5 "Plan de escalado diario" Dashboard card (4 inputs + Calcular + 5-column table + summary).** |
| `css/styles.css` | Modified | PR 1 instrument-info styles; PR 2 `.risk-account-hint`, `.risk-warning`, `.warn`; PR 3 `.app-status.warn`, `.app-status-inline`, `.chip-sub`, `.badge-warn`, `.table-discipline`; **PR 5 `.scaling-table thead th { cursor: default; }` (static, not sortable).** |
| `js/charts.js` | Modified | PR 1 strategy chart by id/order/label. (Untouched in PR 2/3/4.) |
| `openspec/changes/ux-and-risk-management/tasks.md` | Modified | Marked 1.1–1.6, 1.10 (PR 1); 1.7–1.9, 2.4, 2.5, 2.10, 2.13 (PR 2); 2.1, 2.6, 2.7, 2.8, 2.11, 2.12 (PR 3); **2.2, 2.3, 2.9 (PR 4)** `[x]`; **PR 5 tasks 4.1–4.2 `[x]`.** |

## Work Unit Evidence

### PR 5 (this batch)

| Evidence | Required value |
|---|---|
| Focused test command and exact result | `node --check js/store.js` → **exit 0 (store.js OK)**; `node --check js/app.js` → **exit 0 (app.js OK)**; `node --check js/instruments.js` → **exit 0 (instruments.js OK)**. VM harness `node C:\Users\user\AppData\Local\Temp\opencode\scaling-check.js` (loads the real `js/instruments.js` + `js/store.js` into one shared `vm` context, then evaluates `js/app.js` in memory with a DOM stub and an export hook — no file on disk is modified) → **PASSED: 73 / 73 — ALL CHECKS PASSED**. Coverage: known numbers 5000 / 2 % / rr 2 / 3 days → rows `100/200/5200`, `104/208/5408`, `108.16/216.32/5624.32`, `finalCapital 5624.32` (18); per-row formula invariants (1); defaults `rr=2`/`days=20` and final equals the closed form `1000*1.02^20` (5); `days=1000` clamps to 365 + `clampedDays` (3); `rr=0` stays flat (2); invalid `capital`/negative/`riskPct=0`/`days=0` handling (8); `capital=0` valid (2); `Store.dailyScalingPlan` is a function (1); the real `renderScalingPlan` renders 3 rows with `$5,000.00`/`$100.00`/`$200.00`/`$5,624.32` and the summary `Capital final tras 3 días: $5,624.32 … 12.5 %`, then hides the table + warns on `riskPct=0` and negative capital (13); `loadScalingDefaults` seeds `10000`/`1.5`/`2`/`20` from Sim and follows the account switch to Fondeo `50000` (6); structural checks for 7 HTML ids, the Spanish header row, the `btnScalingCalc` binding, the `enterApp` calls, the `Store` export and the 3 new `instruments.js` constants (13). |
| Runtime harness command/scenario and exact result | `node C:\Users\user\AppData\Local\Temp\opencode\scaling-check.js` → **PASSED: 73 / 73**, driving the real production `renderScalingPlan` + `loadScalingDefaults` against a DOM stub with the real `Store`, so the values execute through the real `Store.dailyScalingPlan` path. The full browser path (`serve → login → Dashboard → Plan de escalado diario → Calcular`) is **N/A**: the app is a static page gated behind Firebase email/Google auth and no headless runner or test credentials exist. DOM wiring verified structurally: `#scalingCapital`, `#scalingRiskPct`, `#scalingRR`, `#scalingDays`, `#btnScalingCalc`, `#scalingBody`, `#scalingSummary` all present in `index.html`; `btnScalingCalc` bound in `wireEvents`. |
| Rollback boundary | Revert exactly the PR 5 edits in 5 app files — `js/instruments.js` (3 constants + header doc, ~11 lines), `js/store.js` (3 local constants, the `dailyScalingPlan` function, 1 export), `js/app.js` (`loadScalingDefaults` + `renderScalingPlan`, 1 `wireEvents` line, 2 `enterApp` calls), `index.html` (the Dashboard card), `css/styles.css` (1 rule) — back to the PR 4 state. Purely additive display/logic: no persisted shape changes and no existing function is modified, so no migration is required. The existing risk calculator (contracts from stop) is untouched. |

### PR 4 batch (retained)

| Evidence | Required value |
|---|---|
| Focused test command and exact result | `node --check js/store.js` → **exit 0**; `node --check js/app.js` → **exit 0**; `node --check js/instruments.js` → **exit 0**. VM harness `node C:\Users\user\AppData\Local\Temp\opencode\pr4-check.js` (loads the real `js/instruments.js` + `js/store.js` into one shared `vm` context, then evaluates `js/app.js` in memory with a DOM stub and an internal-export hook — no file on disk is modified) → **PASSED: 48 / 48 — ALL CHECKS PASSED**. Coverage: persistence via `addTrade`/`getTrades`/`updateTrade` and JSON export→import round-trip for `stop`/`target`/`plannedRisk` (14); missing values normalize to 0 (3); panel with recorded stop 4790 / entry 4800 / target 300 / plannedRisk 100 at Sim 10000 @2 % MES → budget `$200.00`, risk/contract `$51.22`, contracts `3`, total `$153.66`, R/R `3.00 : 1` unwarned (6); target 150 → `1.50 : 1` warned (2); stop 4795 (5 pt) → risk/contract `$26.22`, contracts `7` proving the derived distance (2); calculator fallback with no recorded values → `$51.22` / `3` / `1.30 : 1` warned (4); `Sin stop` badge present without a stop, absent with a stop, exactly one in a mixed pair, discipline summary `Sin stop: 1 / 2` (4); `readForm` parses the three fields (3); `resetForm` clears them (3); `handleEdit` populates them (3); structural checks for the 3 HTML ids, the `wireEvents` ids, and the 2 `sanitizeTrade` normalizations (6). |
| Runtime harness command/scenario and exact result | **N/A** — the app is a static page gated behind Firebase email/Google auth; no headless runner and no test credentials exist, so the browser path (`serve → login → Registro form → enter stop/target/plannedRisk → save → panel R/R + row flag`) is not reachable in this environment. The VM harness drives the real production functions (`renderRiskPanel`, `readForm`, `resetForm`, `handleEdit`, `renderTable`) against a DOM stub with the real `Store`, so the recorded values execute through the real `computeRisk`/`computeRR`/`sanitizeTrade`/`stopDiscipline` path. DOM wiring verified structurally: `#stop`, `#target`, `#plannedRisk` present in `index.html`; `'stop', 'target', 'plannedRisk'` present in the `wireEvents` listener array. |
| Rollback boundary | Revert exactly the PR 4 edits in 3 app files — `js/store.js` (`sanitizeTrade` `target`/`plannedRisk` normalization, 2 lines), `js/app.js` (`readForm` 3 lines, `renderRiskPanel` recorded-stop/R-R blocks, `handleEdit` 3 lines, `resetForm` 4 lines, `wireEvents` 1 line, doc comment), `index.html` (`#stop`/`#target`/`#plannedRisk` fields + hint note) — back to the PR 3 state. Additive only: older code ignores the new trade fields; no persisted-data migration, and existing trades without them normalize to 0. |

### PR 3 batch (retained)

| Evidence | Required value |
|---|---|
| Focused test command and exact result | `node --check js/store.js` → **SYNTAX OK**; `node --check js/app.js` → **SYNTAX OK**. VM harness `node C:\Users\user\AppData\Local\Temp\opencode\pr3-check.js` (loads the real `js/instruments.js` + `js/store.js` into one shared `vm` context and instruments `js/app.js` in memory only — no file on disk is modified) → **PASSED: 25 / 25 — 0 failed**. Coverage: `nowTime()` `HH:MM` (1); `resetForm` replaces stale `09:30`/`09:45` with now, entry=exit, entry/exit date = today (5); `countTradesToday(Sim)=2`, `countTradesToday(Real)=1`, `dailyLimitStatus(Sim)` count=2/limit=3/not-exceeded and count=3/exceeded (4); daily-limit banner visible at the limit with the count, amber classes declared in `index.html`, submit never disabled, hidden below the limit (4); streak banner for 3 consecutive losses and cleared after a win (2); drawdown banner for a single 6.25 % loss, drawdown-only emits no streak text, no banner below both thresholds (3); chip sublabels show initial `$10,000.00` / current `$10,048.78` / initial total `$40,000.00` (3); stop-discipline summary reports `Sin stop: 1 / 2`, `Break Even: 1`, `Trailing stop: 1`, turns amber, and exactly one row is flagged (3). |
| Runtime harness command/scenario and exact result | **N/A** — the app is a static page gated behind Firebase email/Google auth; no headless runner and no test credentials exist, so the browser path (`serve → login → open/reset form, inspect chips + banners`) is not reachable in this environment. The VM harness drives the real `resetForm`, `renderBalances`, `renderEntryWarnings`, and `renderTable` against a DOM stub, so the production functions execute with real `Store` logic. DOM wiring verified structurally: all **7** new element ids (`chipSubSim`, `chipSubReal`, `chipSubFondeo`, `chipSubTotal`, `dailyLimitWarning`, `disciplineWarning`, `disciplineSummary`) are present in `index.html`, and all **5** new CSS classes (`.app-status.warn`, `.app-status-inline`, `.chip-sub`, `.badge-warn`, `.table-discipline`) exist in `css/styles.css`. |
| Rollback boundary | Revert exactly the PR 3 edits in the 4 app files — `js/store.js` (`countTradesToday`, `dailyLimitStatus`, 2 exports), `js/app.js` (`nowTime`, `resetForm` time defaults, `renderBalances` sublabels, `missingStopBadge`, `renderDisciplineSummary`, the `renderTable` row flag + summary call, `renderEntryWarnings`, the 2 hook calls), `index.html` (4 chip sublabels, `dailyLimitWarning`, `disciplineWarning`, `disciplineSummary`), `css/styles.css` (5 new rules) — back to the PR 2 state. No persisted-data migration: PR 3 is display/validation only and touches no stored shape. |

### PR 2 batch (retained)

| Evidence | Required value |
|---|---|
| Focused test command and exact result | `node --check js/instruments.js` + `js/store.js` + `js/app.js` → **SYNTAX OK**. VM harness `node risk-discipline-check.js` (loads the real `js/instruments.js` + `js/store.js` into one shared `vm` scope) → **PASSED: 71 / 71 — ALL CHECKS PASSED**. Coverage: 1.7 constants (6); `clampRiskPct` band/warn/clamp/invalid (13); `clampDailyLimit` 0-allowed/negative-invalid/floor (4); `getMinRR` default/normalize (3); `computeRR` 100/300→3:1 no-warn, 100/150→1.5:1 warn, invalid reasons, configured min (6); `recoveryPct` 0.5→1, 0→0, 1→Infinity, 0.2→0.25 (6); `sanitizeTrade` stop normalize (2); `stopDiscipline` per-account/all + BE/trailing counts (9); `losingStreak` 3-loss warn + win reset (3); `intradayDrawdown` exact $77.44 / warn / account filter (5); regressions `setSettings` patch-preserve + `getRiskSettings` defaults/independence + `computeRisk` 200/51.22/3 (14). |
| Runtime harness command/scenario and exact result | **N/A** — same Firebase-auth reason. DOM wiring verified structurally: all **19** new element ids and the new CSS classes were present. |
| Rollback boundary | Revert the PR 2 edits in the 5 app files back to the PR 1 state; additive `settings.riskPct`/`dailyTradeLimit`/`minRR` and `trade.stop` only. |

### PR 1 batch (retained)

Focused: `node --check` on 4 JS files OK; harness → **PASSED: 63 / ALL CHECKS PASSED** (catalog counts, label fallback, metadata, settings patch, `computeRisk` 10000/2/MES/10 → 200/51.22/3, invalid reasons, CSV `strategyName` round-trip). Runtime: N/A (same auth-gated reason). Rollback: revert the 6 app files to pre-slice; additive only.

## Deviations from Design

1. **PR 1 — strategy display names combine the spec and prompt wording** (`Box Breakout (Ruptura de laterales)`, `Tres Impulsos (Ruptura con tres impulsos)`, `Figuras Chartistas (HCH y dobles/triples)`); other names unchanged.
2. **PR 1 — CSV export adds a read-only `strategyName` column** while `strategy` keeps the id, so import round-trips.
3. **PR 1 — instrument `hours` carry an inline "por verificar" marker** for unverified FDAX/FDXM data.
4. **PR 1 — `getStrategies()` returns copies** (defensive, matches `getTrades()`/`getBalances()`).
5. **PR 1 — legacy seed coverage removed** (task 1.6 used only named ids); legacy chart path must be exercised via a manually added/imported `E1..E5` trade.
6. **PR 2 — `clampDailyLimit` added as a pure helper.** Task 1.8 only named `clampRiskPct`, but 2.5 requires daily-limit validation; keeping it pure in `store.js` follows the "all logic pure" constraint instead of inline UI parsing.
7. **PR 2 — `computeRR` accepts an explicit `minRR` but falls back to `getMinRR()`** (the configurable global in `settings.minRR`, default `DEFAULT_MIN_RR`). The design did not specify where `minRR` lives; the Ajustes min-RR field (2.13) makes it a global setting.
8. **PR 2 — `recoveryPct` returns the ratio per the spec formula** (`0.5 → 1`, displayed as `100 %`); the UI multiplies by 100. The panel derives the drawdown fraction from `totalRisk / currentBalance`, since the assigned slice specifies no separate drawdown input.
9. **PR 2 — `stopDiscipline`/`intradayDrawdown`/`losingStreak` accept `(trades, account)` and also tolerate `(account)`** (uses store trades), so both the pure call style and the `tasks.md` shorthand work.
10. **PR 2 — `intradayDrawdown` bases its percentage on the start-of-day equity** (initial balance + net of earlier trades) and warns at ≥ `DAILY_DD_WARN_PCT` (5 %); `losingStreak` uses the existing KPI loss definition (`net <= 0`).
11. **PR 3 — balances visibility delivered via header chip sublabels only.** The prompt allows "header chip sublabels and/or a compact Registro card"; the chips (current value + initial sublabel + combined total) satisfy every `balance-visibility` scenario, so no extra Registro capital card was added, keeping the diff focused.
12. **PR 3 — `dailyLimitStatus.exceeded` is literal `count >= limit`.** A stored limit of 0 therefore warns immediately ("at the limit"). The spec defines warning behavior only for positive limits and explicitly allows 0 to be stored; the literal reading matches the spec's "reached or exceeded" wording. Documented so verify can confirm the intent.
13. **PR 4 — `trade.target` and `trade.plannedRisk` are monetary (USD) amounts, not price levels.** The spec scenario (`planned risk 100`, `target 300` → `3:1`) and the assigned slice's literal `computeRR({plannedRisk,target})` both require `target / plannedRisk` to be dimensionless, so the form labels them `Objetivo (USD)` and `Riesgo planeado (USD)`. `trade.stop` stays a **price** (the slice says "when a stop price is entered"), used for the `Sin stop` flag and the derived stop distance.
14. **PR 4 — the recorded stop drives the stop distance without mutating the calculator input.** `renderRiskPanel` uses `|entry − stop|` when both are present and otherwise falls back to `#riskStopDistance`; it does not overwrite the input, so a manual calculator distance remains usable and no stale value survives a cleared stop. Documented in the panel hint.
15. **PR 4 — recorded `plannedRisk`/`target` override the calculator's computed total risk / own target input**, while the recovery display stays based on the computed `totalRisk` (keeps it consistent with the "Riesgo total" item). The calculator inputs remain the fallback when no trade values are recorded.
16. **PR 4 — `trade.stop`/`target`/`plannedRisk` are not added to the CSV export** (the existing CSV already omits `stop`). JSON export includes every trade field automatically, and the harness proves the JSON round-trip. Keeping CSV unchanged avoids widening the slice.
17. **PR 5 — `dailyScalingPlan` returns an object with a `rows` array plus `finalCapital`** (not a bare array). The task wording ("returning an array ... and the final capital") is satisfied by a wrapper: `rows` feeds the table and `finalCapital` feeds the summary without a second call.
18. **PR 5 — the panel lives in the Dashboard, not Ajustes.** Ajustes holds persisted settings and data management; the scaling plan is a read-only projection that complements the KPIs/charts, so the Dashboard is the better fit.
19. **PR 5 — `rr`/`days` default inside the pure function and `days` is capped at 365 (`SCALING_DAYS_MAX`).** The cap is a safety guard against a mistyped day count freezing the UI; `clampedDays` reports it so the summary can say so. Only the fallbacks are constants — the model numbers are always the configurable inputs.
20. **PR 5 — the panel seeds capital/risk % from the entry form's selected account but never auto-overwrites user edits.** Changing the account does not clobber custom scaling inputs; the user edits the fields directly.

## Issues Found

- **PR 1 slice over budget (retained):** 597 insertions + 32 deletions = **629 authored lines**.
- **PR 2 slice over budget (retained):** **547 authored changed lines**. Requires `size:exception` or the two-way split noted previously.
- **PR 3 slice well under budget (retained):** ~**150 authored added lines**. No `size:exception` needed.
- **PR 4 slice well under budget (retained):** ~**50 authored added lines**. No `size:exception` needed.
- **PR 5 slice well under budget (new):** **235 insertions + 1 deletion = 236 authored changed lines** (store.js +77, app.js +98, index.html +45, instruments.js +10, css +5). No `size:exception` needed.
- **Task 2.2 / 2.3 are now confirmed and marked `[x]`** — they were functionally complete in PR 1 and only held open for the PR 1 boundary; PR 4 re-read `app.js`/`charts.js` and verified every acceptance clause.
- No prior Engram `apply-progress` beyond the PR 1 record (id 21); this artifact is the cumulative merge (obs id 21 updated in place).

## Remaining Tasks

- [ ] 3.1–3.8 manual verification (Phase 3).

## Workload / PR Boundary

- **Mode**: chained PR slice (stacked-to-main).
- **Current work unit**: PR 5 — `daily-scaling-plan` (pure `Store.dailyScalingPlan` + Dashboard "Plan de escalado diario" panel).
- **Boundary**: starts from the PR 4 state; ends at tasks 4.1–4.2. Nothing from Phase 3 verification is included, and the existing risk calculator (contracts from stop) is untouched.
- **Estimated review budget impact**: **235 insertions + 1 deletion = 236 authored changed lines — under the 400 default.** No `size:exception` required for this slice.

## Status

**25/25 Phase 1+2+4 tasks complete** (PR 1: 1.1–1.6 + 1.10; PR 2: 1.7–1.9, 2.4, 2.5, 2.10, 2.13; PR 3: 2.1, 2.6, 2.7, 2.8, 2.11, 2.12; PR 4: 2.2, 2.3, 2.9; PR 5: 4.1–4.2). Only Phase 3 manual verification (3.1–3.8) remains. Ready for independent SDD verification of the PR 5 slice. PR 2's over-budget decision (`size:exception` vs split) is still pending before PR creation; PR 3, PR 4 and PR 5 need no exception.
