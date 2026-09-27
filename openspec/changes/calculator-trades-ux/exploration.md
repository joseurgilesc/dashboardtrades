# Exploration: calculator-trades-ux

> Phase: sdd-explore · Change: `calculator-trades-ux` · Artifact store: hybrid
> Goal: (1) surface the per-trade "compact visual plan" SVG outside the
> calculator, (2) split the calculator into its own tab vs the trades tab,
> (3) add a ticks↔puntos relationship readout, and (4) show the stop reference
> inside the "Objetivo y R/B" card. Exploration only — no source modified.

## Current State

Vanilla HTML/CSS/JS app (ES5 IIFE globals, no build). UI copy is Spanish;
code comments English. Tabs: `registro`, `dashboard`, `ajustes`
(`index.html:97-101`, `switchTab` app.js:3415-3438). The Registro tab
(`#tab-registro`, index.html:149-658) mixes, top to bottom: `#dailyGoalCard`
(150-179), `#reviewCard` (181-204), the "Calculadora de riesgo" card
(206-447, 4 collapsible blocks + `#riskPreview` aside), `#tradeCard` the trade
form (449-639), and the "Trades" table card (641-657).

The risk calculator's math is pure `store.js` (`computeRisk` store.js:1359-1500,
`resolveInstrumentConfig` 1103, `tradePreviewGeometry` 1869); the DOM lives in
`app.js` (`renderRiskPanel` 2040-2365, `renderInstrumentInfo` 1449,
`renderRiskMarketTable` 1615, `renderRiskPreview` 1923).

## Report 1 — Compact visual plan (per-trade chart)

The "compact visual plan" is an SVG rendered **only** in the calculator's
preview aside, never in the trades list or a per-trade detail.

- Markup: `#riskPreview` aside (index.html:437-445) containing
  `#riskPreviewChart` (SVG container, index.html:442), `#riskPreviewEmpty`
  (placeholder, 443), `#riskPreviewRB` (R/B label, 444).
- SVG builder: `riskPreviewSvg(geometry, ctx)` app.js:1809-1915. Levels
  entry/stop/target with Spanish + NinjaTrader labels, tick-distance captions
  (`formatTicks`), deterministic mini candles.
- Pure geometry: `Store.tradePreviewGeometry(inputs)` store.js:1869-1975.
  Inputs are `{ entry, stopTicks, tick, direction, ticksTP }` (TICK distances),
  returns `{ valid, reason, entry, stop, targets, stopTicks, ticksTP, tick,
  direction, min, max, entryY, stopY, targetYs, candles }`.
- Render wrapper: `renderRiskPreview(ctx)` app.js:1923-1969, invoked from
  `renderRiskPanel` app.js:2180-2189 with `ticksTP: [stopTicks * ratio]`.

The trades table (`#tradesBody`) is a flat `<table>`: headers
`TABLE_COLUMNS` app.js:860-878, rows `tradeRowHtml` app.js:1021-1047, body
render `renderTable` app.js:932-966. **There is no expandable detail row, no
per-trade detail panel, and no thumbnail column.**

**Key gap:** a *saved* trade stores PRICES (`entryPrice`, `stop`, `exitPrice`),
not tick distances. `tradePreviewGeometry` expects `stopTicks`/`ticksTP` in
ticks. Rendering a saved trade's plan therefore needs a new derivation:
`stopTicks = |entry − stop| / tick` and `targetTicks = |exit − entry| / tick`
(or use `exitPrice` as the single target), both read off the instrument's
`tick` (per `pointsToTicks` store.js:1032-1038, `ticksToPoints` 1019-1025).

## Report 2 — Calculator vs trades tab split

Tab structure (index.html:97-101) is three buttons + three sections. `switchTab`
(app.js:3415-3438) hardcodes the list `['registro','dashboard','ajustes']`
(3424) and toggles `hidden` on `#tab-{name}`. `hidden` keeps elements in the
DOM, so `$()` reads/writes continue to work across hidden sections.

Registro contents (index.html:149-658): daily goal → session review →
calculator card (206-447) → trade form (449-639) → trades table (641-657).

A split moves the calculator card (+ `#riskPreview` aside) into a new
"Calculadora" tab; "Registro" keeps daily goal + session review + trade form +
trades table (or some other assignment — see Approaches).

