# Proposal: calculator-trades-ux

## Intent

Make the trade plan visible where trades are actually reviewed, and untangle the calculator from the trade form. Today the compact visual plan (`riskPreviewSvg`) renders only in the calculator's preview aside, never per saved trade; the calculator lives stacked above the trade form in one "Registro" tab; and the instrument info shows tick size and point value separately with no explicit relationship. This change surfaces a per-trade chart, splits the calculator into its own tab, and adds two derived readouts (ticks↔puntos and a stop reference) — all reusing existing primitives, with no new persisted data.

## Scope

### In Scope
- **Per-trade chart**: expandable detail row under each trade row, rendering the saved trade's plan via the existing `riskPreviewSvg`/`tradePreviewGeometry` builder. New pure price→ticks adapter (`stopTicks = |entry−stop|/tick`, `targetTicks = |exit−entry|/tick`). When stop/exit are missing, render the available plan (entry-only + a note), never a broken SVG.
- **Calculator tab split**: new top-level "Calculadora" tab (calculator card + `#riskPreview` aside). "Registro" keeps goal + session review + trade form + trades list. Update the hardcoded tab list (`app.js:3424`).
- **Ticks↔points readout**: in the calculator's instrument info, "1 tick = X puntos" and/or "1 punto = Y ticks" from `tick`/`ticksToPoints`/`pointsToTicks`.
- **Stop reference**: read-only "Stop" row (ticks + points) in the `preview-group--result` group, from `risk.ticksSL`/`stopTicks`.

### Out of Scope
- Any change to how trades are saved; no new trade fields.
- Any new Firestore collection or rules change.
- Any Dashboard/Proceso change (that was the prior change).

## Capabilities

### New Capabilities
- `trade-plan-chart`: per-trade expandable plan rendering from saved-trade prices.
- `calculator-tab`: top-level "Calculadora" tab holding the calculator + preview; form⇄calculator sync survives the split.

### Modified Capabilities
- `risk-calculator`: add the ticks↔puntos readout and the Objetivo y R/B stop reference (instrument-info and preview-result display).

## Approach

Pure additive UI work. Add a pure `store.js` helper mirroring `tradePreviewGeometry` but price-based, and wire a hidden expandable `<tr>` in `tradeRowHtml`/`renderTable` to it, reusing `riskPreviewSvg` for the SVG. Move the calculator card + preview aside into a new `#tab-calculadora` section using the existing `hidden` mechanism so `syncInstrument`, `syncContracts`, `contractsTouched`, and `applyDraftAutofill` keep working against the (now hidden) form — extend the `switchTab` list (app.js:3424) so the section toggles. Derive the two readouts from existing `tick` + `ticksToPoints`/`pointsToTicks` (no new store field).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `js/store.js` | Modified | New price-based saved-trade geometry helper |
| `js/app.js` | Modified | `switchTab` list; `tradeRowHtml`/`renderTable` expandable row; ticks↔puntos renderer; stop-reference wiring in `renderRiskPanel` |
| `index.html` | Modified | New "Calculadora" tab button + `#tab-calculadora` section; stop-reference row; ticks↔puntos readout |
| `css/styles.css` | Modified | Styles for the new tab, detail row, readout |
| `test/*.test.js` | New/Modified | VM harness for the geometry adapter; structural checks for the tab split |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Adapter inverts Largo/Corto plan | Med | Use `|absolute|` distances; pin direction cases in the harness |
| Tab split breaks form⇄calculator coupling | Med | Keep ids unchanged; `hidden` only; structural test pins `syncInstrument`/`syncContracts` |
| `switchTab` hardcodes the tab list | High | Extend `app.js:3424`; structural test asserts `calculadora` present |
| Missing stop/exit yields broken SVG | Med | Guard: entry-only plan + note, never invalid SVG |
| Table width / mobile scroll | Low | Chart is inside an expandable row, not a new column |

## Rollback Plan

Revert the merge/commit and redeploy the static site; prior `store.js`, `app.js`, `index.html` are restored. No persisted data changes — no migration to reverse.

## Dependencies

None external. Reuses `riskPreviewSvg`, `tradePreviewGeometry`, `ticksToPoints`/`pointsToTicks`, `switchTab`, `syncContracts`.

## Tests

- **New**: `saved-trade-plan` (price→ticks geometry, Largo/Corto, missing stop/exit).
- **New**: `calculator-tab` (structural: `#tab-calculadora` present, `switchTab` list includes `calculadora`, sync wiring intact).

## Success Criteria

- [ ] Expandable detail row renders the saved trade's plan correctly for both Largo and Corto.
- [ ] Missing stop/exit renders entry-only + note, never a broken SVG.
- [ ] "Calculadora" tab shows the calculator + preview; "Registro" keeps goal/review/form/trades.
- [ ] `switchTab` list includes `calculadora`; hidden form⇄calculator sync survives the split.
- [ ] Ticks↔puntos readout matches `ticksToPoints`/`pointsToTicks`.
- [ ] Objetivo y R/B group shows a stop reference from `risk.ticksSL`.
- [ ] No new trade fields, Firestore collection, or Dashboard/Proceso change.
