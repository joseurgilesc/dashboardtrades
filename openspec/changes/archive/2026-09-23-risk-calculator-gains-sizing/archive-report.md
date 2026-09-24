# Archive Report: risk-calculator-gains-sizing

**Change**: `risk-calculator-gains-sizing`
**Archive date**: 2026-09-23
**Artifact store**: hybrid (filesystem `openspec/` + Engram)
**Archive disposition**: complete (intentional, no warnings)

## Executive Summary

The gain-based risk factor (`gainFactor`, default 50, presets 20/30/50/60), the Op/día stepper relocation into the calculator "Tamaño" group, and the contracts ⇄ operations coupling are fully implemented, verified, and archived. All 17 implementation tasks are complete; all 9 touched harnesses are green (469 passed, 0 failed) plus the full non-rules suite; canonical `gentle-ai sdd-verify-validate` reports `valid: true`, `verdict: pass` over 7/7 requirements and 18/18 scenarios. No CRITICAL or WARNING findings. The change is additive: it does not remove, rename, or destructively alter any existing requirement.

## Final State (at close)

### Work-unit commits (4, on `main`)

| # | Commit | Scope |
|---|--------|-------|
| 1 | `aadd912` | Pure gain-factor helpers (`todayGains`, `normalizeGainFactor`, `gainsAdjustedAvailable`) + `test/gain-factor.test.js` |
| 2 | `f32419d` | App wiring + markup: `gainFactor` surfaced, "Ganancias hoy" row, Op/día stepper relocated next to contracts |
| 3 | `e566cd1` | Contracts ⇄ operations coupling harness |
| 4 | `17ed7bd` | 5 regression harnesses pinning gain and protection behavior |

The original 3rd commit `7418fbd` was split into `e566cd1` + `17ed7bd` to respect the 400-line PR review budget. This is a later structural change not reflected in the intermediate `apply-progress.md` snapshot.

### Task completion

17/17 implementation tasks complete (all `[x]` in `tasks.md`). Native SDD status confirms `taskProgress: { total: 17, completed: 17, allComplete: true }` and `applyState: all_done`.

### Verification

- Verdict: **pass** — canonical `gentle-ai sdd-verify-validate` → `valid: true`, `verdict: pass`.
- Requirements: 7/7. Scenarios: 18/18.
- Tests: 9 touched harnesses green (469 passed, 0 failed), plus the full non-rules suite.
- Findings: 0 CRITICAL, 0 WARNING.
- Deferred SUGGESTION (out of scope per design "Open Questions"): the "cupo por operación" advisory threshold still reads `perTradeBudget` rather than `effectiveBudget`. No action required for this change.

### Runtime ledger

One apply attempt (862 changed lines) was accepted by the maintainer via reset; the verify objective settled `complete`. No further runtime remediation is outstanding.

## Stale-snapshot reconciliation (Final-State Authority)

| Source | Stale claim | Final state | Evidence |
|--------|-------------|-------------|----------|
| `apply-progress.md` | "16/16 tasks complete"; 3 commits ending in `7418fbd` | 17/17 tasks; 4 commits | `tasks.md` lists 17 checked tasks; `git log` shows `aadd912`, `f32419d`, `e566cd1`, `17ed7bd` |
| `verify-report.md` | "Tasks total 16" | 17 tasks | native `sdd-status` reports `taskProgress.total: 17` |

Both are intermediate snapshots written before the WU3 split; their "pending/total" counts are superseded by the final-state facts above. Neither contains any CRITICAL or WARNING finding that would block archive.

## Spec Sync

Deltas were merged into the base specs using the native `gentle-ai sdd-archive-compose` command (exit 0 for both domains), which preserves unrelated requirements byte-for-byte.

| Domain | Action | Details |
|--------|--------|---------|
| `risk-calculator` | Updated | 1 MODIFIED + 4 ADDED requirements |
| `risk-settings` | Updated | 1 MODIFIED + 1 ADDED requirement |

### risk-calculator

- MODIFIED: `Daily Risk Budget and Usage` — `available = min(dailyBudget, dailyBudget − usedToday + gainFactor/100 × todayGains)`.
- ADDED: `Gain Bonus Never Overrides Protections`
- ADDED: `Single Source for Gain-Adjusted Available`
- ADDED: `Trades-Per-Day Selector Location`
- ADDED: `Contracts ⇄ Operations Coupling`

### risk-settings

- MODIFIED: `Per-Account Risk Settings` — adds per-account `gainFactor` (default 50, presets 20/30/50/60).
- ADDED: `Gain Factor Normalization`

No REMOVED or RENAMED sections. The merge is purely additive; per the project archive rule ("Warn before merging destructive deltas"), no warning is required.

## Archive Contents

- `proposal.md`
- `specs/risk-calculator/spec.md` (delta)
- `specs/risk-settings/spec.md` (delta)
- `design.md`
- `tasks.md` (17/17 complete)
- `apply-progress.md`
- `verify-report.md`
- `archive-report.md` (this file)

## Traceability

Artifacts were read from the filesystem (`openspec/` side of the hybrid store); the orchestrator supplied file-path locators, so no Engram read-side observation IDs apply. This report is persisted to Engram under topic key `sdd/risk-calculator-gains-sizing/archive-report` (project `trading-journal`).

## Risks

- **Low**: `settings.gainFactor` is additive/optional; persisted Firestore rows without the field fall back to 50 via `normalizeGainFactor`. Rollback = revert `js/store.js`, `js/app.js`, `index.html`. No data migration to reverse.