**Coupling that must survive the split** (state lives in shared `app.js`
closure + DOM, not per-tab):

- `syncInstrument` (app.js:1337-1347): `#instrument` (form) is canonical,
  `#riskInstrument` (calculator) a mirror; both written on every change.
- `syncContracts` (app.js:1359-1366): `#contracts` canonical, `#riskContracts`
  mirror. `contractsTouched` flag (app.js:87; set at 2008, 2970, 3080, 3248,
  3310, 4151, 4158, 4261, 4273); mirror logic app.js:2261-2272.
- Op/día `#riskTradesPerDayInput` ↔ persisted `dailyTradeLimit`
  (`persistTradesPerDay` app.js:1980-1996, `tradesPerDayTouched`) and Ajustes
  mirror `#dailyLimit{Account}`.
- **Bidirectional form⇄calculator dependency:** `renderRiskPanel`
  (app.js:2040) reads the FORM's `#instrument`, `#direction`, `#stop`,
  `#entryPrice` and writes DRAFT suggestions back into `#stop`/`#exitPrice`
  via `applyDraftAutofill` (app.js:1754-1788). The calculator's stop distance
  (`stopTicks` app.js:2144) derives from the form's `#stop` price when touched.
  This means the calculator is not self-contained: it previews the form's
  in-progress trade. Splitting tabs keeps this working (same DOM, `hidden`
  only), but the user no longer sees form + calculator + preview together.

## Report 3 — Ticks ↔ points relationship

Data (`instruments.js` per instrument): `tick` (price increment) and
`pointValue` (monetary value per point). `tickValue` is **derived**, never
stored: `tickValue = tick * pointValue` (store.js:1367 `computeRisk`;
app.js:1582-1588 `formatTickValue`). Unit bridges: `ticksToPoints = ticks *
tick` (store.js:1019-1025) and `pointsToTicks = points / tick` (store.js:1032),
both exported (store.js:3780-3781).

Render locations for instrument data:

- `renderInstrumentInfo` app.js:1449-1485 → `#instrumentInfo` panel
  (index.html:233). Shows "Valor del punto" (`formatNumber(pointValue)`) and
  "Tick" (`String(tick)`) as two separate rows — no explicit relationship.
- `renderRiskMarketTable` app.js:1615-1663 → `#riskMarketBody` table
  (index.html:253). Columns "Valor por tick" (`formatTickValue`) and "Tamaño de
  tick" (`String(tick)`).
- `renderInstrumentConfigTable` app.js:3630-3666 → `#instrumentConfigBody`
  (index.html:970, Ajustes). "Salidas (ticks · pts)" column + per-row stop
  points via `formatPoints` (app.js:3618-3622, `" pts"` suffix).
- `updatePreview` app.js:1514-1547 → `#previewPointValue` "Valor del punto".

A "ticks↔puntos" readout is fully derivable from existing `tick` + the two
helpers: "1 tick = `tick` puntos" (points per tick) and/or "1 punto = `1/tick`
ticks" (ticks per point). Examples: NQ/MNQ/ES/MES `tick=0.25` → 4 ticks = 1
punto; YM/MYM `tick=1` → 1 tick = 1 punto; 6E/M6E `tick=0.0001` → 10000 ticks
= 1 punto. No new data or store field required.

## Report 4 — Stop reference in "Objetivo y R/B"

Markup (index.html:360-384), group `preview-group--result` "Objetivo y R/B":

| Element id | Label | index.html |
|---|---|---|
| `#riskTicksTP2` | Ticks TP (R/B) | 364-366 |
| `#riskRRRange` | R/B seleccionado | 367-370 |
| `#riskRR` | R/R | 371-374 |
| `#riskRecovery` | Recuperación requerida | 375-378 |
| `#riskCommission` | Comisión | 379-382 |

Stop data already computed and available at this point in `renderRiskPanel`:

- `stopTicks` (app.js:2144) — resolved stop distance (form `#stop` price when
  touched, else `cfg.stopTicks`).
- `risk.ticksSL` (= `stopTicks`, store.js:1494) — already rendered into
  `#riskTicksSL` (app.js:2308) in the separate "Stop" group (index.html:350-358).
