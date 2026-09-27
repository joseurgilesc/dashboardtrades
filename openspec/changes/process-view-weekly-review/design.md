# Design: process-view-weekly-review

## Technical Approach

Split the Dashboard tab into a Proceso / Resultados view via an in-tab segmented control (`data-view` toggling, no new top-level tab). Add pure `store.js` aggregators for process indicators and the weekly review, reusing `tradeRiskUsd`, `computeRR`, `computeTrade`, `riskRespectedCount`'s cap math, and the `dailyGoals`/`sessionReviews` additive-settings pattern. Persist weekly reviews as a new additive `settings.weeklyReviews` keyed `account|weekStart` via `setSettings` (no adapter/rules change, no new trade fields).

## Architecture Decisions

### Decision 1: Split via `data-view` attributes, not wrapper divs

| option | tradeoff | decision |
|---|---|---|
| Wrap cards in `#procesoView`/`#resultadosView` divs | Reflows CSS grids (kpi/charts/level) | ✗ |
| `data-view` attribute on each top-level card, toggle `hidden` | Zero layout churn; date filter stays shared | ✓ |

**Choice**: tag each dashboard card with `data-view`, one `renderDashboardView()` iterates `#tab-dashboard [data-view]`. The `dashboard-filter` carries no `data-view` and stays visible in both views.

### Decision 2: `respectedStopRisk` reuses `riskRespectedCount`'s cap math via a shared private helper

| option | tradeoff | decision |
|---|---|---|
| Duplicate the running-balance/cap loop | Drifts from `riskRespectedCount` | ✗ |
| Extract private `riskRespectedList`, both counts read it | One source; `riskRespectedCount` unchanged | ✓ |

**Choice**: extract `riskRespectedList(trades, account, opts) → [{trade, risk, cap, respected}]`; `riskRespectedCount` = `filter(respected).length`; new `respectedStopRiskCount` = `filter(r => r.respected && r.trade.respectedStop).length`.

### Decision 3: "R result" = realized money R, fallback planned R/R

| option | tradeoff | decision |
|---|---|---|
| Reuse `realizedR` (price-distance R) | Spec defines `net/tradeRiskUsd`; different value | ✗ |
| `net / tradeRiskUsd`, fallback `computeRR.ratio` | Matches spec; reuses existing helpers | ✓ |

**Choice**: `realizedRResult(trade)` returns `computeTrade(trade).net / tradeRiskUsd(trade)` when `stop>0 && risk>0 && finite`, else `computeRR({plannedRisk,target}).ratio` when valid, else `NaN` (empty state).

### Decision 4: `nextGoal` IS the third review answer

**Choice**: the three questions are `repeat`, `deviationTrigger`, `nextGoal` (per spec "Weekly Review Questions"). No fourth field.

## Data Flow

```
renderAll / switchTab(dashboard)
  └─ renderDashboardView()         # data-view hidden toggle
  └─ renderProcessIndicators()     # Store.getProcessIndicators(account)
  └─ renderWeeklyReview()          # Store.pickBestWorstExecution(trades, account, weekStart)
        │                          # Store.getWeeklyReview(account, weekStart)
        ▼
  btnSaveWeeklyReview ──► Store.setWeeklyReview(account, weekStart, patch)
                              └─► setSettings({ weeklyReviews }) ──► Firestore meta/settings
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `js/store.js` | Modify | Add process aggregators + `weeklyReviews` get/set; extract `riskRespectedList`; export new helpers |
| `js/app.js` | Modify | `state.dashboardView`/`state.reviewWeekStart`; `renderDashboardView`/`renderProcessIndicators`/`renderWeeklyReview`; toggle + save wiring |
| `index.html` | Modify | `data-view` tags; segmented control; `#processIndicatorsCard`; `#weeklyReviewCard` |
| `css/styles.css` | Modify | `.segmented`, `.process-indicator-grid`, `.weekly-compare` styles |
| `test/process-dashboard.test.js` | Create | Pure aggregator assertions |
| `test/weekly-review.test.js` | Create | Picker + persistence round-trip |

## Interfaces / Contracts

```js
isPlanRegistered(trade) → boolean                    // plannedRisk>0 && stop>0 && target>0
executionQualityScore(trade) → -1..3                 // Σ respected* − (planDeviation?1:0)
planRegisteredPct(trades, account) → 0..100          // empty → 0
respectedStopRiskCount(trades, account, opts) → int  // respectedStop && within-cap
respectedStopRiskPct(trades, account, opts) → 0..100
goalCompliance(dailyGoals) → { total, complied, pct } // total 0 = empty state
sessionsReviewedCount(sessionReviews) → int
behaviorPatternCounts(trades, account) → { emotion:{v:n}, exitType:{v:n}, planDeviation:{v:n} }
realizedRResult(trade) → number                      // NaN = empty
pickBestWorstExecution(trades, account, weekStart) → { best, worst, total, weekStart, weekEnd }
getProcessIndicators(account) → { planRegisteredPct, respectedStopRiskPct, goalCompliance, sessionsReviewed, patterns }
getWeeklyReview(account, weekStart) → { bestTradeId, worstTradeId, repeat, deviationTrigger, nextGoal } | null
setWeeklyReview(account, weekStart, patch) → review  // additive via setSettings({ weeklyReviews })
```

`settings.weeklyReviews` shape (additive top-level key):

```js
settings.weeklyReviews = {
  "Sim|2026-09-21": {
    bestTradeId: "t-abc", worstTradeId: "t-xyz",
    repeat: "…", deviationTrigger: "…", nextGoal: "…"
  }
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (store) | plan predicate/% , respected stop+risk, goal compliance, sessions count, pattern counts | `node test/process-dashboard.test.js` |
| Unit (store) | execution-quality score, realized R, best/worst picker (score/net/date tie-breaks, <2 trades) | `node test/weekly-review.test.js` |
| Integration (store) | `setWeeklyReview`/`getWeeklyReview` round-trip + account/week isolation + additive merge | `node test/weekly-review.test.js` |
| Regression | `riskRespectedCount` unchanged after `riskRespectedList` extraction | keep `test/gamification.test.js` green |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No migration. `settings.weeklyReviews` is additive/optional. Trades missing `respected*`/plan fields already sanitize to `false`/`0`/`''` (`sanitizeTrade`), so `isPlanRegistered`→false, `executionQualityScore`→0, `realizedRResult`→NaN (empty), never NaN in any rendered percentage. Rollback = revert the four source files; persisted settings stay valid.

## Open Questions

None.
