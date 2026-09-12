# Exploration: ux-and-risk-management

> Phase: sdd-explore · Change: `ux-and-risk-management` · Artifact store: hybrid
> Goal: scope and de-risk six user-requested improvements to the existing static
> trading journal (vanilla HTML/CSS/JS + Firebase, no build step): balance
> visibility, date/time defaults, configurable max risk %, daily trade limit,
> named BPT strategies, and a risk/contracts panel.

## Current State

The app is a static multi-file vanilla JS app (IIFE globals, no build step). The
dark "trading terminal" design system was just applied to `css/styles.css`,
`index.html`, and `js/charts.js`. Relevant facts for this change:

### Data model (persisted per user in Firestore)

`Store.emptyState()` (store.js:32-39) is
`{ version: 1, trades: [], balances: { Sim, Real, Fondeo }, settings: {} }`.

- `settings` is already persisted and synced: `meta/settings` doc, read in
  `adapter.fetchAll` (firebase.js:359-365), subscribed in `adapter.subscribe`
  (firebase.js:383-385), written by `adapter.setSettings` (firebase.js:407-410)
  and `persistAll` (store.js:131). It is loaded by `applySettings`
  (store.js:171-173) and exposed by `Store.getSettings()` (store.js:321-323).
- **There is no public `Store.setSettings()` mutation today** — `settings` is
  read-only from the UI's perspective. This is the natural home for the new risk
  % and daily-limit settings.
- Trade shape (`sanitizeTrade`, store.js:267-287) keeps `strategy` as a plain
  string. Existing persisted trades store opaque codes `E1..E5`.
- `getAccountBalances()` (store.js:553-565) = initial balance + sum of net per
  account. `getTotalBalance()` (store.js:567-572). Initial balances live in
  `state.balances` and are edited only in the Ajustes tab.

### Balances today

- Header chips render **current** balance per account plus total
  (`index.html:24-41`, ids `chipSim`/`chipReal`/`chipFondeo`/`chipTotal`;
  `renderBalances`, app.js:196-208).
- **Initial balances** ("montos a manejar") are only editable in Ajustes
  (`index.html:281-303`, ids `balanceSim`/`balanceReal`/`balanceFondeo`;
  `loadBalancesIntoForm`, app.js:585-590; `handleSaveBalances`, app.js:592-603).
  They are easy to miss, which is the user's complaint.

### Date/time defaults today

- `resetForm()` (app.js:442-462) hardcodes `entryDate`/`exitDate` to
  `todayISO()` and `entryTime='09:30'`, `exitTime='09:45'`.
- `todayISO()` (app.js:80-85) exists; there is **no** `nowTime()` helper.
- Validation (`validateForm`, app.js:401-426) requires all four date/time fields.

### Strategy list today

- `STRATEGIES = ['E1','E2','E3','E4','E5']` (instruments.js:27) — opaque codes,
  confirmed by memory `#11` to be exactly what the source Excel (`Tabla_estrategia`)
  contains: codes only, no definitions.
- `fillSelect` (app.js:115-130) sets `option.value === option.textContent`, so the
  form and the filter select (app.js:135, 142) both render raw codes.
- `charts.js` uses `STRATEGIES` as the ordering array for the "Neto por
  estrategia" chart (`renderBarByGroup('chartStrategy', ...)`, charts.js:338-343).
- `matchesSearch` (app.js:163-170) searches `trade.strategy` (the code).
- `filterStrategy` compares `t.strategy !== f.strategy` (app.js:155).
- `seedSample` (store.js:688-722) seeds `'E1'..'E5'`.
- The trades table (`TABLE_COLUMNS`, app.js:214-228) does **not** show strategy;
  only the filter and charts use it. CSV export includes `strategy`
  (store.js:604-608).

### Risk / instruments

- `INSTRUMENTS` (instruments.js:8-21): 12 instruments, each
  `{ pointValue, commission }`. No size class (micro vs full-size) metadata.
- `computeTrade` (store.js:385-427) already computes points, gross, commission,
  net from `pointValue`/`commission`. No risk logic exists anywhere.
- `css/styles.css` defines `--amber`/`--warn` tokens (styles.css:31, 41) but the
  status component only styles `.ok` and `.error` (styles.css:282-290). A warning
  style must be added for non-blocking messages.

### Constraints

- `openspec/config.yaml`: no build step, no ES modules, ES5-compatible IIFE
  globals; comments in English, UI copy in Spanish; `strict_tdd: false`.
- Only test harness is `npm run test:rules` (Firestore rules emulator,
  package.json:9-11). No unit tests, linter, or CI for app logic.

## Affected Areas