- `risk.stopTicks` (store.js:1493); points equivalent via `formatPoints` /
  `ticksToPoints` (app.js:3618, store.js:1019).

So a "Stop: N ticks" (or "N ticks · P pts") reference can be added to the
Objetivo y R/B group from `risk.ticksSL` with zero new computation. Today the
stop is shown only in its own group one row above the target/RB group.

## Affected Areas

- `index.html` — new "Calculadora" tab button + section (request 2); a new
  "Stop" reference row in the Objetivo y R/B group (request 4); optionally a
  per-trade detail/expandable container or thumbnail column in the trades card
  (request 1); a ticks↔puntos readout in Block 2 / instrument info (request 3).
- `js/app.js` — `switchTab` tab list (3415-3438); `tradeRowHtml`/`renderTable`
  for a per-trade chart; a saved-trade geometry adapter (price→ticks) reusing
  `riskPreviewSvg`/`tradePreviewGeometry`; a ticks↔puntos renderer; stop
  reference wiring in `renderRiskPanel`.
- `js/store.js` — optional pure helper to derive a saved trade's plan geometry
  from prices (mirroring `tradePreviewGeometry` but price-based); ticks↔puntos
  is already covered by `ticksToPoints`/`pointsToTicks`.
- `css/styles.css` — styles for the new tab, detail row/thumbnail, readout.
- `test/*.test.js` — VM harnesses for any new pure derivation (saved-trade
  geometry, ticks↔puntos formatting); structural checks for the tab split.

## Approaches

### 1. Per-trade chart surfacing

**1a. Expandable detail row under each trade (RECOMMENDED).** Clicking a row
(or a "Plan" action) expands a hidden `<tr>` that renders `riskPreviewSvg`
from the saved trade's prices.
- Pros: no table reflow cost until expanded; reuses the existing SVG builder.
- Cons: needs a price→ticks adapter + a toggle action in `tradeRowHtml`.
- Effort: Medium.

**1b. Thumbnail column in the trades table.** Add a small always-visible SVG
cell per row.
- Pros: visible at a glance, no interaction.
- Cons: 17-column table gets wider; an SVG per row is noisy for large lists;
  smallest targets are hard to read at thumbnail scale.
- Effort: Medium.

