# Exploration: process-view-weekly-review

> Phase: sdd-explore · Change: `process-view-weekly-review` · Artifact store: hybrid
> Goal: add a **"Proceso" dashboard view** (process KPIs separate from result
> KPIs) and a **weekly review of one good + one bad execution**, per Brett
> Steenbarger's "El Entrenador de Trading" (Fase 2). This extends the existing
> Steenbarger "Fase 1" daily goal + session review that already ship.

## Current State

The app is a static vanilla JS app (IIFE globals, no build). It already ships a
**Steenbarger "Fase 1"** loop on the Registro tab: a "Meta de proceso de hoy"
and a three-question "Cierre de sesión", both persisted inside `state.settings`
as additive keys. This change (Fase 2) adds the *process-vs-result* dashboard
split and the *weekly best/worst execution* review.

### Data model (persisted per user)

`Store.emptyState()` (store.js:67-74) is
`{ version: 1, trades: [], balances: {Sim,Real,Fondeo}, settings: {} }`.
Everything account-scoped lives in Firestore (see Report 8). `state.settings` is
a single additive document that already carries, alongside risk settings:
`dailyGoals`, `sessionReviews`, `gamification`, `instrumentConfig`, `lastEntry`,
`adjustments`, `withdrawalPct`, `maxContracts`, `minRR`.

## Report 1 — Dashboard structure (where a "Proceso" vs "Resultados" split lives)

- Tabs are in `index.html:97-101`: `registro`, `dashboard`, `ajustes`
  (`data-tab` attributes). **No "Proceso"/"Resultados" tab or toggle exists.**
- Dashboard tab (`index.html:658-774`) renders, top to bottom:
  - `#chartEquity` equity-curve hero (`index.html:676-679`).
  - XP hero + level ladder `#levelHeroBadge`/`#levelLadder` (`index.html:682-700`).
  - KPI grid `#kpi-grid` (`index.html:702-713`) — 10 **financial** cards
    (total trades, win rate, net total, profit factor, expectancy, avg win/loss,
    max drawdown, best/worst trade). Rendered by `renderKpis` (app.js:1161).
  - `#disciplineCard` "Metas y disciplina" → `#goalsList` (`index.html:715-721`).
  - `#achievementsCard` "Logros de proceso" → `#achievementsList`
    (`index.html:723-729`).
  - `#outcomeCard` "Estadística de resultado" → `#outcomeList`
    (`index.html:731-738`); hint reads "Basadas en el resultado (P&L). Son
    informativas: no otorgan XP ni cuentan como logro."
  - `#weeklyRecapCard` "Resumen semanal" → `#weeklyRecap` (`index.html:740-746`).
  - Charts grid `#charts-grid` (`index.html:748-773`): equity, net by instrument,
    strategy, emotion, exit type, win/loss, day-of-week.

**Finding — a process/result separation ALREADY EXISTS conceptually.** The code
and copy already split "proceso" vs "resultado":
- `renderAchievements` (app.js:2579) renders "PROCESO badges"; `renderOutcomeBadges`
  (app.js:2610) renders "RESULTADO badges" (`#outcomeCard`, labelled "Estadística").
- Store badge model has two explicit categories (`store.js:2386-2388`):
  `BADGE_PROCESS = 'process'`, `BADGE_OUTCOME = 'outcome'`.
- The XP hero + discipline + achievements + (process side of) weekly recap are
  process; the KPI grid + outcome card + charts are result. They are just
  interleaved in one scrolling column, not separated into two views.

So a "Proceso"/"Resultados" view is a **re-grouping of existing cards**, not a
new data model.

## Report 2 — Plan-vs-execution data (exact persisted fields)

`sanitizeTrade` (store.js:314-345) is the single trade shape. Plan-compliance
fields (all persisted to Firestore via `addTrade`/`updateTrade` → `persistTrade`):

