# Tasks: Process View + Weekly Review

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~490–590 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----|----------------------|-----------------|-------------------|
| 1 | Pure aggregators + weekly-review persistence in `js/store.js` | PR 1 | `node test/process-dashboard.test.js` | `node test/weekly-review.test.js` | Revert `js/store.js`; delete the two new tests |
| 2 | App wiring + markup (`js/app.js`, `index.html`) | PR 2 | `node test/process-dashboard.test.js` | `node test/weekly-review.test.js` | Revert `js/app.js`, `index.html` |
| 3 | Styles (`css/styles.css`) | PR 3 | `node test/process-dashboard.test.js` | `node test/weekly-review.test.js` | Revert `css/styles.css` |

## Phase 1: Pure logic (`js/store.js`)

- [ ] 1.1 Add `isPlanRegistered(trade)` → `plannedRisk>0 && stop>0 && target>0` (PRD-2; design `isPlanRegistered`).
- [ ] 1.2 Extract private `riskRespectedList(trades, account, opts)` from `riskRespectedCount`'s cap loop; `riskRespectedCount` = `filter(respected).length` — keep `test/gamification.test.js` green (PRD-3; design Decision 2).
- [ ] 1.3 Add `planRegisteredPct`, `respectedStopRiskCount`, `respectedStopRiskPct` (`r.respected && r.trade.respectedStop`) (PRD-2/PRD-3; design contracts).
- [ ] 1.4 Add `goalCompliance(dailyGoals)` (`status==='cumplida'`), `sessionsReviewedCount(sessionReviews)` (PRD-4/PRD-5; design contracts).
- [ ] 1.5 Add `behaviorPatternCounts(trades, account)` over `emotion`/`exitType`/`planDeviation`, excluding `''` (PRD-6; design contract).
- [ ] 1.6 Add `executionQualityScore(trade)` = `Σ respected* − (planDeviation?1:0)` (WR-1; design contract).
- [ ] 1.7 Add `realizedRResult(trade)` = `net/tradeRiskUsd` when usable, else `computeRR(...).ratio`, else `NaN` (WR-4; design Decision 3).
- [ ] 1.8 Add `pickBestWorstExecution(trades, account, weekStart)` → `{best,worst,total,weekStart,weekEnd}`; score rank, tie-break `net` then earliest `entryDate`, `<2` trades empty (WR-2; design contract, reuses `weekBounds`/`sortChronologically`).
- [ ] 1.9 Add `weeklyReviewsMap()`, `getWeeklyReview(account, weekStart)`, `setWeeklyReview(account, weekStart, patch)` keyed `account|weekStart` via `setSettings({ weeklyReviews })` (WR-6; design `settings.weeklyReviews` shape).
- [ ] 1.10 Export all new helpers in the Store return object (`js/store.js` tail).

## Phase 2: DOM wiring (`js/app.js`, `index.html`)

- [ ] 2.1 `index.html`: add segmented control (`#dashboardViewToggle`) inside `#tab-dashboard`, above `dashboard-filter` (PRD-1; design Decision 1).
- [ ] 2.2 `index.html`: add `data-view` to each top-level card — `proceso`: level-hero, `#disciplineCard`, `#achievementsCard`, `#weeklyRecapCard`; `resultados`: chart-hero, `kpi-grid`, `#outcomeCard`, `charts-grid` (PRD-1).
- [ ] 2.3 `index.html`: add `#processIndicatorsCard` (plan %, respected stop/risk %, goal compliance, sessions reviewed, patterns) and `#weeklyReviewCard` (comparison grid + three question fields + save button), both `data-view="proceso"` (PRD-2..6, WR-3/WR-5).
- [ ] 2.4 `js/app.js`: add `state.dashboardView`/`state.reviewWeekStart`; `renderDashboardView()` toggles `hidden` on `#tab-dashboard [data-view]` (PRD-1).
- [ ] 2.5 `js/app.js`: `renderProcessIndicators()` reads `Store.getProcessIndicators(account)` and fills `#processIndicatorsCard` (PRD-2..6).
- [ ] 2.6 `js/app.js`: `renderWeeklyReview()` calls `pickBestWorstExecution` + `getWeeklyReview`, renders 8-field comparison and question values (WR-2/WR-3/WR-5).
- [ ] 2.7 `js/app.js`: wire toggle click → set `state.dashboardView` + `renderAll()`; save button → `Store.setWeeklyReview(...)` with the three answers (PRD-1, WR-5/WR-6).

## Phase 3: Styles (`css/styles.css`)

- [ ] 3.1 Add `.segmented`, `.process-indicator-grid`, `.weekly-compare` styles matching existing card/grid tokens (PRD-1/WR-3).

## Phase 4: Tests

- [ ] 4.1 Create `test/process-dashboard.test.js` (VM harness): `isPlanRegistered`, `planRegisteredPct` (all/partial/empty), `respectedStopRiskPct` (respected/over-cap/empty), `goalCompliance` (mixed/no goals), `sessionsReviewedCount`, `behaviorPatternCounts` (recurring/empty/no trades) — PRD-2..6.
- [ ] 4.2 Create `test/weekly-review.test.js`: `executionQualityScore` (3/2/−1), `realizedRResult` (realized/fallback/NaN), `pickBestWorstExecution` (distinct/tie/<2), `setWeeklyReview`/`getWeeklyReview` round-trip + account/week isolation + additive merge — WR-1..6.
- [ ] 4.3 Run regression: `node test/gamification.test.js` green after `riskRespectedList` extraction; then all of `node test/process-dashboard.test.js`, `node test/weekly-review.test.js`.
