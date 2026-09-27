# Design: calculator-trades-ux

## Technical Approach

Three additive changes reusing existing primitives: a pure `store.js` price→ticks adapter feeding `tradePreviewGeometry`/`riskPreviewSvg` for a per-trade expandable row; a `hidden`-based split moving the calculator card + `#riskPreview` into a new `#tab-calculadora` (sync survives because the form stays in the DOM); and two derived readouts wired from `ticksToPoints`/`pointsToTicks` and `risk.ticksSL`. No new persisted field, no Firestore change.

## Architecture Decisions

### Decision 1: Adapter returns absolute tick counts, geometry applies sign

| option | tradeoff | decision |
|---|---|---|
| Adapter applies direction sign | Duplicates `tradePreviewGeometry` sign logic; can drift | ✗ |
| Adapter returns `|Δprice|/tick` + `direction` passthrough | `tradePreviewGeometry` (unchanged) owns the sign; one source | ✓ |

**Choice**: new pure `Store.tradePlanTicks(trade)`. `tradePreviewGeometry` and `riskPreviewSvg` are reused **unchanged**.

### Decision 2: Degraded plan rendering never fabricates levels

| option | tradeoff | decision |
|---|---|---|
| Pass `targetTicks=0`/default TP | Fabricates a target the trade never had | ✗ |
| Only call `tradePreviewGeometry` when a stop exists; entry-only → minimal note/line; no-entry → nothing | Never a broken SVG | ✓ |

**Choice**: `tradePlanSvg(trade)` in app.js returns `{ svg, note }`:
- no usable entry → `{svg:'', note:''}` (no SVG emitted)
- entry only (no stop) → single-level inline SVG + note (no `tradePreviewGeometry`)
- entry+stop → `tradePreviewGeometry({entry, stopTicks, tick, direction, ticksTP: finite(targetTicks)?[targetTicks]:[]})` → `riskPreviewSvg`; note when exit missing.

### Decision 3: `#tab-calculadora` section placed BEFORE `#tab-registro` in DOM

| option | tradeoff | decision |
|---|---|---|
| After `#tab-registro` | Breaks `instrument-sync.test.js` structural check (`calcIdx < formIdx`) | ✗ |
| Before `#tab-registro` (nav button order unchanged: Registro, Calculadora, …) | Keeps `riskInstrument` before `tradeForm`; default-tab visibility still driven by `hidden`/`switchTab` | ✓ |

**Choice**: section before `#tab-registro`; nav button `data-tab="calculadora"` placed after Registro.

## Data Flow

```
saved trade ──► Store.tradePlanTicks(trade) ──► {valid, entry, stopTicks, targetTicks, tick, direction}
                                                      │
                              ┌───────────────────────┴─────────────────────────┐
                              ▼                                                 ▼
              tradePreviewGeometry({entry,stopTicks,tick,          (entry-only) minimal entry-only SVG
                 direction, ticksTP:[targetTicks]|[]})                    + note
                              │
                              ▼
              riskPreviewSvg(geometry, {instrument,direction,decimals})
                              │
                              ▼
              tradePlanDetailRowHtml(t) ──► <tr class="trade-detail-row" hidden> … </tr>
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `js/store.js` | Modify | Add pure `tradePlanTicks` (near `tradePreviewGeometry`); export it |
| `js/app.js` | Modify | `switchTab` list adds `'calculadora'`; `tradePlanSvg` + `tradePlanDetailRowHtml` + `toggleTradePlan`; `tradeRowHtml` adds Plan button; `tradesBody` delegation adds `toggle-plan`; `renderInstrumentInfo` renders `#instrumentTicksPoints`; `renderRiskPanel` renders `#riskStopReference` |
| `index.html` | Modify | New nav button `data-tab="calculadora"`; new `#tab-calculadora` section (calculator card + `#riskPreview`) placed before `#tab-registro`; `#instrumentTicksPoints`; `#riskStopReference` row in `preview-group--result` |
| `css/styles.css` | Modify | Styles for `.trade-detail-row`, `.trade-plan`, tab accent |
| `test/trade-plan-chart.test.js` | Create | Adapter + degraded-path geometry |
| `test/calculator-tab.test.js` | Create | Tab split + sync + readouts |

## Interfaces / Contracts

```js
// store.js (pure)
tradePlanTicks(trade) → {
  valid: Boolean,      // false when entryPrice unusable (no plan)
  entry: Number,       // trade.entryPrice (NaN when missing)
  stopTicks: Number,   // |entry−stop|/tick ; NaN when stop or tick missing
  targetTicks: Number, // |exit−entry|/tick ; NaN when exit or tick missing
  tick: Number,        // INSTRUMENTS[instrument].tick (NaN when missing)
  direction: String    // 'Largo' | 'Corto' | '' (passthrough)
}
// app.js
tradePlanSvg(trade) → { svg: String, note: String }
tradePlanDetailRowHtml(t) → '<tr class="trade-detail-row" id="trade-detail-<id>" hidden><td class="trade-detail-cell" colspan="<N+1>"><div class="trade-plan" id="trade-plan-<id>">…</div></td></tr>'
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (store) | `tradePlanTicks`: Largo/Corto absolute, FDAX tick scale, missing tick/entry/stop/exit | `node test/trade-plan-chart.test.js` |
| Structural (VM) | `#tab-calculadora` + button present; `switchTab` list has `calculadora`; calculator/`#riskPreview` in Calculadora, form/trades in Registro; sync reads `#instrument/#stop/#entryPrice/#contracts` | `node test/calculator-tab.test.js` |
| Structural (VM) | `#instrumentTicksPoints` + `#riskStopReference` rendered from `ticksToPoints`/`risk.ticksSL`; points hidden on invalid tick | `node test/calculator-tab.test.js` |

**Existing harnesses that must stay green** (unmodified): `instrument-sync.test.js`, `trades-per-day-input.test.js`, `contracts-ops-coupling.test.js`, `contracts-override.test.js`, `risk-calculator.test.js`, `trade-preview.test.js`, `draft-autofill-ui.test.js`, `exit-target-suggestion.test.js`, `risk-per-trade.test.js`, `stop-per-operation.test.js`, `gain-factor.test.js`.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No migration; no persisted field or Firestore change. Trades without stop/exit degrade (NaN distances → note, no broken SVG). Rollback = revert `store.js`, `app.js`, `index.html`, `css/styles.css` + new tests.

## Open Questions

- [ ] Whether entry-only should render a single-level SVG line or a note only (Decision 2 defaults to a minimal single-level line + note).