| Field | Type/coercion | Store line | Form source |
|---|---|---|---|
| `respectedEntry` | boolean (`!!raw`) | store.js:340 | `#respectedEntry` app.js:1334 |
| `respectedStop` | boolean | store.js:341 | `#respectedStop` app.js:1335 |
| `respectedSize` | boolean | store.js:342 | `#respectedSize` app.js:1336 |
| `planDeviation` | string | store.js:343 | `#planDeviation` app.js:1337 |
| `plannedRisk` | number | store.js:332 | `#plannedRisk` app.js:1329 |
| `target` | number | store.js:331 | preserved via `editingTarget` app.js:1328 |
| `stop` | number | store.js:330 | `#stop` app.js:1325 |

The checkboxes live in the "Plan vs ejecución" fieldset of "Más opciones"
(`index.html:585-590`).

**Finding — there is NO `planRegistered` field.** The three `respected*` booleans
+ `planDeviation` are the *only* plan-compliance signals. The first "Proceso"
indicator ("% of trades with a plan registered before executing") has no direct
source; it must either (a) add a new boolean field, or (b) be *derived* from
existing signals (e.g. `plannedRisk > 0 || stop > 0 || target > 0`).

**Finding — `respected*` are write-only today.** They are read back only for
form population/reset (`app.js:2788-2793`, 2849-2852, 2879-2882, 3017-3020,
3036-3037). No calculation, KPI, chart, badge, or export column aggregates them.
So "% respected stop/risk" requires a brand-new aggregation.

## Report 3 — Session review (3 questions): exact structure

Persisted in `state.settings.sessionReviews` as a date-keyed map
(`store.js:606-642`):

```
settings.sessionReviews = { "<YYYY-MM-DD>": { q1, q2, q3, nextAction } }
```

- `sessionReviewsMap()` (store.js:606-609) reads `state.settings.sessionReviews`.
- `getSessionReview(date)` (store.js:627-635) returns `{ q1, q2, q3, nextAction }`.
- `setSessionReview(date, patch)` (store.js:637-642) shallow-merges and persists
  via `setSettings({ sessionReviews })`.
- `getPreviousSessionAction(date)` (store.js:645-653) returns the latest
  `nextAction` strictly before `date` (used for the "Acción de la sesión
  anterior" reminder).
- `nextAction` is just `q3` trimmed (set by the save handler, app.js:3805).
- Save handler `#btnSaveSessionReview` (app.js:3795-3810) keys on
  `state.globalDate || todayISO()`; render (app.js:1250-1259).

**Finding — keyed by date ONLY, not account.** `sessionReviews[date]` has no
account dimension. The weekly-review requirement ("stored by date/account") does
not match this shape.

## Report 4 — Daily process goal + compliance state

Persisted in `state.settings.dailyGoals` (`store.js:601-625`):

```
settings.dailyGoals = { "<YYYY-MM-DD>": { goal, status, note } }
```

- `getDailyGoal(date)` / `setDailyGoal(date, patch)` (store.js:611-625).
- `status` is a compliance string with four values (`index.html:163-168`):
  `''` (Pendiente), `'cumplida'`, `'parcial'`, `'no'` ("No cumplida").
- Save handler `#btnSaveDailyGoal` (app.js:3779-3793); render (app.js:1232-1247).

**Finding — compliance IS captured** as a status string, but **only for the
"today" goal, keyed by date, not account**, and there is no history aggregation
(e.g. "% of days cumplida") anywhere. The "Proceso" indicator "daily
process-goal compliance" has raw data but no summarizer.

## Report 5 — Discipline/process summary (`getDisciplineSummary`)

`Store.getDisciplineSummary(account)` (store.js:3154-3200) is the existing
aggregate. Return shape:

```
{
  account, xp, computedXp, badgeXp,
  level: levelInfo(xp),                  // { xp, level, perLevel, intoLevel, toNext, progressPct }
  streak: { current, best },
  days,                                  // disciplineDays output
  achievements: [...],                   // legacy ACHIEVEMENTS (process)
  processBadges: [...],                  // BPT process rungs
  outcomeBadges: [...],                  // BPT outcome stats
  recap: weeklyRecap(...),               // see below
  goals: goalProgress(...),              // { dailyLimit, minRR, weeklyDiscipline, rrCompliance }
  weeklyGoal
}
```

Pure process counters already available for reuse (all account-scoped):
- `stopDiscipline(trades, account)` (store.js:2259-2277) → `{ total, withStop,
  missingStop, missing[], breakEven, trailing }`.
- `riskRespectedCount` (store.js:2510-2523) — trades whose `tradeRiskUsd` ≤
  per-trade cap.
- `rrMetCount` (store.js:2526-2534) — trades meeting `minRR`.
- `xpBreakdown` (store.js:2541-2575) → `{ total, base, stop, rr, dayBonus,
  disciplinedDays, perTrade, perDay }`.
- `disciplineStreak` / `disciplineDays` (store.js:2445-2483).
- `completedTradeCount` (store.js:2645-2649).
- `weeklyRecap(trades, account, opts)` (store.js:3002-3047) → `{ valid, account,
  weekStart, weekEnd, totalTrades, daysWithTrades, disciplinedDays,
  overTradedDays, withStop, missingStop, metRR, rrEvaluable, bestHabit,
  worstLeak }`.

**Gaps — two requested indicators have NO counter:** "number of sessions
reviewed" (would read `sessionReviews` keys) and "repeating behavior patterns
with case counts" (would need a new pattern taxonomy + aggregation over
`planDeviation`/`notes`/`emotion`/`exitType`).

