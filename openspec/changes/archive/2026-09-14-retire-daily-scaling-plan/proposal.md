# Proposal: retire-daily-scaling-plan

**Retired**: 2026-09-14
**Type**: spec retirement (capability removal)
**Artifact store**: hybrid (filesystem + Engram)

## Intent

Retire the `daily-scaling-plan` capability spec. The "Plan de escalado diario"
feature was deleted from the codebase entirely, so the live spec claimed a
capability with no implementation. The spec is preserved here as a historical
record instead of remaining under `openspec/specs/` as if it were live.

## Rationale

A spec under `openspec/specs/` is a claim about shipped behavior. Once the
feature is removed, keeping the spec in the live tree makes the source of truth
wrong: future agents would plan and verify against a capability that no longer
exists. Retiring it — rather than silently deleting it — keeps the audit trail
while making the live tree honest.

## Scope

### In Scope

- Move `openspec/specs/daily-scaling-plan/spec.md` to
  `openspec/changes/archive/2026-09-14-retire-daily-scaling-plan/specs/daily-scaling-plan/spec.md`
  with an explicit `RETIRED — 2026-09-14` header.
- Remove the cross-reference to `daily-scaling-plan` from
  `openspec/specs/risk-discipline/spec.md` (Purpose sentence and the
  "Risk Budget Scaling Base" requirement).
- Update the stale live-state mention in
  `openspec/changes/market-data-feed/exploration.md`.

### Out of Scope

- Source code (`js/`, `css/`, `index.html`) — the feature is already removed.
- The archived change `openspec/changes/archive/2026-09-11-ux-and-risk-management/`.
  Its `apply-progress.md`, `archive-report.md`, `tasks.md`, `verify-report.md`,
  and delta specs are an immutable record of what was shipped on 2026-09-11; they
  still describe the feature as it existed then and MUST NOT be rewritten.
- Commit / push.

## Capabilities

### Removed Capabilities

- `daily-scaling-plan` — 5 requirements / 8 scenarios retired.

## Verification

- `openspec/specs/` contains no `daily-scaling-plan` directory.
- A recursive search under `openspec/specs/` for `daily-scaling-plan` / `scaling`
  returns no match.
- `openspec/specs/risk-discipline/spec.md` still stands on its own: the
  "Risk Budget Scaling Base" requirement keeps its two scenarios and no longer
  points at a retired capability.
