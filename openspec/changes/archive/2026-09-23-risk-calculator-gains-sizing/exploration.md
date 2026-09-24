# Exploration: risk-calculator-gains-sizing

> Phase: sdd-explore · Change: `risk-calculator-gains-sizing` · Artifact store: hybrid
> Goal: add a gain-based risk factor, relocate the "Op/día" selector next to the
> contracts field, and make the contracts ⇄ operations coupling explicit.
> This is exploration only — no implementation files were created or modified.

## Current State

The risk calculator (BPT/Francisca Serrano ticks method) lives in `js/store.js`
(pure math) and `js/app.js` (DOM/UI). The sizing chain is:

```
dailyBudget     = (riskPct / 100) × startOfDayBalance
usedToday       = Σ |net| of today's LOSERS (net < 0) for the account
available       = dailyBudget − usedToday
perTradeBudget  = dailyBudget / tradesPerDay        (tradesPerDay ≥ 1)
effectiveBudget = min(perTradeBudget, available)
contracts       = floor(effectiveBudget / P_m)      (P_m = stopTicks × tickValue)
maxTicks1       = floor(effectiveBudget / tickValue)
```

Both sizing (`computeRisk`) and the budget-derived default stop
(`budgetStopTicks` / `resolveInstrumentConfig`) read the **same**
`effectiveBudget` via the shared `riskBudget` helper, so they can never drift.
`available` is computed by `dailyRiskUsage` and passed **into** `computeRisk` and
`resolveInstrumentConfig` from the UI (`renderRiskPanel`). Today there is **no**
notion of today's gains — only losers are summed.

### Key files

- `js/store.js` — pure math: `riskBudget` (1158), `computeRisk` (1277),
  `dailyRiskUsage` (1910), `startOfDayBalance` (1967), `riskGuard` (1443),
  `resolveStopTicks` (1125), `resolveStopTicksSeed` (1222),
  `maxTicksForOneContract` (1534), `getRiskSettings` (534), `setSettings` (567),
  `getMaxContracts` (838), `minBalanceForOneContract` (1505).
- `js/app.js` — UI: `renderRiskPanel` (1899), `renderContractsHint` (746),
  `onTradesPerDayChanged` (1866), `persistTradesPerDay` (1842), `syncContracts`
  (1245), `contractsTouched` flag + wiring (76, 3836–3857, 3731–3752).
- `index.html` — header stepper `#riskTradesPerDayInput` (55–62), calculator
  `#riskContracts` override + `#contractsHint` + `#btnMaxContracts` (256–271),
  trade-form `#contracts` (442–446).
- `js/instruments.js` — `DEFAULT_RISK_PCT` (260), `DEFAULT_DAILY_TRADE_LIMIT`
  (261), `SMALL_ACCOUNT_MAX` (274), per-instrument config comment (276+).

## Report 1 — Exact code locations

### Where `tradesPerDay` is read
- `store.js: resolveTradesPerDay` (1139–1144) — the canonical divisor guard
  (non-numeric → default, `<1` → 1).
- `store.js: riskBudget` (1162) — `resolveTradesPerDay(options.tradesPerDay)`.
- `store.js: minBalanceForOneContract` (1516) and `riskRespectedCount` (2363).
- `store.js: getRiskSettings` (534–546) — returns per-account `dailyTradeLimit`.
- `app.js: renderRiskPanel` (1947–1958) — reads `#riskTradesPerDayInput`, seeds
  from `settings.dailyTradeLimit` on account switch while untouched.

### Where contracts are computed
- `store.js: computeRisk` (1277–1426), the block at 1369–1377:
  `blocked → 0`, `smallAccount → 1`, else `Math.floor(effectiveBudget / pm)`.
- `store.js: riskBudget` (1158–1181) computes `effectiveBudget`.

### Where settings are persisted
- `store.js: setSettings` (567–572) + `persistSettings` (153–157) → Firestore.
- `app.js: Ajustes save` (3244) — `Store.setSettings({ riskPct, dailyTradeLimit, minRR })`.
- `app.js: persistTradesPerDay` (1842–1858) — `Store.setSettings({ dailyTradeLimit })`.
- `store.js: getMaxContracts`/`setMaxContracts` (838–845) — `settings.maxContracts`.