## Report 6 — Trade fields for the weekly review

Full persisted trade shape (`sanitizeTrade`, store.js:314-345):
`id, tradeNumber, account, instrument, contracts, strategy, direction,
entryDate, entryTime, entryPrice, exitDate, exitTime, exitPrice, stop, target,
plannedRisk, commission, exitType, emotion, notes, imageUrl, respectedEntry,
respectedStop, respectedSize, planDeviation`.

Computed enrichment (`computeTrade`, store.js:700-749; `computeAll`, 755-769):
`points, pointValue, gross, commission, net, durationMinutes, dayOfWeek,
dayOfWeekName, month, year, cumulative`.

R/R is **planned** only: `computeRR({plannedRisk, target, minRR})`
(store.js:2194-2211) → `{ valid, reason, ratio, minRR, meetsMinimum, warned }`.
There is **no realized-R (R-multiple of the actual result)** field anywhere.

- `strategy` is a catalog id (see `strategyLabel` store.js:414-421; `strategyGroup`
  423-426). "Market conditions" has no dedicated field — closest are
  `instrument`, `exitType`, and `notes`.
- Screenshot = `imageUrl` (store.js:339), uploaded to Firebase Storage
  (`#tradeImage`, app.js:3812-3834).
- Filter/sort: `tradesForAccount(trades, account)` (store.js:2403-2409) filters
  by account and requires `entryDate`; `sortChronologically` (store.js:2227-2234).
  Dashboard date range is client-side in `getDashboardTrades` (app.js:564-588);
  main table via `getFilteredTrades` (app.js:557-561).

## Report 7 — Execution-quality signal (the gap for best/worst execution)

**Nothing ranks execution quality.** The plan-compliance booleans are stored but
never aggregated (Report 2). XP and badges reward *process proxies* (stop
recorded, R/R ≥ min, disciplined days, risk-in-band) but never produce a
per-trade "execution quality" score, and there is no UI to pick a trade by
quality. The KPI "best/worst trade" (`getKpis`, store.js:809-812) ranks by `net`
(P&L), which is exactly the *wrong* axis for the Steenbarger exercise.

**Gap:** a quality signal must be defined (e.g. count of `respectedEntry` +
`respectedStop` + `respectedSize`, optionally minus `planDeviation`), plus a
picker/list ranked by that signal, distinct from P&L.

## Report 8 — Persistence (account-scoped user data)

Firestore layout (`firebase.js:349-434`):
- `users/{uid}/trades/{tradeId}` — one doc per trade; trade `id` is the doc id
  (body omits `id`, `tradeData` firebase.js:362-366).
- `users/{uid}/meta/balances` — initial balances.
- `users/{uid}/meta/settings` — the single settings doc (read in `fetchAll`
  firebase.js:378-391; subscribed firebase.js:397-414; written firebase.js:431-434).