- `js/instruments.js` — replace `STRATEGIES` with a strategy identity list
  (`{ id, name, group }`) plus legacy handling; add `size` (micro/full) metadata
  to `INSTRUMENTS`; add `DEFAULT_RISK_PCT` and `DEFAULT_DAILY_TRADE_LIMIT`.
- `js/store.js` — add `Store.setSettings(patch)` mutation (persist via existing
  adapter); add pure risk helpers (`computeRisk`, `minBalanceForOneContract`);
  expose strategy lookup (`getStrategies`, `strategyLabel`, `strategyGroup`);
  keep `sanitizeTrade` strategy as string; update `seedSample` and possibly
  `exportCSV` labels.
- `js/app.js` — `nowTime()` helper; `resetForm` defaults to now; populate the
  strategy selects with id/text/group; add risk inputs + live risk panel render;
  count today's trades and show a non-blocking warning; add risk %/daily-limit
  fields to Ajustes; surface initial balances on entry; update `renderBalances`.
- `index.html` — strategy `<select>` unchanged in structure but now populated with
  grouped options; new risk panel card on Registro; new risk %/daily-limit fields
  in the Ajustes "Saldos iniciales" card; possibly a balances/capital summary.
- `js/charts.js` — strategy chart must map stored ids to display names and order
  by strategy list (currently passes raw `STRATEGIES` strings).
- `css/styles.css` — add `.app-status.warn` (amber) and risk-panel styles; reuse
  existing tokens/cards.
- `js/firebase.js` — no structural change expected; `meta/settings` plumbing
  already exists. `purgeUserData` already deletes `meta/settings`.

## Approaches

### 1. Strategy identity model (the critical data decision)

**1a. Object list with stable ids + legacy group (RECOMMENDED)**
`STRATEGIES = [{ id, name, group }, ...]` where `id` is a stable slug
(`vela-a-vela`, `box-breakout`, ...), `name` is the Spanish display name, and
`group` is `scalping` or `swing`. Stored `trade.strategy` keeps the `id`. Legacy
codes `E1..E5` stay recognized as a `legacy` group rendered as `"E1 (sin
clasificar)"`; no silent semantic remap.
- Pros: stable identity, rename-safe, supports grouping/ordering, existing data
  still renders and filters; no forced data migration.
- Cons: requires touching `fillSelect`, `charts.js`, search, and table label
  rendering; a mapping helper is needed everywhere strategy is displayed.
- Effort: Medium.

**1b. Keep E-codes, add a parallel name map**
Reuse `E1..E8`, map each to a name in a `STRATEGY_NAMES` object.
- Pros: minimal select change; stored codes unchanged.
- Cons: forces an **ambiguous semantic remap** of existing `E1..E5` (we do not
  know which old code meant which new strategy); the source numbering (1,3,4,6 /
  2,5,7,8) is not sequential, so E-code order is misleading. Rejected as primary.
- Effort: Low.

**1c. Store display names as the strategy value**
Persist `"Vela a Vela"` directly.
- Pros: human-readable data; no lookup for display.
- Cons: brittle to renames/typos, no grouping, breaks existing codes, harder to
  filter reliably, chart ordering by name. Rejected.
- Effort: Low.

### 2. Where risk % and daily limit persist

**2a. Extend `state.settings` + add `Store.setSettings(patch)` (RECOMMENDED)**
Store `settings.riskPct` (default 2) and `settings.dailyTradeLimit` (default 3) in
the existing `meta/settings` doc.
- Pros: adapter, subscription, hydration and deletion already exist; no new
  Firestore shape; additive and backward compatible (missing fields fall back to
  defaults).
- Cons: none material.
- Effort: Low.

**2b. New `meta/risk` doc**
- Pros: separation.
- Cons: duplicates plumbing for no benefit. Rejected.
- Effort: Low.

### 3. Risk panel placement

**3a. Dedicated "Riesgo" card on the Registro tab, live-calculated (RECOMMENDED)**
Inputs: account, stop distance (points), optional entry/stop price. Live outputs:
risk budget, risk per contract, suggested contracts, viability warning.
- Pros: visible at the point of entry; reuses `.card`/`.preview`/`.kpi-card`.
- Cons: adds height to Registro.
- Effort: Medium.

**3b. New "Riesgo" tab** — more navigation for a small calculator. Rejected.
**3c. Inline in the form preview** — cramped and mixes concerns. Rejected.

### 4. Balance visibility

**4a. Enhance header chips + add a compact "Capital y riesgo" card on Registro (RECOMMENDED)**
Show initial balance as a sublabel under each chip's current value, and add a
small card at the top of Registro with per-account initial balance, current
balance and per-trade risk budget.
- Pros: satisfies "visible on entry" without a tab switch; reuses tokens.
- Cons: slight header density on mobile.
- Effort: Low–Medium.