**1c. Per-trade detail/modal (or reuse the form's edit state).** Show the plan
in the existing form area when a trade is selected/edited.
- Pros: reuses the calculator preview already bound to the form.
- Cons: only visible while editing, not while browsing the list; doesn't
  satisfy "each trade in the list".
- Effort: Low but limited.

### 2. Calculator vs trades tab split

**2a. New top-level "Calculadora" tab; Registro keeps goal/review/form/trades
(RECOMMENDED).** Move calculator card + `#riskPreview` aside to `#tab-calculadora`;
extend `switchTab` list.
- Pros: clearest separation; calculator and its preview stay together; form
  stays near the trades list it feeds.
- Cons: user loses the simultaneous form+calculator view (draft autofill runs
  against a hidden form); `hidden`-section coupling must be verified.
- Effort: Medium.

**2b. "Calculadora" tab holds calculator + form; "Registro" becomes
goal/review/trades (list-only).**
- Pros: planning (calculator + form + preview) lives together.
- Cons: the save flow moves away from the trades list; more reshuffle.
- Effort: Medium.

**2c. No new tab — reorder Registro into two collapsible cards.**
- Pros: zero tab wiring; pure HTML/CSS.
- Cons: doesn't actually separate "calculator" from "trades" as requested.
- Effort: Low.

### 3. Ticks ↔ puntos readout

**3a. Add a "1 tick = X pts · 1 punto = Y ticks" line to the Block 2 table /
instrument info panel (RECOMMENDED).** Derive from `tick` + `pointsToTicks`.
- Pros: no new data; localizes the concept where tick size already shows.
- Cons: another row/column; needs a chosen canonical wording.
- Effort: Low.

**3b. Add the relationship to the Ajustes per-instrument config table.**
- Pros: sits where ticks are edited (stop/objective).
- Cons: config screen is secondary; readout belongs with the calculator.
- Effort: Low.

**3c. Per-row "tick · puntos" column in `#riskMarketBody`.** Extend the existing
"Tamaño de tick" column to show both tick size and points-per-tick.
- Pros: reuses the table already rendered every calculator render.
- Cons: table width; `0.0001` ticks render awkwardly (needs `decimalsForTick`).
- Effort: Low.

### 4. Stop reference in Objetivo y R/B

**4a. Add a read-only "Stop" row (ticks + points) to the group (RECOMMENDED).**
Render `risk.ticksSL` (and optional `formatPoints`) into a new `#riskStopRef`
item in the Objetivo y R/B group.
- Pros: zero new math; answers "reference while reading the target".
- Cons: duplicates the stop shown in the "Stop" group above.
- Effort: Low.

**4b. Merge the "Stop" group into Objetivo y R/B.** Move `#riskTicksSL` into the
same group.
- Pros: single consolidated plan readout.
- Cons: more markup churn; the current visual grouping (Stop before Objetivo)
  is intentional.
- Effort: Low–Medium.

**4c. Leave markup; annotate the existing "Ticks TP (R/B)" with the stop.**
- Pros: smallest diff.
- Cons: hides the stop behind the TP label; less clear.
- Effort: Low.

## Recommendation

1. **Chart — 1a**: expandable detail row under each trade, reusing
   `riskPreviewSvg` + a new price-based geometry helper (saved trade → ticks).
   Keeps the table clean and reuses the existing SVG.
2. **Split — 2a**: new "Calculadora" tab holding the calculator + preview; keep
   the form with the trades list. Preserve all `syncInstrument`/`syncContracts`/
   `contractsTouched`/Op-día mirrors by keeping element ids unchanged and only
   adding a `hidden` section; verify draft autofill still runs against the
   (now hidden) form.
3. **Ticks↔puntos — 3a**: a localized "1 tick = X pts / 1 punto = Y ticks"
   readout in the instrument info panel or Block 2, derived from `tick` and
   the existing `pointsToTicks`/`ticksToPoints`.
4. **Stop reference — 4a**: add a read-only stop row (ticks + points) to the
   Objetivo y R/B group from `risk.ticksSL`.

## Risks

- **Saved trades lack tick distances.** Rendering a per-trade chart needs a
  price→ticks derivation; incorrect sign/direction handling (Largo vs Corto)
  would draw the plan inverted.
- **Tab split breaks the simultaneous view.** The calculator reads/writes the
  hidden form (`applyDraftAutofill`, stop-price derivation). If the form and
  calculator are in different tabs, the user loses the live form+calculator+
  preview; draft autofill may surprise when returning to the form.
- **`switchTab` hardcodes the tab list** (app.js:3424); forgetting to extend it
  hides the new section permanently.
- **Multiple id references** (`#riskTradesPerDayInput`, `#contracts`,
  `#riskContracts`) — a rename instead of a pure move breaks 4+ wiring sites.
- **Table width** — the trades table already has 17 columns + actions; a
  thumbnail or a new readout column worsens horizontal scroll on mobile.
- **No test runner/CI** — any new pure derivation should get a `node
  test/<name>.test.js` VM harness to stay verifiable.

## Open Questions (product decisions required)

1. Chart placement: expandable detail row vs thumbnail column vs modal? (1a/1b/1c)
2. For a saved trade with no `exitPrice` (open trade) or no `stop`, what does
   the per-trade chart render — entry-only, placeholder, or hidden?
3. Split assignment: does the trade FORM stay with the trades list (2a) or move
   with the calculator (2b)? Does the daily goal + session review stay in
   "Registro"?
4. Ticks↔puntos wording: "1 tick = X pts" only, or also "1 punto = Y ticks"?
   Which instrument(s) exemplify it in the UI?
5. Stop reference: new row in Objetivo y R/B (4a) or merge the Stop group (4b)?

## Ready for Proposal

Yes — all four areas are mapped and the work is mostly additive (a new tab
section, a re-render of existing geometry, two derived readouts). The
orchestrator should surface **Q1 (chart placement), Q2 (missing-stop/exit
rendering), and Q3 (split assignment)** to the user before sdd-propose, since
they determine the DOM structure and the new geometry helper's contract.
