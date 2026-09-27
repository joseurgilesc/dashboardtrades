# Apply Progress: calculator-trades-ux

## Batch: PR 1 of 3 (stacked-to-main)

Pure `Store.tradePlanTicks` price-to-ticks adapter in `js/store.js` plus its
`trade-plan-chart.test.js` VM harness. No DOM wiring, no `app.js` / `index.html`
/ `css/styles.css` changes (those are PRs 2 and 3).

## Work Unit Evidence

| Evidence | Value |
|----------|-------|
| Focused test command + result | `node test/trade-plan-chart.test.js` → `32 passed, 0 failed` (exit 0) |
| Runtime harness command + result | Same command (pure logic unit; no browser/runtime boundary beyond the VM harness) |
| Rollback boundary | Revert `js/store.js` (adapter fn + export line) + delete `test/trade-plan-chart.test.js`; no other files touched |

## Completed Tasks

- [x] 1.1 Add pure `tradePlanTicks(trade)` near `tradePreviewGeometry` — returns `{ valid, entry, stopTicks, targetTicks, tick, direction }`; `stopTicks = |entry−stop|/tick`, `targetTicks = |exit−entry|/tick` (absolute), NaN on missing stop/exit/tick or tick ≤ 0, `valid=false` when entry missing/NaN/≤ 0.
- [x] 1.2 Export `tradePlanTicks` in the Store return tail (next to `tradePreviewGeometry`).

Also shipped (PR 1 scope): `test/trade-plan-chart.test.js` covering `tradePlanTicks`
(Largo/Corto absolute, FDAX 0.5 scale, passthrough, missing entry/stop/exit,
missing/zero tick). The `tradePlanSvg` degraded-path portion of task 5.1 remains
for PR 2 (task 2.4).

## Verification (full regression)

`Ran 30 harnesses / ALL PASS` — every `test/*.test.js` except `rules.test.js`
(30 harnesses incl. the new `trade-plan-chart.test.js`).

## Files Changed

| File | Action |
|------|--------|
| `js/store.js` | Modified — added `tradePlanTicks` + export |
| `test/trade-plan-chart.test.js` | Created |
| `openspec/changes/calculator-trades-ux/tasks.md` | Marked 1.1 / 1.2 `[x]`; annotated 5.1 split |

## Remaining (PRs 2 and 3)

Phase 2 (tasks 2.1–2.6), Phase 3 (3.1–3.3), Phase 4 (4.1), task 5.1 `tradePlanSvg`
degraded-path coverage, tasks 5.2 / 5.3.
