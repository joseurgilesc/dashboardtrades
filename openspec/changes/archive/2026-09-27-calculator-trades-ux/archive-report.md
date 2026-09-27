# Archive Report: calculator-trades-ux

**Change**: `calculator-trades-ux`
**Archive date**: 2026-09-27
**Artifact store**: hybrid (filesystem `openspec/` + Engram)
**Archive disposition**: complete (intentional, no warnings)

## Executive Summary

The per-trade expandable plan chart, the calculator⇄trades tab split, the ticks↔puntos readout, and the read-only Stop reference in the "Objetivo y R/B" result group are fully implemented, verified, and archived. All 17 numbered implementation tasks (1.1–1.2, 2.1–2.6, 3.1–3.3, 4.1, 5.1–5.3) are complete. Verification verdict is **pass** (`pass_with_warnings`): 10/10 requirements and 22/22 scenarios satisfied, 31/31 non-rules harnesses green. The single WARNING is a test-coverage gap (the detail-row toggle open/close and empty-list rendering paths are structurally verified by source inspection, not exercised at runtime by the no-browser VM harness approach), not a defect; the two SUGGESTIONs are optional follow-up assertions for those same paths. No CRITICAL findings, no blockers, no scope creep — no new trade field, no Firestore collection/rules change, no Dashboard/Proceso change.

## Final State (at close)

### Work-unit commits (3 chained PRs, stacked-to-main — LOCAL only, not pushed)

| # | Commit | Scope |
|---|--------|-------|
| 1 | `f4d7b18` | Pure `Store.tradePlanTicks` price→ticks adapter + `trade-plan-chart.test.js` harness |
| 2 | `2d4d39b` | Calculadora tab split + per-trade expandable plan detail row (`js/app.js`, `index.html`) + `calculator-tab.test.js` |
| 3 | `4ba3bf5` | Ticks↔puntos readout + Stop reference + styles (`js/app.js`, `index.html`, `css/styles.css`) |

Earlier planning commit `f71dc5b` (`docs(sdd)`) carried the SDD artifacts. All four commits are local to this repository; nothing has been pushed yet.

### Task completion

17/17 numbered implementation tasks complete (all `[x]` in `tasks.md`: 1.1–1.2, 2.1–2.6, 3.1–3.3, 4.1, 5.1–5.3). No stale unchecked implementation tasks remain.

### Verification

- Verdict: **pass** (`pass_with_warnings`) — `gentle-ai sdd-verify` final report.
- Requirements: 10/10 (trade-plan-chart 4, calculator-tab 4, risk-calculator 2 added). Scenarios: 22/22 (11 + 6 + 5).
- Tests: 31/31 non-rules harnesses ALL PASS (full suite — every `test/*.test.js` except `rules.test.js`). Direct coverage: `trade-plan-chart.test.js` 32, `calculator-tab.test.js` 46, plus green regressions (`instrument-sync.test.js` 37, `instrument-info-panel.test.js` 55, `trade-preview.test.js` 43, `risk-calculator.test.js` 73).
- Findings: 0 CRITICAL, 0 blockers.
  - **WARNING** (coverage gap, not a defect): `trade-plan-chart` "Expandable Detail Row" — toggle open, toggle closed, and empty-list rendering are implemented and structurally pinned, but no runtime harness simulates the click or renders an empty list.
  - **SUGGESTION**: add a runtime assertion for `toggleTradePlan` (`hidden` flip + `aria-expanded`); consider an assertion that an empty trades list emits no `trade-detail-row` markup.

### Scope holds

No new trade field, no Firestore collection, no rules change, no Dashboard/Proceso change. `tradePlanTicks` is read-only over existing fields (`entryPrice`, `stop`, `exitPrice`, `instrument`, `direction`).

## Spec Sync

Three delta specs. `trade-plan-chart` and `calculator-tab` had no base spec, so each was copied mechanically into the base spec tree (full spec, byte-identical). `risk-calculator` had an existing base spec, so its `## ADDED Requirements` were merged via the native `gentle-ai sdd-archive-compose` command (exit 0), which appended the two new requirements without touching the ten existing ones.

| Domain | Action | Details |
|--------|--------|---------|
| `trade-plan-chart` | Created | 4 requirements, 11 scenarios |
| `calculator-tab` | Created | 4 requirements, 6 scenarios |
| `risk-calculator` | Updated (merged ADDED) | 2 requirements added, 5 scenarios (10 → 12 total) |

No MODIFIED, REMOVED, or RENAMED sections. The `risk-calculator` merge is purely additive (two new requirement blocks appended); per the project archive rule ("Warn before merging destructive deltas"), no warning is required.

## Archive Contents

- `proposal.md`
- `exploration.md`
- `design.md`
- `tasks.md` (17/17 implementation tasks complete; no unchecked items)
- `apply-progress.md`
- `verify-report.md`
- `specs/trade-plan-chart/spec.md` (delta)
- `specs/calculator-tab/spec.md` (delta)
- `specs/risk-calculator/spec.md` (delta, ADDED only)
- `archive-report.md` (this file, additive)

## Mechanical Readback Evidence

- **Spec sync — NEW domains**: for `trade-plan-chart` and `calculator-tab`, `git -c core.autocrlf=false diff --no-index` between the change delta spec and the copied base spec returned exit 0 with empty output, and SHA-256 hashes matched — byte-identical.
- **Spec sync — `risk-calculator` merge**: `gentle-ai sdd-archive-compose --canonical openspec/specs/risk-calculator/spec.md --delta openspec/changes/calculator-trades-ux/specs/risk-calculator/spec.md --output ...compose-tmp` returned exit 0. Byte-level readback confirmed the ten original requirements are preserved byte-identical (the merged file's 7595-byte prefix equals the `HEAD` base blob) and the two ADDED requirement blocks are appended byte-identical to the delta's ADDED block (1693 characters match).
- **Archive move**: a pre-move recursive snapshot was created before staging/moving. `git add openspec/changes/calculator-trades-ux/verify-report.md` (single untracked artifact) was run first so the whole directory was tracked; `git mv openspec/changes/calculator-trades-ux openspec/changes/archive/2026-09-27-calculator-trades-ux` returned exit 0. The final `git -c core.autocrlf=false diff --no-index` between the pre-move snapshot and the archived destination returned exit 0 with empty output. The source directory is absent.

## Traceability

Artifacts were read from the filesystem (`openspec/` side of the hybrid store); the orchestrator supplied file-path locators, so no Engram read-side observation IDs apply. This report is persisted to Engram under topic key `sdd/calculator-trades-ux/archive-report` (project `trading-journal`).

## Risks

- **Low**: additive UI only; rollback = revert `js/store.js`, `js/app.js`, `index.html`, `css/styles.css` and delete `test/trade-plan-chart.test.js` + `test/calculator-tab.test.js`. No migration to reverse.
- **Low (coverage)**: the detail-row toggle open/close and empty-list rendering paths are the only structurally-only-verified behavior; a regression there would not be caught by the current suite.
- **Delivery**: the three implementation commits are local only — not yet pushed to any remote.