### Where the reverse-sizing hint is rendered
- `app.js: renderContractsHint` (746–764), invoked from `renderRiskPanel` (2158).
  Given N contracts it shows `stop máx. <maxStop> ticks · <maxOps> op/día`, where
  `maxOps = floor(dailyBudget / (n × stopTicks × tickValue))` — note it divides
  the **daily budget**, not the gain-adjusted available.

## Report 2 — How settings are persisted today

Risk settings are stored under `state.settings` (synced to Firestore via
`persistSettings`), as **per-account maps**:

- `settings.riskPct`        → `{ Sim, Real, Fondeo }`, normalized by `normalizeRiskPct` (517).
- `settings.dailyTradeLimit`→ `{ Sim, Real, Fondeo }`, normalized by `normalizeDailyLimit` (523).

`getRiskSettings()` (534) collapses missing/legacy shapes to defaults (2 / 3) per
account. A new `gainFactor` setting therefore belongs as a sibling per-account map
`settings.gainFactor = { Sim, Real, Fondeo }`, read inside `getRiskSettings` next
to `riskPct`/`dailyTradeLimit`, normalized by a new `normalizeGainFactor`
(default **50**, allowed presets **20/30/50/60**). This mirrors the existing
pattern exactly and keeps the calculator's account-switch seeding behavior
consistent. (See open question Q1 on per-account vs single-global.)

## Report 3 — Dual role of "Op/día" + relocation regression risk

The single persisted `dailyTradeLimit` value serves **two** roles:

1. **Sizing divisor** — divides the daily budget into the per-trade cupo
   (`riskBudget`, `computeRisk`, `budgetStopTicks`).
2. **Daily-limit warning** — `dailyLimitStatus` (store 2200) and gamification
   `disciplineDays`/`xpBreakdown` count today's trades against the same number,
   warning (never blocking) at/over the limit.

**Relocation risk** (moving the selector from the header to the calculator panel
next to contracts):

- The DOM element id `#riskTradesPerDayInput` is referenced in **four** places:
  `renderRiskPanel` (1953), `onTradesPerDayChanged` (1868), `resetForm` (2770),
  and the Ajustes-save mirror `tradesMirrorEl` (3265). A pure HTML move that keeps
  the same `id` is safe; renaming the id would require touching all four.
- The **touched-flag semantics** (`tradesPerDayTouched`) must survive the move:
  seed-on-account-switch-only, transient-empty-fallback, and persistence via
  `persistTradesPerDay` → Ajustes `#dailyLimit{Account}` mirror.
- The header layout groups `Riesgo diario` and `Op/día` together (index.html
  46–62); removing `Op/día` leaves a single control and a spacing/CSS change.
- **No data-model regression**: the divisor and the warning keep reading the same
  `dailyTradeLimit`. The only risk is UI/wiring breakage, not math drift.

## Report 4 — Gain-factor math: approaches + where the hard cap lives

The target formula: `available = min(dailyBudget, dailyBudget − usedToday + (gainFactor/100) × todayGains)`.
Crucially, the gain term only matters when `usedToday > 0` (it refills consumed
budget); when nothing was lost, `available` is already `dailyBudget` and the
`min(perTradeBudget, available)` chain is per-trade-bound, so the factor is a
no-op — which is exactly "extra margin", not "larger base".

