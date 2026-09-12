# Archive Report: ux-and-risk-management

**Archived**: 2026-09-11
**Artifact store**: hybrid (filesystem + Engram)
**Final verdict**: PASS
**SDD cycle**: complete

## Executive Summary

The `ux-and-risk-management` change shipped seven capabilities to the static trading journal: named BPT strategy catalog, per-account risk settings, now-defaulted entry form with last-used prefill, balance visibility, a tick-based (BPT) risk calculator with remaining-daily-budget sizing, risk-discipline warnings, and a daily scaling plan. Final `sdd-verify` passed 36/36 requirements and 72/72 scenarios (707 executed assertions across 11 Node VM harnesses, exit 0; syntax gate exit 0). The delta specs were promoted to the main specs, the change folder was moved into the archive, and the archived audit trail carries no unchecked tasks.

## Final State (terminal record)

- **Code tasks**: all 37 complete (Phases 1, 2, 4, 5, 6, 7, 8, 9, 10). Phase 3 (3.1-3.8) is the manual verification checklist; its work was executed as runtime evidence by `sdd-verify`. See the reconciliation note below.
- **Verification**: `sdd-verify` verdict PASS — 36/36 requirements, 72/72 scenarios, 707/707 assertions passing, test exit 0; `node --check` syntax gate exit 0.
- **Deployment**: committed and pushed to `github.com/joseurgilesc/dashboardtrades`, branch `main`. Latest relevant commits: `3a9bf69` (riesgo diario restante + cupo por operación), `6db791e` (calculadora BPT + llenado rápido).
- **Persistence impact**: additive only. `state.settings` gains per-account `riskPct` / `dailyTradeLimit` / `minRR` / `lastEntry`; `trade` gains `stop` / `target` / `plannedRisk`. `trade.strategy` remains a string id and `E1..E5` values are untouched. No migration.

## Capabilities Archived (delta specs promoted to main specs)

The project had no prior `openspec/specs/` baseline (only `.gitkeep`), so each delta spec is a full spec and was copied verbatim into the main specs.

| Domain | Action | Requirements | Scenarios | Main spec |
|--------|--------|--------------|-----------|-----------|
| `risk-settings` | Created | 4 | 9 | `openspec/specs/risk-settings/spec.md` |
| `strategy-catalog` | Created | 5 | 9 | `openspec/specs/strategy-catalog/spec.md` |
| `entry-form-defaults` | Created | 6 | 11 | `openspec/specs/entry-form-defaults/spec.md` |
| `balance-visibility` | Created | 4 | 8 | `openspec/specs/balance-visibility/spec.md` |
| `risk-calculator` | Created | 6 | 12 | `openspec/specs/risk-calculator/spec.md` |
| `risk-discipline` | Created | 6 | 15 | `openspec/specs/risk-discipline/spec.md` |
| `daily-scaling-plan` | Created | 5 | 8 | `openspec/specs/daily-scaling-plan/spec.md` |
| **Total** | | **36** | **72** | |

## Archive Contents

- `proposal.md`
- `exploration.md`
- `design.md`
- `tasks.md` (37/37 implementation tasks complete; no unchecked items)
- `apply-progress.md`
- `verify-report.md`
- `specs/` (7 domains)
- `archive-report.md` (this file, additive)

## Final-State Authority Reconciliation

Sources were ranked per the archive final-state hierarchy (persisted tasks artifact > orchestrator final-state facts > intermediate snapshots).

- **Task completion**: the persisted `tasks.md` carried Phase 3 items 3.1-3.8 as unchecked. The orchestrator's launch prompt states every task is complete, and the final-state facts state Phase 3 was replaced by executed runtime evidence in the verify phase. `verify-report.md` independently proves 72/72 scenarios are covered by executed assertions — exactly the work Phase 3 described. Per the Task Completion Gate's exceptional-reconciliation path, the eight stale checkboxes were marked complete during archive and a reconciliation note was added in `tasks.md`. **Reason**: stale verification-checklist checkboxes for work completed and proven by `verify-report.md`; no implementation task was outstanding.
- **Verification numbers**: carried from `verify-report.md` as the highest-ranked source covering them (36/36 requirements, 72/72 scenarios, 707 assertions, exit 0). The launch prompt corroborates these exact figures.
- **Deployment**: the launch prompt (most recent account) states the code is committed and pushed to `github.com/joseurgilesc/dashboardtrades` (branch `main`); commits `3a9bf69` and `6db791e` were confirmed present in local `git log`.

## Documented Design Deviation

`design.md` records the "Risk balance" decision as the live **current balance** (`getAccountBalances()`). The delivered `renderRiskPanel` instead bases the daily budget on `startOfDayBalance(account)` (initial balance plus net of trades dated before today) so today's realized losses are not double-counted by the remaining-budget model. This is **spec-consistent**: the `risk-calculator` spec requires `dailyBudget = (riskPct/100) × startOfDayBalance` and the `risk-discipline` spec's "Risk Budget Scaling Base" requirement mandates it. The `design.md` decision row is therefore superseded by the spec text and the implementation; it is not a defect. `verify-report.md` records the same deviation as a WARNING.

## Known Limitations (non-blocking)

- **Browser path N/A**: the app is a static page gated behind Firebase email/Google auth with no headless runner and no test credentials in this environment, so end-to-end UI flows are not exercised in a browser.
- **Strategy chart**: the "Chart includes legacy entries" scenario is proven by a stub-backed structural execution of the real `js/charts.js` (captured Chart.js config labels), not a browser canvas render.
- **No project test runner / CI**: verification relies on Node VM harnesses plus a syntax gate; `strict_tdd: false` and no workspace test command.

## Artifact Traceability (Engram observation IDs read)

- `sdd/ux-and-risk-management/proposal` — observation **#16**
- `sdd/ux-and-risk-management/spec` — observation **#17**
- `sdd/ux-and-risk-management/design` — observation **#18**
- `sdd/ux-and-risk-management/tasks` — observation **#19**
- `sdd/ux-and-risk-management/verify-report` — observation **#24**
- `sdd/ux-and-risk-management/apply-progress` — observation **#21** (condensed mirror; authoritative copy on disk) and tail **#23**
- `sdd/ux-and-risk-management/explore` — observation **#15**
- `sdd/ux-and-risk-management/archive-report` — this report (saved by the archive phase)

## Mechanical Readback Evidence

- **Spec sync**: for each of the 7 domains, `git diff --no-index` (raw bytes, `core.autocrlf=false`) between the change delta spec and the copied main spec returned exit 0 with empty output — byte-identical.
- **Archive move**: pre-move recursive snapshot created, then `git mv openspec/changes/ux-and-risk-management openspec/changes/archive/2026-09-11-ux-and-risk-management` returned exit 0. Final `git diff --no-index` between the pre-move snapshot and the archived destination returned exit 0 with empty output. The source directory is absent.

## Source of Truth Updated

The following specs now reflect the shipped behavior:

- `openspec/specs/risk-settings/spec.md`
- `openspec/specs/strategy-catalog/spec.md`
- `openspec/specs/entry-form-defaults/spec.md`
- `openspec/specs/balance-visibility/spec.md`
- `openspec/specs/risk-calculator/spec.md`
- `openspec/specs/risk-discipline/spec.md`
- `openspec/specs/daily-scaling-plan/spec.md`

## Next Recommended

none — the SDD cycle for `ux-and-risk-management` is complete.