`Store.setSettings(patch)` (store.js:588-593) shallow-merges into
`state.settings` and persists the whole doc. `dailyGoals`, `sessionReviews`,
`gamification` all ride this doc as additive keys. Legacy localStorage key
`bpt.journal.v1` (store.js:15) is only a one-time migration source.

**Implication:** a weekly-review artifact + process-view aggregates can be
persisted as new additive keys on the same `meta/settings` doc (matching the
existing `dailyGoals`/`sessionReviews`/`gamification` pattern) with **no
Firestore rules or adapter change**. If a per-trade "plan registered" boolean is
added, it rides the trade doc (a `sanitizeTrade` field + `readForm` mapping).

## Affected Areas

- `index.html` — new "Proceso" view (tab, sub-tab, or re-grouped section) on the
  Dashboard; a weekly-review card/form (best/worst execution picker + 8-field
  comparison + 3 questions). Spanish copy.
- `js/store.js` — new pure aggregators (`planComplianceSummary`,
  `sessionsReviewedCount`, `behaviorPatternCounts`, execution-quality score),
  a new `settings.weeklyReviews` (or `sessionReviews` account-dimension) shape,
  and getters/setters mirroring `getSessionReview`/`setSessionReview`.
- `js/app.js` — render the Proceso view; weekly-review UI wiring; account+week
  scoping.
- `js/charts.js` — only if a process chart is added (optional).
- `css/styles.css` — styles for the new cards/comparison layout.
- `js/firebase.js` — no change expected (settings doc already generic).
- `test/*.test.js` — new VM harnesses for the pure store aggregators (pattern:
  `daily-goal.test.js`, `gamification.test.js`).

## Approaches

### 1. Proceso/Resultados placement

**1a. Re-group the existing Dashboard into two sections, sub-tab or pill toggle
(RECOMMENDED).** Add a "Proceso / Resultados" segmented control inside the
Dashboard tab that shows/hides the existing cards: Proceso = XP hero +
discipline + achievements + (process side of) weekly recap + the new process
indicators; Resultados = KPI grid + outcome card + charts.
- Pros: reuses 100% of existing cards and copy; no new tab; matches the
  already-existing process/outcome split; smallest diff.
- Cons: the equity curve and some cards sit between the two groups; needs a
  decision on where equity/weekly-recap go.
- Effort: Low–Medium.

**1b. New top-level "Proceso" tab.** Add a 4th tab next to Registro/Dashboard/
Ajustes.
- Pros: clear separation, room to grow the process view.
- Cons: more navigation; duplicates the Dashboard's identity; the existing
  process cards would move out of Dashboard leaving it result-only, which is a
  bigger reshuffle.
- Effort: Medium.

**1c. Reorder cards in-place without a toggle.** Just physically group process
cards above result cards under two `<h2>` headings.
- Pros: zero JS; pure HTML/CSS reorder.
- Cons: one long scroll, no real "view" separation; scales poorly as the process
  view grows.
- Effort: Low.

### 2. Weekly-review UI + persistence

**2a. New additive key `settings.weeklyReviews`, account-scoped, keyed by
`account|week` (RECOMMENDED).** Shape:
`{ "<account>|<weekStart>": { goodTradeId, badTradeId, fields..., q1, q2, q3 } }`
(or nested `{ account: { week: {...} } }`). Reuses `setSettings`/`meta/settings`
plumbing with zero adapter change.
- Pros: no Firestore migration; mirrors `dailyGoals`/`sessionReviews`; satisfies
  "by date/account"; survives export/import (settings is part of `exportJSON`).
- Cons: `sessionReviews` already exists date-only — a parallel shape risks two
  review concepts; should either extend `sessionReviews` keys to be
  account-qualified or clearly separate weekly vs daily.
- Effort: Medium.

**2b. Store the weekly review as fields on the two selected trades.** Add
`reviewQ1/Q2/Q3`, `reviewRole` (good/bad) to the trade doc.
- Pros: review travels with the trade.
- Cons: the "learning"/"next week goal" are weekly, not per-trade; pollutes the
  trade shape; harder to query per-week.
- Effort: Medium. Rejected as primary.

**2c. New Firestore collection `users/{uid}/meta/reviews` (doc per week).**
- Pros: clean isolation, unbounded growth friendly.
- Cons: requires new adapter + rules review + migration; overkill for one
  artifact the settings doc already accommodates.