### Approach A — pure `store.js` helpers (recommended)
- Add `todayGains(inputs)` (sum of `net > 0` of today's account trades — the
  winner mirror of `dailyRiskUsage`'s loser sum) and `gainsAdjustedAvailable({ dailyBudget, used, todayGains, gainFactor })` returning `min(dailyBudget, dailyBudget − used + gainFactor/100 × todayGains)`.
- Extend `dailyRiskUsage` (or a thin wrapper) so `available` already includes the
  gain term; `riskBudget`/`computeRisk`/`budgetStopTicks` then need **no change**,
  because they already consume `available` via `min(perTradeBudget, available)`.
- Pros: matches the project's "pure store helpers, UI never computes sizing"
  discipline; testable in the VM harness without a DOM; the hard cap is in one
  place and the budget-derived stop default widens consistently (both read the
  same `usage.available` object in `renderRiskPanel`).
- Cons: touches `dailyRiskUsage`'s signature/return (small ripple to its tests).
- Effort: Low–Medium.

### Approach B — inline in `app.js renderRiskPanel`
- Compute the adjusted `available` in the UI and pass it as today's `available`
  already does (2046 / 1979).
- Pros: minimal store change; quick.
- Cons: the math becomes UI-only, so it is **not** testable via the pure store
  VM harness (all existing tests load `store.js` without `app.js` DOM); and it
  duplicates the hard-cap logic away from `dailyRiskUsage`, inviting drift between
  the sizing path and the AUTO stop default.
- Effort: Low, but fragile.

### Approach C — new pure helper wired at the `dailyRiskUsage` call site only
- Keep `dailyRiskUsage` untouched; add `gainsAdjustedAvailable` and compute the
  final `available` in `renderRiskPanel` from `usage.dailyBudget`, `usage.used`,
  and a new `todayGains` value, then feed it to both `computeRisk` and
  `resolveInstrumentConfig`.
- Pros: `dailyRiskUsage` untouched (no test ripple there); the hard cap is still
  a single pure function.
- Cons: the adjusted value is assembled in the UI rather than returned by a
  single store call; `renderRiskPanel` grows by a few lines.

### Recommendation
**Approach A**, with the hard cap living inside the `available` computation
(`dailyRiskUsage` + a `gainsAdjustedAvailable` helper). `effectiveBudget =
min(perTradeBudget, available)` already guarantees the per-trade budget never
exceeds `available`, and clamping `available` to `dailyBudget` enforces the
"never exceed the daily budget" rule in the single source both sizing and the
stop default share. The `gainFactor` is added as a new input (`gainFactor`,
`todayGains`) flowing through `dailyRiskUsage` → `available`; `computeRisk` and
`resolveInstrumentConfig` stay unchanged.

## Report 5 — Gotchas

1. **Circuit breakers (`riskGuard` + `computeRisk` Block 4).** `blocked` is
   evaluated before sizing (1364–1377) and forces 0 contracts. The gain term must
   be applied **inside `available` only**, never to `dayLoss`/`drawdownPct`/
   `losingStreak`, so a ≥5% drawdown or 3-loss streak still blocks regardless of
   today's winners. Gain bonus must not resurrect a blocked state.
2. **Small-account filter (`SMALL_ACCOUNT_LIMIT` = 5000).** The branch order
   (`blocked → 0`, `smallAccount → 1`, else floor) means a boosted `available`
   can never push a small account past 1 contract. No change needed, but a test
   should pin it.
3. **`getMaxContracts` cap.** Applied only in the UI suggestion
   (`renderRiskPanel` 2151–2153: `min(risk.contracts, maxC)`) when
   `!contractsTouched`; `computeRisk` itself does not know about it. A gain-boosted
   suggestion is still clamped by the user's contract limit. The "Máx." button
   (3733) resets `contractsTouched=false` and re-renders — it will re-suggest with
   the gain boost, then clamp.
4. **`contractsTouched` override.** Once the user types contracts, the calculator
   stops prefilling (2148–2157) and the "cupo por operación" warning (2167–2187)
   compares `realRisk > risk.perTradeBudget`. Because `perTradeBudget` is the
   `min` binding most of the time, the gain bonus changes `effectiveBudget` only
   when `available` was the binding constraint. If the warning should instead
   reflect the gain-boosted cupo, its threshold must move to `effectiveBudget`
   (open question Q4).
5. **Reverse-sizing hint (`renderContractsHint`).** It divides the **daily
   budget** (not gain-adjusted available) to compute `maxOps`. The gain factor
   will not change the hint today; if scope item 3 wants the hint to reflect the
   gain-adjusted margin, it must read the adjusted `available` (open question Q5).
6. **Budget-derived stop default drift.** `renderRiskPanel` passes the same
   `usage.available` to both `resolveInstrumentConfig` (1979) and `computeRisk`
   (2046). Applying the gain term once upstream (in `dailyRiskUsage` / a wrapper)
   keeps the AUTO stop and the sizing consistent; applying it in only one of the
   two call sites would break the "never drift" invariant.
7. **Gain is a no-op when nothing was lost.** `todayGains` only refills budget
   consumed by `usedToday`. This is intended behavior but must be documented so it
   is not mistaken for a base-capital increase.

## Report 6 — Tests needing new scenarios + new files

Existing harnesses to extend:
- `test/risk-calculator.test.js` — gain-factor scenarios: `available =
  min(dailyBudget, dailyBudget − used + factor×todayGains)`; never exceeds
  `dailyBudget`; default 50; presets 20/30/50/60; gain no-op when `usedToday = 0`.
- `test/contracts-override.test.js` — gain-boosted suggestion still clamped by
  `getMaxContracts`; cupo warning threshold unchanged; real-risk report unchanged.
- `test/stop-per-operation.test.js` — a boosted `available` widens both per-op
  and day stop **only when available binds**.
- `test/risk-per-trade.test.js` — `effectiveBudget`/`maxTicks` respond to the
  gain term when `available` is the binding constraint.
- `test/budget-stop-default.test.js` — the AUTO stop default reflects the
  gain-adjusted `available` (consistency with `computeRisk`).
- `test/trades-per-day-input.test.js` — structural: relocation keeps
  `#riskTradesPerDayInput` + touched semantics + Ajustes mirror intact.
- `test/ratio-target-preview.test.js` — no math change expected; add a structural
  check only if a new gain-factor selector is introduced in the calculator.

New harnesses recommended:
- `test/gain-factor.test.js` — pure: `todayGains`, `normalizeGainFactor`
  (presets/default), `gainsAdjustedAvailable` (hard cap, negative/zero cases).
- `test/contracts-ops-coupling.test.js` — scope item 3: the explicit
  contracts ⇄ operations relationship (reverse hint / any new affordance) respects
  the daily budget.

## Report 7 — Risks and open questions (implementation-level only)

Risks:
- Drift between `computeRisk` and the AUTO stop if the gain term is applied at
  only one of the two `usage.available` consumers (mitigate: apply once upstream).
- Relocating `#riskTradesPerDayInput` breaks wiring if any of the four
  references (render, change handler, reset, Ajustes mirror) is missed.
- `todayGains` must use the same "today" and `account` scoping as
  `dailyRiskUsage`/`riskGuard` (the global day selector `state.globalDate`), or
  winners from other days/accounts would leak into the margin.
- Winners are `net > 0` (matches KPI). Open trades (no exit price) produce no
  meaningful `net` and should be excluded, same as `dailyRiskUsage` today.

Open questions (do **not** reopen agreed scope; these are implementation details
for sdd-propose):
1. Is `gainFactor` per-account (recommended, matching `riskPct`/`dailyTradeLimit`)
   or a single global selector?
2. Where does the gain-factor selector physically live in the calculator panel
   (next to the relocated Op/día? next to risk %?)?
3. For scope item 3, is the contracts ⇄ operations coupling a **display hint**
   (extend `renderContractsHint`) or a new **interactive** bidirectional control?
4. Should the "cupo por operación" warning threshold move from `perTradeBudget`
   to `effectiveBudget` so it reflects the gain-boosted margin?
5. Should the reverse-sizing hint's `op/día` reflect the gain-adjusted available,
   or keep dividing the raw daily budget?
6. Preset semantics: does "60" mean 60% of today's gains become extra margin
   (the natural reading of the formula), and is the selector value persisted as an
   integer percentage?

## Recommendation (summary)

Add pure store helpers (`todayGains`, `gainsAdjustedAvailable`, `normalizeGainFactor`),
apply the gain term once inside `dailyRiskUsage`'s `available` (Approach A), persist
`gainFactor` as a per-account map, keep `#riskTradesPerDayInput`'s id while moving its
markup, and treat scope item 3 as an extended `renderContractsHint` until Q3 is answered.

## Ready for Proposal

Yes — pending answers to open questions Q1 (per-account vs global) and Q3
(display vs interactive coupling), which materially shape the spec and tasks. The
orchestrator should surface Q1 and Q3 to the user before sdd-propose; the rest
can be decided during proposal with sensible defaults.