**4b. Only a Registro card** — chips stay as-is. Simpler, less visible.
**4c. Only chip sublabels** — cheapest, but risk budget stays hidden.

### 5. Date/time defaults

**5a. Default entry and exit date/time to "now" in `resetForm` (user request)**
Add `nowTime()` (HH:MM) and set `entryDate`/`exitDate` = `todayISO()`,
`entryTime`/`exitTime` = `nowTime()`. `resetForm` runs on boot and after save.
- Pros: matches the request exactly; one small helper.
- Cons: an exit time equal to the entry time is unrealistic; may need a product
  decision (see open questions).
- Effort: Low.

## Recommendation

Adopt **1a + 2a + 3a + 4a + 5a**:

- Model strategies as `{ id, name, group }` objects with a stable slug id, keep
  stored values as ids, add a `legacy` group for `E1..E5`, and centralize display
  through a `strategyLabel(id)` helper used by the table/charts/search.
- Persist `settings.riskPct` (default 2) and `settings.dailyTradeLimit` (default 3)
  through a new `Store.setSettings(patch)` writing to the existing `meta/settings`.
- Put the risk calculator in a dedicated Registro card and the settings in Ajustes.
- Default all four date/time fields to now via a new `nowTime()` helper.
- Daily limit is **warn-only**: count today's trades by `entryDate === todayISO()`
  and show an amber non-blocking message; never block submit.

Risk formula (pure function in `store.js`):

```
riskBudget       = (riskPct / 100) * accountBalance
riskPerContract  = stopDistancePoints * pointValue [+ commission, see open Q]
suggestedContracts = floor(riskBudget / riskPerContract)
viable           = suggestedContracts >= 1
minBalanceForOne = riskPerContract / (riskPct / 100)
```

When `riskPerContract > riskBudget`, warn: one contract already exceeds the
budget, so the instrument is not viable for this account/risk %. The same
`minBalanceForOne` value drives the micro vs full-size suitability guidance.

## Risks

1. **Strategy data compatibility** — existing Firestore trades and imported
   Excel/CSV data store `E1..E5`. They MUST keep rendering, filtering and
   charting. Mitigation: `legacy` group + `strategyLabel` fallback that returns
   the raw id when unknown.
2. **`charts.js` coupling** — the strategy chart passes `STRATEGIES` directly as
   string keys; converting to objects silently breaks the chart unless updated in
   the same change.
3. **Ambiguous E1..E5 → named mapping** — we cannot know which old code meant
   which BPT method. Any automatic remap would corrupt history; do not remap.
4. **No app-logic tests** — only the Firestore rules harness exists. Risk and
   strategy logic will be verified manually; keeping them as pure functions in
   `store.js` makes future unit testing cheap but nothing runs today.
5. **Settings sync** — `settings` is synced across devices; changing risk %/limit
   on one device updates others. Acceptable, but worth stating.
6. **Risk formula ambiguities** — current vs initial balance, and whether
   commission is included, change the suggested contracts. Must be decided.
7. **Micro vs full-size detection** — pointValue alone cannot classify
   instruments (`YM` and `MES` both = 5). Needs explicit `size` metadata, not a
   name heuristic.
8. **Review workload** — six items across five files likely exceed the 400-line
   budget; chained PRs are advisable (strategies/data first, then risk/UX).

## Open Questions (product decisions required)

1. Is risk % and the daily limit **global per user** or **per account**
   (Sim/Real/Fondeo)? ("of the fund" suggests per account, but a single global
   default is simpler.)
2. Does the risk budget use the **current** balance (initial + net) or the
   **initial** balance?
3. Should `riskPerContract` **include commission** (round-trip per contract)?
4. Stop input: **distance in points**, or **entry/stop prices** from which the app
   derives the distance?
5. Should the exit date/time default to "now" like the entry, or stay blank until
   the trade closes?
6. Existing `E1..E5`: keep as a **legacy "sin clasificar" group** (recommended) or
   attempt a best-effort remap (not recommended)?
7. Does the daily limit count **all accounts combined** or **per account**?
8. Micro vs full-size guidance: confirm the threshold rule (e.g., smallest account
   that affords 1 contract at the configured risk %) and the micro/full list.
9. Should the trades table gain a visible **strategy name** column (currently it
   has none)?

## Ready for Proposal

Yes — the code paths are mapped and the approach is low-risk and additive. The
orchestrator should resolve open questions #1–#4 and #7 with the user before
sdd-propose, because they change the data shape and the risk formula.