- Effort: High. Rejected.

### 3. Execution-quality signal

**3a. Derived quality score from existing `respected*` + `planDeviation`
(RECOMMENDED).** `quality = (respectedEntry?1:0) + (respectedStop?1:0) +
(respectedSize?1:0) - (planDeviation ? 1 : 0)`, plus a new optional
`planRegistered` boolean for the "% with plan" indicator.
- Pros: no migration for the score itself; the only new field is one boolean.
- Cons: score is coarse (0-3); ignores magnitude of deviation.
- Effort: Low.

**3b. Add a 1-5 explicit "execution quality" rating field on the trade.**
- Pros: captures the trader's own judgment (closest to Steenbarger's intent).
- Cons: one more manual field; retrospective backfill for existing trades.
- Effort: Low–Medium.

## Recommendation

1. **Placement — 1a**: a "Proceso / Resultados" toggle inside the Dashboard tab
   that regroups the existing cards; add the new process indicators to the
   Proceso side and keep the KPI grid + outcome card + charts on the Resultados
   side. Lowest risk, reuses the already-present process/outcome separation.
2. **Weekly review — 2a**: `settings.weeklyReviews` account-scoped keyed by
   `account|weekStart`, mirroring `dailyGoals`/`sessionReviews`; add a
   getter/setter pair (`getWeeklyReview(account, weekStart)`,
   `setWeeklyReview(...)`) beside the existing ones. Resolve the
   daily-vs-weekly review relationship explicitly in the proposal.
3. **Quality signal — 3a**: derived score from `respected*` + `planDeviation`,
   plus a new `planRegistered` boolean (added to `sanitizeTrade` + `readForm`)
   to power the "% with plan" indicator. Optionally upgrade to an explicit 1-5
   rating (3b) if the user wants self-assessed quality.

## Risks

- **No `planRegistered` field** — the first process indicator has no data source
  today; requires a new field or a documented derivation.
- **`respected*` fields are write-only** — no aggregation exists; "% respected
  stop/risk" is a brand-new calculation, not a re-skin.
- **Account dimension missing on reviews/goals** — `sessionReviews` and
  `dailyGoals` are date-only; "stored by date/account" needs a deliberate shape
  change without breaking Fase 1 (which renders by `globalDate`).
- **"Repeating behavior patterns" is open-ended** — needs a taxonomy decision
  (derive from `emotion`/`exitType`/`planDeviation`/`notes`, or free-form tags).
- **"Market conditions" has no field** — the weekly-review comparison asks for
  it; only `instrument`/`exitType`/`notes` approximate it today.
- **No realized-R field** — the "R result" column in the comparison must be
  computed (e.g. `net / tradeRiskUsd`) or the planned `computeRR` reused.
- **No test runner / no CI** (config.yaml) — new pure aggregators should each
  get a `node test/<name>.test.js` VM harness to stay verifiable.
- **Review workload** — new view + new aggregators + UI spans ≥4 files; likely
  exceeds the 400-line budget; plan chained PRs (store aggregators first, then UI).

## Open Questions (product decisions required)

1. Placement: a "Proceso/Resultados" toggle inside Dashboard, or a new top-level
   "Proceso" tab?
2. "% of trades with a plan registered": add a new boolean field, or derive it
   from `plannedRisk/stop/target > 0`?
3. Execution quality: derived from `respected*`, or an explicit 1-5 self-rating?
4. "Repeating behavior patterns": which fields feed it, and is the taxonomy
   fixed or free-form?
5. Weekly review scope: extend `sessionReviews` with an account dimension, or a
   separate `weeklyReviews` map?
6. "Market conditions" in the comparison: reuse `instrument`/`exitType`, or add a
   dedicated field?

## Ready for Proposal

Yes — the code paths are mapped and the change is mostly additive (re-grouping
existing cards + new pure aggregators + one settings shape). The orchestrator
should surface **Q1 (placement), Q2 (plan-registered source), Q3 (quality
signal), and Q5 (review persistence shape)** to the user before sdd-propose,
because they determine the data shape and the UI structure.
