```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:3da770bfb88c9dbdf527ec0cbf379efa7da006bda60d5920c9d323a23a8fbe9b
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 10/10
scenarios: 22/22
test_command: "node test/bpt-badges.test.js && node test/budget-stop-default.test.js && node test/calculator-tab.test.js && node test/changes-verification.test.js && node test/contracts-ops-coupling.test.js && node test/contracts-override.test.js && node test/daily-goal.test.js && node test/direction-badge.test.js && node test/draft-autofill-ui.test.js && node test/draft-persistence.test.js && node test/exit-target-suggestion.test.js && node test/gain-factor.test.js && node test/gamification.test.js && node test/instrument-config-draft.test.js && node test/instrument-info-panel.test.js && node test/instrument-sync.test.js && node test/ninjatrader-import.test.js && node test/process-dashboard.test.js && node test/process-dashboard-ui.test.js && node test/ratio-target-preview.test.js && node test/risk-calculator.test.js && node test/risk-per-trade.test.js && node test/stop-per-operation.test.js && node test/total-reward.test.js && node test/trade-nudges.test.js && node test/trade-number-after-delete.test.js && node test/trade-plan-chart.test.js && node test/trade-preview.test.js && node test/trades-per-day-input.test.js && node test/trades-process-columns.test.js && node test/weekly-review.test.js"
test_exit_code: 0
test_output_hash: sha256:ed44d8eb0fb67f170cb2dba20d11e1dbc58ac8b2aa274a98f5da96de4c5dc2a4
build_command: ""
build_exit_code: 0
build_output_hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

## Verification Report

**Change**: calculator-trades-ux
**Version**: N/A (delta specs, no version header)
**Mode**: Standard (strict_tdd = false)

**Executive summary**: PASS WITH WARNINGS. All 17 apply tasks are `[x]` and the full non-rules suite runs green (31 harnesses, ALL PASS — every `test/*.test.js` except `rules.test.js`). All 10 requirements across `trade-plan-chart`, `calculator-tab`, and `risk-calculator` are implemented and wired: the pure `Store.tradePlanTicks` price→ticks adapter, the per-trade expandable plan detail row, the `#tab-calculadora` split, the ticks↔puntos readout, and the Stop reference row. All 22 scenarios are satisfied; 19 have dedicated passing runtime tests and 3 (detail-row toggle open/close and empty-list rendering) are verified by structural source inspection because the project's no-browser VM harness approach does not simulate DOM clicks. One non-blocking WARNING covers that coverage gap. No new persisted field, no Firestore change, no Dashboard/Proceso change — scope holds.

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 17 |
| Tasks complete | 17 |
| Tasks incomplete | 0 |

All numbered tasks 1.1–1.2, 2.1–2.6, 3.1–3.3, 4.1, 5.1–5.3 are `[x]`. `apply-progress.md` records the three stacked-PR batches (PR 1 adapter, PR 2 tab/detail-row, PR 3 readouts/styles) and reports the same 31-harness green regression.

### Build & Tests Execution

**Build**: ➖ Not applicable — static site, no build step (`verify.build_command` is empty in `openspec/config.yaml`). `node --check` over all `js/*.js` also passes clean as a syntax sanity check (exit 0).

**Tests**: ✅ 31/31 harnesses passed (ALL PASS), full non-rules suite.

```
$failed = @(); $count = 0
Get-ChildItem test\*.test.js | Where-Object { $_.Name -ne 'rules.test.js' } | ForEach-Object {
  $count++; node $_.FullName; if ($LASTEXITCODE -ne 0) { $failed += $_.Name }
}
"Ran $count harnesses"   -> Ran 31 harnesses
"ALL PASS"
```

Direct coverage + regression harnesses for this change:

| Command | Result |
|---------|--------|
| `node test/trade-plan-chart.test.js` | ✅ 32 passed, 0 failed (exit 0) |
| `node test/calculator-tab.test.js` | ✅ 46 passed, 0 failed (exit 0) |
| `node test/instrument-sync.test.js` (regression, sync invariant) | ✅ 37 passed, 0 failed (exit 0) |
| `node test/instrument-info-panel.test.js` (regression, single info surface) | ✅ 55 passed, 0 failed (exit 0) |
| `node test/trade-preview.test.js` (regression, geometry) | ✅ 43 passed, 0 failed (exit 0) |
| `node test/risk-calculator.test.js` (regression) | ✅ 73 passed, 0 failed (exit 0) |

**Coverage**: ➖ Not available (no coverage tool configured).

### Spec Compliance Matrix

**trade-plan-chart** (4 requirements, 11 scenarios):

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Price-to-Ticks Adapter | Long distances | `trade-plan-chart.test.js` [1] `stopTicks 8 / targetTicks 16` | ✅ COMPLIANT |
| Price-to-Ticks Adapter | Short distances are absolute | `trade-plan-chart.test.js` [2] `short stopTicks 8 / targetTicks 16` | ✅ COMPLIANT |
| Price-to-Ticks Adapter | Tick size scales the count | `trade-plan-chart.test.js` [3] FDAX 0.5 `stopTicks 8` | ✅ COMPLIANT |
| Price-to-Ticks Adapter | Missing tick yields no distance | `trade-plan-chart.test.js` [8] unknown/zero tick → NaN | ✅ COMPLIANT |
| Expandable Detail Row | Toggle open | source inspection `toggleTradePlan` + `calculator-tab.test.js` [5] wiring | ✅ COMPLIANT (inspection) |
| Expandable Detail Row | Toggle closed | source inspection `toggleTradePlan` + `calculator-tab.test.js` [5] wiring | ✅ COMPLIANT (inspection) |
| Expandable Detail Row | Empty list | source inspection `buildTradeRows` (forEach emits none when empty) | ✅ COMPLIANT (inspection) |
| Plan Rendering from Saved Prices | Full plan | `calculator-tab.test.js` [6] `full plan → SVG + Target (Limit)` | ✅ COMPLIANT |
| Degraded and Edge Rendering | Entry only | `calculator-tab.test.js` [6] entry-only SVG + note, no stop/target | ✅ COMPLIANT |
| Degraded and Edge Rendering | Stop without exit | `calculator-tab.test.js` [6] entry+stop no target + note | ✅ COMPLIANT |
| Degraded and Edge Rendering | No entry | `calculator-tab.test.js` [6] no-entry → empty SVG + no note | ✅ COMPLIANT |

**calculator-tab** (4 requirements, 6 scenarios):

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Calculadora Tab | Tab appears and switches | `calculator-tab.test.js` [1] nav button + [2] `switchTab` list | ✅ COMPLIANT |
| Tab Content Split | Content is split | `calculator-tab.test.js` [3] calculator/`#riskPreview` inside `#tab-calculadora` | ✅ COMPLIANT |
| Tab Content Split | Registro keeps its content | `calculator-tab.test.js` [3] `#tradeForm`/`#dailyGoalCard` after `#tab-registro` | ✅ COMPLIANT |
| Cross-Tab Sync Preserved | Instrument sync across tabs | `instrument-sync.test.js` (37 passed) + `calculator-tab.test.js` [4] `#riskInstrument` precedes `#tradeForm` | ✅ COMPLIANT |
| Cross-Tab Sync Preserved | Contracts sync across tabs | `contracts-ops-coupling.test.js` / `contracts-override.test.js` (regression green) | ✅ COMPLIANT |
| No Regression to Registro | Registro behavior unchanged | full regression green (daily-goal, draft-autofill, trades-per-day, etc.) | ✅ COMPLIANT |

**risk-calculator** (2 requirements, 5 scenarios):

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Ticks↔Points Relationship Readout | Tick size 0.25 | `calculator-tab.test.js` [7] `ticksToPoints(1, ES) 0.25` / `pointsToTicks(1, ES) 4` | ✅ COMPLIANT |
| Ticks↔Points Relationship Readout | Tick size 1 | `calculator-tab.test.js` [7] YM `1 punto` / `1 tick` | ✅ COMPLIANT |
| Ticks↔Points Relationship Readout | Missing or invalid instrument | `calculator-tab.test.js` [7] unknown → NaN guard hides the line | ✅ COMPLIANT |
| Stop Reference Readout | Stop shown in ticks and points | `calculator-tab.test.js` [7] `ticksToPoints(8, ES) 2` + `renderRiskPanel` wiring | ✅ COMPLIANT |
| Stop Reference Readout | Invalid instrument hides the points | `calculator-tab.test.js` [7] NaN guard + `renderRiskPanel` drops points | ✅ COMPLIANT |

**Compliance summary**: 22/22 scenarios satisfied (10/10 requirements). 19 scenarios have dedicated passing runtime tests; 3 scenarios (detail-row toggle open/close + empty-list) are verified by source inspection because the project's VM harness approach does not simulate DOM clicks (see WARNING).

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| `tradePlanTicks` = `{valid, entry, stopTicks, targetTicks, tick, direction}`, absolute distances, `valid=false` when entry unusable, NaN on missing stop/exit/tick or tick ≤ 0 | ✅ Implemented | `js/store.js:1853-1880` |
| `tradePlanTicks` exported in Store tail | ✅ Implemented | `js/store.js:3824` |
| `ticksToPoints` / `pointsToTicks` (tick bridge, NaN on unknown) | ✅ Implemented | `js/store.js:1019-1038` |
| `tradePlanDetailRowHtml` (hidden `<tr>`, colspan N+1) + `toggleTradePlan` (flips `hidden`, sets `aria-expanded`) | ✅ Implemented | `js/app.js:1058-1078` |
| Detail row pushed after each `tradeRowHtml` in `buildTradeRows` | ✅ Implemented | `js/app.js:1005-1006` |
| Plan toggle button (`data-action="toggle-plan"`) in `tradeRowHtml` + `toggle-plan` delegation | ✅ Implemented | `js/app.js:1044` + `js/app.js:4506` |
| `tradePlanSvg` degradation (no-entry → empty; entry-only → minimal SVG + note; entry+stop → `tradePreviewGeometry` → `riskPreviewSvg`, note when exit missing) | ✅ Implemented | `js/app.js:2032-2075` |
| `entryOnlyPlanSvg` (single-level Entry (Market) SVG, no fabricated stop/target) | ✅ Implemented | `js/app.js:2082-2096` |
| `switchTab` list `['registro','calculadora','dashboard','ajustes']` | ✅ Implemented | `js/app.js:3563` |
| Nav button `data-tab="calculadora"` + `#tab-calculadora` section before `#tab-registro` | ✅ Implemented | `index.html:99` + `index.html:150` (Registro at `:400`) |
| `renderInstrumentInfo` emits `#instrumentTicksPoints` from `ticksToPoints(1,id)`/`pointsToTicks(1,id)`, hidden on NaN | ✅ Implemented | `js/app.js:1514-1523` |
| `renderRiskPanel` renders `#riskStopReference` from `risk.ticksSL` + `ticksToPoints(ticksSL,instrument)`, points dropped on NaN, in `resultIds` reset list | ✅ Implemented | `js/app.js:2439-2447` + `js/app.js:2327` |
| `#riskStopReference` read-only row in "Objetivo y R/B" group | ✅ Implemented | `index.html:308-310` |
| Plan-row styles + amber accent mappings | ✅ Implemented | `css/styles.css:2096-2124` |

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| D1 — Adapter returns absolute tick counts; geometry applies sign | ✅ Yes | `tradePlanTicks` returns `Math.abs(...)/tick`; `tradePreviewGeometry`/`riskPreviewSvg` reused unchanged. |
| D2 — Degraded rendering never fabricates levels | ✅ Yes | entry-only → minimal single-level SVG + note; no-entry → `{svg:'', note:''}`; stop-no-exit → note, no target. |
| D3 — `#tab-calculadora` placed BEFORE `#tab-registro` (nav order unchanged) | ✅ Yes | `index.html:150` (calculadora) before `:400` (registro); `instrument-sync.test.js` calcIdx<formIdx stays green. |

### Issues Found

**CRITICAL**: None.

**WARNING**:
- `trade-plan-chart` "Expandable Detail Row" → "Toggle open" / "Toggle closed" / "Empty list": the detail-row mechanism is implemented (`toggleTradePlan` flips `row.hidden` + `aria-expanded`; `tradePlanDetailRowHtml` emits `<tr hidden>`; `buildTradeRows` emits rows only per trade so an empty list renders none) and structurally pinned by `calculator-tab.test.js` [5], but no runtime harness simulates the click or renders an empty list. This is a coverage gap, not a defect — the code paths are trivial and correct.

**SUGGESTION**:
- Add a runtime assertion that executes the extracted `toggleTradePlan` (or a DOM shim) and asserts `hidden` flips and `aria-expanded` updates, to close the last wiring gap for the detail-row toggle.
- Consider a one-line assertion that `buildTradeRows([])` (or the empty-trades branch) emits no `trade-detail-row` markup.

### Scope-Creep Check

| Out-of-scope item | Status |
|-------------------|--------|
| Change to how trades are saved / new trade fields | ✅ None — `tradePlanTicks` is read-only over existing fields (`entryPrice`, `stop`, `exitPrice`, `instrument`, `direction`). |
| New Firestore collection / rules change | ✅ None — `firestore.rules` and `js/firebase.js` untouched; no new persisted field. |
| Dashboard/Proceso change | ✅ None — no `process-dashboard`/`dashboard` file touched. |

### Next Recommended

`archive` (sdd-archive) — the change is functionally complete and verified; the single WARNING is a test-coverage gap (optional: add a detail-row toggle/empty-list harness before or during archive).

### Risks

- **Low**: additive UI only; rollback = revert `js/store.js`, `js/app.js`, `index.html`, `css/styles.css` and delete the two new tests. No migration to reverse.
- **Low (coverage)**: the detail-row toggle/empty-list paths are the only structurally-only-verified behavior; a regression there would not be caught by the current suite.

### Skill Resolution

`sdd-verify` (this phase) → next phase `sdd-archive`.

### Verdict

**PASS WITH WARNINGS** — 17/17 tasks complete; 31/31 harnesses green; 10/10 requirements satisfied and wired; 22/22 scenarios satisfied (19 with dedicated passing runtime tests, 3 structurally-only); design decisions honored; no scope creep; no blockers.
