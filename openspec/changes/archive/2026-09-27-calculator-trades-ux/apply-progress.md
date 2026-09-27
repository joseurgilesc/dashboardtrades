# Apply Progress: calculator-trades-ux

## Batch: PR 1 of 3 (stacked-to-main)

Pure `Store.tradePlanTicks` price-to-ticks adapter in `js/store.js` plus its
`trade-plan-chart.test.js` VM harness. No DOM wiring, no `app.js` / `index.html`
/ `css/styles.css` changes (those are PRs 2 and 3).

## Batch: PR 2 of 3 (stacked-to-main)

DOM wiring: new "Calculadora" tab (`index.html` nav button + `#tab-calculadora`
section placed BEFORE `#tab-registro`, calculator card moved into it), the
`switchTab` list extended, and the per-trade expandable plan detail row
(`tradePlanSvg` + `entryOnlyPlanSvg` + `tradePlanDetailRowHtml` +
`toggleTradePlan` + Plan button + `toggle-plan` delegation) in `js/app.js`. Plus
the `calculator-tab.test.js` structural + `tradePlanSvg`-degradation harness.

## Batch: PR 3 of 3 (stacked-to-main)

Two additive readouts + styles. `#riskStopReference` is a static read-only row in
the "Objetivo y R/B" `preview-group--result` group, populated by
`renderRiskPanel` from `risk.ticksSL` + `Store.ticksToPoints(ticksSL, instrument)`
(added to `resultIds` so it resets with the others). `#instrumentTicksPoints` is
emitted by `renderInstrumentInfo` as a grid row ("1 tick = X puntos · 1 punto = Y
ticks") and omitted when the tick data is invalid — the `#instrumentInfo` panel is
fully innerHTML-rebuilt, so the element is generated in JS rather than as static
markup. `css/styles.css` gains the `.trade-detail-row`/`.trade-detail-cell`/
`.trade-plan`/`.trade-plan-note` plan-row styles plus the `amber` accent mappings
for the Calculadora nav button and section.

## Work Unit Evidence

| Evidence | Value |
|----------|-------|
| Focused test command + result (PR 1) | `node test/trade-plan-chart.test.js` → `32 passed, 0 failed` (exit 0) |
| Focused test command + result (PR 2) | `node test/calculator-tab.test.js` → `33 passed, 0 failed` (exit 0) |
| Focused test command + result (PR 3) | `node test/calculator-tab.test.js` → `46 passed, 0 failed` (exit 0; +13 readout asserts) |
| Runtime harness command + result | `node --check js/app.js` → clean (exit 0); full regression `Ran 31 harnesses / ALL PASS` (every `test/*.test.js` except `rules.test.js`) |
| Rollback boundary | Revert `js/app.js` + `index.html` + `css/styles.css` + `test/calculator-tab.test.js` (PRs 2–3); PR 1 rollback (revert `js/store.js` + delete `test/trade-plan-chart.test.js`) unchanged |

## Completed Tasks

- [x] 1.1 Add pure `tradePlanTicks(trade)` near `tradePreviewGeometry` — returns `{ valid, entry, stopTicks, targetTicks, tick, direction }`; `stopTicks = |entry−stop|/tick`, `targetTicks = |exit−entry|/tick` (absolute), NaN on missing stop/exit/tick or tick ≤ 0, `valid=false` when entry missing/NaN/≤ 0.
- [x] 1.2 Export `tradePlanTicks` in the Store return tail (next to `tradePreviewGeometry`).
- [x] 2.1 `index.html`: nav button `data-tab="calculadora"` (data-accent `amber`, label "Calculadora") after Registro + `#tab-calculadora` section BEFORE `#tab-registro`.
- [x] 2.2 `index.html`: moved the "Calculadora de riesgo" card (incl. `#riskPreview`, `#instrumentInfo`) into `#tab-calculadora` unchanged; `#riskInstrument` stays before `#tradeForm`.
- [x] 2.3 `js/app.js`: `switchTab` list → `['registro','calculadora','dashboard','ajustes']`.
- [x] 2.4 `js/app.js`: `tradePlanSvg(trade)` → `{ svg, note }` + `entryOnlyPlanSvg`; degradation per spec (no-entry empty; entry-only minimal single-level SVG + note; entry+stop → `tradePreviewGeometry` → `riskPreviewSvg`; note when exit missing; no direction → note, no invalid SVG).
- [x] 2.5 `js/app.js`: `tradePlanDetailRowHtml(t)` + `toggleTradePlan(id)`; detail `<tr hidden>` pushed after `tradeRowHtml(t)` in `buildTradeRows`.
- [x] 2.6 `js/app.js`: "Plan" button (`data-action="toggle-plan"`) in `tradeRowHtml` + `toggle-plan` branch in `tradesBody` delegation.
- [x] 3.1 `index.html`: `#riskStopReference` read-only row in the "Objetivo y R/B" `preview-group--result` group (label "Stop (referencia)", value "—"). `#instrumentTicksPoints` is emitted by `renderInstrumentInfo` (the `#instrumentInfo` panel is innerHTML-rebuilt, so no static element).
- [x] 3.2 `js/app.js`: `renderInstrumentInfo` renders `#instrumentTicksPoints` = "1 tick = X puntos · 1 punto = Y ticks" from `Store.ticksToPoints(1, id)`/`Store.pointsToTicks(1, id)`; the row is omitted (show nothing) when the tick/point data is NaN (invalid/missing tick).
- [x] 3.3 `js/app.js`: `renderRiskPanel` renders `#riskStopReference` from `risk.ticksSL` (`formatTicks`) + `Store.ticksToPoints(risk.ticksSL, instrument)` (points, 2 decimals); points dropped when invalid; added to `resultIds` reset list.
- [x] 4.1 `css/styles.css`: `.trade-detail-cell` / `.trade-plan` / `.trade-plan .risk-preview-svg` / `.trade-plan-note` styles + `--tab-accent`/`--section-accent` amber mappings for the Calculadora nav button and section.
- [x] 5.1 `test/trade-plan-chart.test.js` (tradePlanTicks, PR 1) + `tradePlanSvg` degraded-path coverage (PR 2, `calculator-tab.test.js` §6).
- [x] 5.2 `test/calculator-tab.test.js` created (PR 2) + §7 readout assertions (PR 3): Store math (`ticksToPoints`/`pointsToTicks` ES/YM/unknown) + structural (`#riskStopReference` in markup/reset list, `renderInstrumentInfo` emits/hides `#instrumentTicksPoints`).
- [x] 5.3 Regression green (31 harnesses).

## Verification (full regression)

`Ran 31 harnesses / ALL PASS` — every `test/*.test.js` except `rules.test.js`
(30 prior + the `calculator-tab.test.js`, now `46 passed`). `node --check
js/app.js` clean (exit 0).

## Files Changed

| File | Action |
|------|--------|
| `js/store.js` | Modified (PR 1) — added `tradePlanTicks` + export |
| `test/trade-plan-chart.test.js` | Created (PR 1) |
| `index.html` | Modified (PR 2) — Calculadora nav button + `#tab-calculadora` section (calculator card moved); (PR 3) `#riskStopReference` row in "Objetivo y R/B" |
| `js/app.js` | Modified (PR 2) — `switchTab` list, `tradePlanSvg`/`entryOnlyPlanSvg`, `tradePlanDetailRowHtml`/`toggleTradePlan`, Plan button + delegation; (PR 3) `renderInstrumentInfo` emits `#instrumentTicksPoints`, `renderRiskPanel` renders `#riskStopReference` + `resultIds` |
| `css/styles.css` | Modified (PR 3) — plan-row styles + amber accent mappings |
| `test/calculator-tab.test.js` | Created (PR 2) + §7 readout assertions (PR 3) |
| `openspec/changes/calculator-trades-ux/tasks.md` | Marked 2.1–2.6, 3.1–3.3, 4.1, 5.1–5.3 `[x]` |

## Remaining (PR 3)

None — change complete. Ready for `sdd-verify`.
