# Proposal: process-view-weekly-review

## Intent

Extend the existing Steenbarger "Fase 1" loop (daily process goal + session review) with "Fase 2": split the Dashboard into a **Proceso** view (process KPIs) and a **Resultados** view (financial KPIs), and add a **weekly review** where the trader compares their best and worst *executions* (ranked by process quality, not P&L) to close the training loop.

## Scope

### In Scope
- **"Proceso / Resultados" toggle** inside the existing Dashboard tab, regrouping the existing cards (no new top-level tab).
- **Process indicators**: % trades with plan registered (DERIVED: `plannedRisk` + `stop` + `target` all set); % trades that respected planned stop and risk; daily process-goal compliance; number of sessions reviewed; repeating behavior patterns with case counts.
- **Execution-quality score** (DERIVED, distinct from P&L): `respectedEntry + respectedStop + respectedSize − (planDeviation ? 1 : 0)`.
- **Weekly review** (one good + one bad execution): pick by execution-quality score; compare in one view (strategy, market context, emotion, plan, risk, changes, R result, learning); answer three questions (repeat / deviation trigger / next-week goal); persist additively keyed by date+account.

### Out of Scope
- Steenbarger Fase 3: tags/patterns taxonomy, XP/leaderboard changes.
- Any "market conditions" field redesign beyond what the weekly review strictly needs (reuse `instrument`/`exitType`/`notes`).
- Any new Firestore collection — reuse the existing `meta/settings` doc.

## Capabilities

### New Capabilities
- `process-dashboard`: Proceso/Resultados toggle + process indicators, separate from financial KPIs.
- `weekly-review`: best/worst execution comparison + three questions, persisted by account+week.

### Modified Capabilities
- None.

## Approach

Regroup existing cards behind a segmented control in the Dashboard; keep the KPI grid + outcome card + charts on Resultados and move the XP/discipline/achievements/process-recap + new indicators to Proceso. Add pure `store.js` aggregators (plan-compliance summary, sessions-reviewed count, behavior-pattern counts, execution-quality score) reusing `getDisciplineSummary`, the `respected*` fields, `stopDiscipline`, and `riskRespectedCount`. Persist weekly reviews as a new additive `settings.weeklyReviews` keyed by `account|weekStart`, mirroring `dailyGoals`/`sessionReviews` via `setSettings` (no adapter/rules change). No new trade fields.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `js/store.js` | Modified | New pure aggregators + `settings.weeklyReviews` getter/setter |
| `index.html` | Modified | Proceso/Resultados toggle, process card block, weekly-review UI |
| `js/app.js` | Modified | Toggle wiring, process indicators render, weekly-review picker/form |
| `css/styles.css` | Modified | Styles for new cards + comparison layout |
| `test/*.test.js` | New | VM harnesses for new pure aggregators |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| "Repeating behavior patterns" has no taxonomy | High | Derive counts from `emotion`/`exitType`/`planDeviation`/`notes`; pin the set in specs |
| "R result" column has no realized-R field | Med | Compute `net / tradeRiskUsd` or reuse planned `computeRR`; decide in design |
| `sessionReviews` is date-only vs weekly account+date | Low | New `weeklyReviews` key is additive; Fase 1 untouched |
| No test runner / no CI | Med | One `node test/<name>.test.js` per pure aggregator |

## Rollback Plan

Revert the merge/commit; static redeploy restores prior `store.js`, `app.js`, `index.html`. `settings.weeklyReviews` is additive and optional — older code ignores it, and persisted Firestore `meta/settings` stays valid with or without the key. No migration to reverse.

## Dependencies

None external. Reuses `meta/settings` plumbing; spec phase produces delta specs for `process-dashboard` and `weekly-review`.

## Tests

- **New**: `process-indicators` (plan-compliance %, respected-stop/risk %, sessions-reviewed count, behavior-pattern counts), `execution-quality` (score formula), `weekly-review` (persistence get/set by account+week).

## Success Criteria

- [ ] "Proceso / Resultados" toggle renders inside the Dashboard tab and regroups existing cards.
- [ ] % plan registered is derived as `plannedRisk` + `stop` + `target` all set (no new checkbox).
- [ ] Execution-quality score matches `respectedEntry + respectedStop + respectedSize − (planDeviation ? 1 : 0)` and ranks best/worst execution distinct from P&L.
- [ ] Weekly review (good+bad, 8-field comparison, 3 questions) persists by account+week via `settings.weeklyReviews`.
- [ ] No new Firestore collection or rules change.
