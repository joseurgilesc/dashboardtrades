# Tasks: Calculator Trades UX

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~600–700 (~350–450 net-new + ~240 markup move) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending-user-choice |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----|----------------------|-----------------|-------------------|
| 1 | Pure `Store.tradePlanTicks` adapter in `js/store.js` | PR 1 | `node test/trade-plan-chart.test.js` | `node test/trade-plan-chart.test.js` | Revert `js/store.js` + delete new test |
| 2 | Detail row + Calculadora tab wiring (`js/app.js`, `index.html`) | PR 2 | `node test/calculator-tab.test.js` | `node test/instrument-sync.test.js` (calcIdx<formIdx) | Revert `js/app.js`, `index.html` |
| 3 | Two readouts + styles (`js/app.js`, `index.html`, `css/styles.css`) | PR 3 | `node test/calculator-tab.test.js` | `node test/instrument-info-panel.test.js` | Revert `js/app.js`, `index.html`, `css/styles.css` |

## Phase 1: Pure logic (`js/store.js`)

- [x] 1.1 Add pure `tradePlanTicks(trade)` near `tradePreviewGeometry` (~line 1869): returns `{ valid, entry, stopTicks, targetTicks, tick, direction }` with `stopTicks = |entry−stop|/tick`, `targetTicks = |exit−entry|/tick` (numOr-safe, NaN on missing stop/exit/tick or tick ≤ 0, `valid=false` when entry unusable) — trade-plan-chart "Price-to-Ticks Adapter"; design Decision 1.
- [x] 1.2 Export `tradePlanTicks` in the Store return tail (~line 3777).

## Phase 2: DOM wiring — detail row + Calculadora tab (`js/app.js`, `index.html`)

- [x] 2.1 `index.html`: add nav button `data-tab="calculadora"` after Registro (line 98) and a `#tab-calculadora` section BEFORE `#tab-registro` (before line 149) — calculator-tab "Calculadora Tab"; design Decision 3.
- [x] 2.2 `index.html`: MOVE the "Calculadora de riesgo" card (lines 206–447, incl. `#riskPreview`) into `#tab-calculadora` unchanged. ⚠ Keep `#riskInstrument` before `#tradeForm` (don't break `instrument-sync.test.js` calcIdx<formIdx; also `instrument-info-panel.test.js` single `.instrument-info`).
- [x] 2.3 `js/app.js`: extend `switchTab` list (line 3424) to `['registro','calculadora','dashboard','ajustes']` — calculator-tab spec. ⚠ Do not touch `renderRiskPanel`/`syncContracts` bodies.
- [x] 2.4 `js/app.js`: add `tradePlanSvg(trade)` → `{ svg, note }`: no entry → empty; entry-only → minimal single-level inline SVG + note; entry+stop → `Store.tradePreviewGeometry({entry,stopTicks,tick,direction,ticksTP:finite(targetTicks)?[targetTicks]:[]})` → `riskPreviewSvg` — trade-plan-chart "Plan Rendering"/"Degraded"; design Decision 2.
- [x] 2.5 `js/app.js`: add `tradePlanDetailRowHtml(t)` + `toggleTradePlan(id)`; push the detail `<tr hidden>` after `tradeRowHtml(t)` in `buildTradeRows` (line 1005) — trade-plan-chart "Expandable Detail Row".
- [x] 2.6 `js/app.js`: add Plan toggle button in `tradeRowHtml` (line 1021) and a `toggle-plan` branch in the `tradesBody` click delegation (line 4365).

## Phase 3: Readouts (`js/app.js`, `index.html`)

- [x] 3.1 `index.html`: add `#instrumentTicksPoints` inside `#instrumentInfo` (line 233) and a `#riskStopReference` row in the "Objetivo y R/B" `preview-group--result` (line 360) — risk-calculator spec.
- [x] 3.2 `js/app.js`: `renderInstrumentInfo` (~1449) renders "1 tick = X puntos" / "1 punto = Y ticks" from `ticksToPoints(1,instrument)`/`pointsToTicks(1,instrument)`; hide on missing/invalid tick — risk-calculator "Ticks↔Points".
- [x] 3.3 `js/app.js`: `renderRiskPanel` (~2040, near setRiskItem ~2308) renders `#riskStopReference` from `risk.ticksSL` + `ticksToPoints(ticksSL,instrument)`; hide points on invalid tick — risk-calculator "Stop Reference".

## Phase 4: Styles (`css/styles.css`)

- [x] 4.1 Add `.trade-detail-row`, `.trade-detail-cell`, `.trade-plan`, and tab accent styles matching existing tokens.

## Phase 5: Tests (`test/*.test.js`) + regression

- [x] 5.1 Create `test/trade-plan-chart.test.js`: `tradePlanTicks` Largo/Corto absolute, FDAX tick scale, missing tick/entry/stop/exit; `tradePlanSvg` degraded paths (entry-only, stop-no-exit, no-entry). _(PR 1 shipped the `tradePlanTicks` coverage in this harness; the `tradePlanSvg` degraded-path coverage landed in PR 2 with task 2.4, asserted in `calculator-tab.test.js` §6.)_
- [x] 5.2 Create `test/calculator-tab.test.js`: structural `#tab-calculadora` + button, `switchTab` has `calculadora`, calculator/`#riskPreview` in Calculadora + form/trades in Registro, sync reads `#instrument/#stop/#entryPrice/#contracts`, readouts rendered + hidden on invalid tick.
- [x] 5.3 Regression green: `node test/instrument-sync.test.js`, `instrument-info-panel.test.js`, `contracts-ops-coupling.test.js`, `contracts-override.test.js`, `risk-calculator.test.js`, `trade-preview.test.js`, `draft-autofill-ui.test.js`.
