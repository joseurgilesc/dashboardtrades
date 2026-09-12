```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:9c24965b5414e1a7b70ee933d279547f850561bfd6568736c29904ccb4faaaa1
verdict: pass
blockers: 0
critical_findings: 0
requirements: 36/36
scenarios: 72/72
test_command: 'node C:\Users\user\AppData\Local\Temp\opencode\model-b-check.js; node C:\Users\user\AppData\Local\Temp\opencode\scaling-check.js; node C:\Users\user\AppData\Local\Temp\opencode\pr3-check.js; node C:\Users\user\AppData\Local\Temp\opencode\fast-entry-check.js; node C:\Users\user\AppData\Local\Temp\opencode\bpt-risk-check.js; node C:\Users\user\AppData\Local\Temp\opencode\daily-risk-check.js; node C:\Users\user\AppData\Local\Temp\opencode\risk-discipline-check.js; node C:\Users\user\AppData\Local\Temp\opencode\pr4-check.js; node C:\Users\user\AppData\Local\Temp\opencode\strategy-check.js; node C:\Users\user\AppData\Local\Temp\opencode\coverage-gaps-check.js; node C:\Users\user\AppData\Local\Temp\opencode\verify_journal.js'
test_exit_code: 0
test_output_hash: sha256:a4644e9bbeef5de228337d1b793d675a9cca96abf11900776a12f683e7d27235
build_command: 'node --check js\instruments.js; node --check js\store.js; node --check js\app.js; node --check js\charts.js; node --check js\firebase.js'
build_exit_code: 0
build_output_hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

## Verification Report

**Change**: ux-and-risk-management
**Version**: N/A (delta specs, no version)
**Mode**: Standard (no app test runner, `strict_tdd: false`; browser path N/A)
**Verification pass**: re-verification after the PR 11 micro-equivalent suitability hint slice

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 45 |
| Code tasks complete | 37 (1.1-1.10, 2.1-2.13, 4.1-4.2, 5.1-5.2, 6.1-6.4, 7.1-7.2, 8.1-8.2, 9.1, 10.1) |
| Verification tasks (Phase 3, 3.1-3.8) | Executed by this phase as the manual/VM checklist |
| Code tasks incomplete | 0 |

All Phase 1, 2, 4, 5, 6, 7, 8, 9 and 10 tasks are checked `[x]`. Phase 3 (3.1-3.8) is the manual verification checklist and is the work this phase replaces with executed runtime evidence; it is not counted as an incomplete implementation task.

### Build & Tests Execution

**Build (syntax gate)**: Passed (exit 0) — `node --check js\instruments.js; node --check js\store.js; node --check js\app.js; node --check js\charts.js; node --check js\firebase.js`
```text
(no output; all five files parsed cleanly)
```
`build_output_hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`

**Tests (Node VM harnesses loading the REAL `js/instruments.js` + `js/store.js` + `js/charts.js` and evaluating the real `js/app.js` against a DOM stub)**: Passed (exit 0, 707 assertions, 0 failures)
```text
model-b-check.js          exit=0  85/85   ALL CHECKS PASSED
scaling-check.js          exit=0  73/73   ALL CHECKS PASSED
pr3-check.js              exit=0  34/34   ALL CHECKS PASSED
fast-entry-check.js       exit=0  81/81   ALL CHECKS PASSED
bpt-risk-check.js         exit=0  95/95   ALL CHECKS PASSED
daily-risk-check.js       exit=0  83/83   ALL CHECKS PASSED
risk-discipline-check.js  exit=0  71/71   ALL CHECKS PASSED
pr4-check.js              exit=0  48/48   ALL CHECKS PASSED
strategy-check.js         exit=0  63/63   ALL CHECKS PASSED
coverage-gaps-check.js    exit=0  45/45   ALL CHECKS PASSED
verify_journal.js         exit=0  29/29   RESULT pass=29 fail=0
TOTAL                     707 assertions / 0 failures
```
`test_output_hash: sha256:a4644e9bbeef5de228337d1b793d675a9cca96abf11900776a12f683e7d27235`

**Re-verification delta (vs the prior FAIL)**: the PR 11 slice added the pure `Store.microEquivalent(id)` helper (`js/store.js`), the `#riskSuitabilityHint` advisory element (`index.html`) rendered by the real `renderRiskPanel` (`js/app.js`) with a `.risk-hint` style (`css/styles.css`), and extended `coverage-gaps-check.js` from 34 to 45 assertions driving that hint through the real panel path. The single prior PARTIAL scenario (`risk-calculator / Instrument Size Suitability`) is now COMPLIANT; all 11 harnesses re-run green in this pass (707 assertions, 0 failures).

**Coverage**: Not available (no coverage tool; `coverage_threshold: 0`).

**Browser path**: N/A. The app is a static page gated behind Firebase email/Google auth with no headless runner and no test credentials in this environment. The strategy chart scenario is covered by a stub-backed structural execution of the real `js/charts.js` (see below), not a browser canvas render.

### Spec Compliance Matrix

Authoritative totals measured from the delta specs: **36 requirements / 72 scenarios** (`### Requirement:` / `#### Scenario:`).

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| balance-visibility / Per-Account Balance Display | Both balances shown per account | `pr3-check.js > chip sub shows initial Sim balance` + `chip value shows current Sim balance` + `total sub shows combined initial total` | COMPLIANT |
| balance-visibility / Per-Account Balance Display | Total reflects current balances | `pr3-check.js > total reflects current balances (12000 + 4000 + 0 = 16000)` + `total chip shows the updated 16,048.78` | COMPLIANT |
| balance-visibility / Current Balance Derivation | Current balance includes net results | `pr3-check.js > chip value shows current Sim balance (initial + net)` | COMPLIANT |
| balance-visibility / Current Balance Derivation | No trades yields initial balance | `pr3-check.js > no trades: Sim current balance equals its initial 5000` + `no trades: chip shows the initial $5,000.00` | COMPLIANT |
| balance-visibility / Initial Balance Visible at Entry | Initial balance visible without navigation | `pr3-check.js > chip sub shows initial Sim balance` (header chip on entry view) | COMPLIANT |
| balance-visibility / Initial Balance Visible at Entry | Updated initial balance reflected | `pr3-check.js > Real current balance = 8000 + 48.78 net` + `Real chip sublabel shows the initial $8,000.00` | COMPLIANT |
| balance-visibility / Balance Precision | Defined initial balance never blank | `pr3-check.js > chip sub shows initial Sim balance` (numeric `$10,000.00`) | COMPLIANT |
| balance-visibility / Balance Precision | Missing initial balance treated as zero | `coverage-gaps-check.js > missing initial balance -> Sim/Real/Fondeo 0` + `missing balance: chip shows $0.00` + `never renders NaN` | COMPLIANT |
| daily-scaling-plan / Compounding Projection | Known projection | `scaling-check.js > known numbers 5000/2/rr2/3 -> 5624.32` | COMPLIANT |
| daily-scaling-plan / Compounding Projection | Zero reward ratio stays flat | `scaling-check.js > rr=0 stays flat` | COMPLIANT |
| daily-scaling-plan / Plan Inputs and Defaults | Defaults applied | `scaling-check.js > defaults rr=2/days=20` | COMPLIANT |
| daily-scaling-plan / Plan Inputs and Defaults | Days below one replaced by the default | `scaling-check.js > days=0 -> default 20` | COMPLIANT |
| daily-scaling-plan / Day Count Cap | Oversized horizon clamped | `scaling-check.js > days=1000 clamps to 365` | COMPLIANT |
| daily-scaling-plan / Plan Table | Table rows per day | `scaling-check.js > renderScalingPlan renders 3 rows` | COMPLIANT |
| daily-scaling-plan / Invalid Input | Invalid risk percentage | `scaling-check.js > riskPct=0 -> no rows + warning` | COMPLIANT |
| daily-scaling-plan / Invalid Input | Negative capital | `scaling-check.js > negative capital -> no rows + warning` | COMPLIANT |
| entry-form-defaults / Entry and Exit Default to Now | Fields prefilled at open | `pr3-check.js > resetForm replaces stale times with now` | COMPLIANT |
| entry-form-defaults / Entry and Exit Default to Now | Stale time not retained | `pr3-check.js > resetForm replaces stale times with now` | COMPLIANT |
| entry-form-defaults / Prefilled Values Remain Editable | User override preserved | `fast-entry-check.js > stored trade keeps the user-entered past date` + `does not fall back to today` | COMPLIANT |
| entry-form-defaults / Last-Used Selections Prefilled | Prefill from the last save | `fast-entry-check.js > resetForm prefills all five selects from lastEntry` | COMPLIANT |
| entry-form-defaults / Last-Used Selections Prefilled | Unknown stored value falls back | `fast-entry-check.js > sanitizeLastEntry falls back to first catalog value` | COMPLIANT |
| entry-form-defaults / Last-Used Selections Prefilled | Prefill never clobbers an edit | `fast-entry-check.js > handleEdit keeps the trade's own values` | COMPLIANT |
| entry-form-defaults / Contracts Prefilled From the Calculator | Untouched contracts prefilled | `fast-entry-check.js > contracts prefill while untouched` | COMPLIANT |
| entry-form-defaults / Contracts Prefilled From the Calculator | User edit stops the prefill | `fast-entry-check.js > input event marks contracts touched` | COMPLIANT |
| entry-form-defaults / Duplicate Last Trade | Duplicate creates a new trade | `fast-entry-check.js > duplicate save adds one trade (new id, next number)` | COMPLIANT |
| entry-form-defaults / Optional Fields Collapsed | Collapsed by default | `fast-entry-check.js > advancedOptions collapsed by default` | COMPLIANT |
| entry-form-defaults / Optional Fields Collapsed | Opened when in use | `fast-entry-check.js > duplicate opens advanced options when target copied` | COMPLIANT |
| risk-calculator / Daily Risk Budget and Usage | Budget and usage | `daily-risk-check.js > 3% budget 300 + one -200 loser -> used 200 / available 100` | COMPLIANT |
| risk-calculator / Daily Risk Budget and Usage | Winners and empty days | `daily-risk-check.js > winner-only day keeps used 0` | COMPLIANT |
| risk-calculator / Risk Per Contract and Contract Sizing | P_m excludes commission | `bpt-risk-check.js > P_m 100 (commission kept separate)` | COMPLIANT |
| risk-calculator / Risk Per Contract and Contract Sizing | Per-trade cap binds | `model-b-check.js > cap binds (available 300 -> 1 contract)` | COMPLIANT |
| risk-calculator / Risk Per Contract and Contract Sizing | Remaining budget binds | `model-b-check.js > one -250 loser -> available 50 -> 0 contracts` | COMPLIANT |
| risk-calculator / Risk Per Contract and Contract Sizing | Zero trades per day guarded | `bpt-risk-check.js > tradesPerDay 0 guarded to 1` | COMPLIANT |
| risk-calculator / Risk Panel Values | Panel shows the model-B values | `model-b-check.js > panel Presupuesto/Cupo/Usado/Disponible/Contratos` | COMPLIANT |
| risk-calculator / Risk Panel Values | Invalid input clears the values | `bpt-risk-check.js > invalid panel clears contracts/P_m` | COMPLIANT |
| risk-calculator / Exhausted and Viability Warnings | Budget exhausted | `daily-risk-check.js > available 0 -> 0 contracts + warning` | COMPLIANT |
| risk-calculator / Exhausted and Viability Warnings | One contract exceeds the budget | `bpt-risk-check.js > viability warning when 1 contract exceeds budget` | COMPLIANT |
| risk-calculator / Legacy Stop Distance | Points converted to ticks | `bpt-risk-check.js > legacy stopDistance 2pt -> 8 ticks` | COMPLIANT |
| risk-calculator / Instrument Size Suitability | Size metadata and micro guidance | `coverage-gaps-check.js > every instrument carries a size` + `MICRO_PAIRS maps the 6 full-size instruments` + `computeRisk surfaces size` + `instrument info labels Micro/Full` + `not-viable full-size (ES) shows the suitability hint` + `suitability hint names the micro equivalent (MES)` + `viable full-size hides the hint` + `micro instrument shows no hint` + `exhausted budget does not show the micro hint` | COMPLIANT |
| risk-discipline / Risk Percentage Bounds | Within band | `risk-discipline-check.js > clampRiskPct 1.5 no warning` | COMPLIANT |
| risk-discipline / Risk Percentage Bounds | Above maximum | `risk-discipline-check.js > clampRiskPct 4 -> 3 + warning` | COMPLIANT |
| risk-discipline / Risk/Reward Minimum Warning | Meets minimum | `risk-discipline-check.js > computeRR 100/300 -> 3:1 no warn` | COMPLIANT |
| risk-discipline / Risk/Reward Minimum Warning | Below minimum | `risk-discipline-check.js > computeRR 100/150 -> 1.5:1 warned` | COMPLIANT |
| risk-discipline / Risk/Reward Minimum Warning | Expectancy preserved | `verify_journal.js > kpi expectancy` | COMPLIANT |
| risk-discipline / Asymmetric Recovery Display | Fifty percent drawdown | `risk-discipline-check.js > recoveryPct 0.5 -> 1` | COMPLIANT |
| risk-discipline / Asymmetric Recovery Display | No drawdown | `risk-discipline-check.js > recoveryPct 0 -> 0` | COMPLIANT |
| risk-discipline / Stop Discipline Flagging | Missing stop flagged | `pr3-check.js > exactly one row flagged as missing a stop` | COMPLIANT |
| risk-discipline / Stop Discipline Flagging | Stop present | `pr4-check.js > trade with recorded stop is NOT flagged` | COMPLIANT |
| risk-discipline / Stop Discipline Flagging | Exit-type usage | `risk-discipline-check.js > stopDiscipline BE/trailing counts` | COMPLIANT |
| risk-discipline / Intraday Drawdown and Losing Streaks | Daily drawdown warned | `pr3-check.js > drawdown banner at >= 5%` | COMPLIANT |
| risk-discipline / Intraday Drawdown and Losing Streaks | Losing streak warned | `pr3-check.js > streak banner for 3 consecutive losses` | COMPLIANT |
| risk-discipline / Intraday Drawdown and Losing Streaks | Warning never blocks | `pr3-check.js > submit never disabled` + `fast-entry-check.js > handleSubmit saves` | COMPLIANT |
| risk-discipline / Risk Budget Scaling Base | Prior gains scale the base | `daily-risk-check.js > startOfDayBalance includes yesterday losses (9900)` | COMPLIANT |
| risk-discipline / Risk Budget Scaling Base | Today's results excluded from the base | `daily-risk-check.js > startOfDayBalance ignores today losses` | COMPLIANT |
| risk-settings / Per-Account Risk Settings | Independent values per account | `strategy-check.js > Sim patched / Real default kept` | COMPLIANT |
| risk-settings / Per-Account Risk Settings | Defaults when unset | `strategy-check.js > defaults 2/3 for every account` | COMPLIANT |
| risk-settings / Additive Settings Persistence | Patch preserves unrelated settings | `strategy-check.js > unrelated key preserved` | COMPLIANT |
| risk-settings / Additive Settings Persistence | Missing fields fall back to defaults | `strategy-check.js > Real riskPct default kept` | COMPLIANT |
| risk-settings / Daily Trade Limit Is Warn-Only | Warning at the limit | `pr3-check.js > daily-limit banner at the limit` | COMPLIANT |
| risk-settings / Daily Trade Limit Is Warn-Only | No warning below the limit | `pr3-check.js > daily-limit banner hidden below limit` | COMPLIANT |
| risk-settings / Daily Trade Limit Is Warn-Only | Warning never blocks save | `pr3-check.js > submit never disabled` | COMPLIANT |
| risk-settings / Settings Input Validation | Negative risk percentage rejected | `strategy-check.js > negative riskPct normalized to 2` | COMPLIANT |
| risk-settings / Settings Input Validation | Zero daily limit allowed | `strategy-check.js > zero daily limit allowed` | COMPLIANT |
| strategy-catalog / Strategy Catalog Structure | Catalog exposes eight named strategies | `strategy-check.js > exactly 8 named strategies` | COMPLIANT |
| strategy-catalog / Strategy Catalog Structure | Stable identifiers | `strategy-check.js > all ids non-empty + STRATEGY_IDS order` | COMPLIANT |
| strategy-catalog / Strategy Grouping and Order | Group membership | `strategy-check.js > scalping/swing/legacy id membership` | COMPLIANT |
| strategy-catalog / Strategy Grouping and Order | Scalping shown first | `coverage-gaps-check.js > strategy select renders 3 <optgroup>s ordered Scalping,Swing,Legacy` + `scalping appears before swing and legacy` | COMPLIANT |
| strategy-catalog / Legacy Identifier Fallback | Legacy trade still renders | `strategy-check.js > label legacy E3` | COMPLIANT |
| strategy-catalog / Legacy Identifier Fallback | Unknown identifier fallback | `strategy-check.js > label unknown` | COMPLIANT |
| strategy-catalog / Label Resolution and Chart Ordering | Named strategy label | `strategy-check.js > label named vela-a-vela` | COMPLIANT |
| strategy-catalog / Label Resolution and Chart Ordering | Chart includes legacy entries | `coverage-gaps-check.js > strategy chart keeps catalog order with legacy last` + `includes the legacy E1 entry` + `labels derive from STRATEGY_IDS + Store.strategyLabel` | COMPLIANT |
| strategy-catalog / Stored Strategy Value Stability | Persisted value is the id | `strategy-check.js > seed strategies are catalog ids + CSV keeps id` | COMPLIANT |

**Compliance summary**: 72/72 scenarios compliant (0 PARTIAL, 0 UNTESTED, 0 FAILING).

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| balance-visibility (4 reqs) | Implemented | `Store.getAccountBalances`/`getTotalBalance` (store.js L770-789); `renderBalances` chips + sublabels (app.js L267-290) |
| daily-scaling-plan (5 reqs) | Implemented | Pure `Store.dailyScalingPlan` + Dashboard panel; fully covered |
| entry-form-defaults (6 reqs) | Implemented | `nowTime`, `applyLastEntry`, `getLastTrade`, `duplicateLastTrade`, `<details id="advancedOptions">` |
| risk-calculator (6 reqs) | Implemented | BPT `computeRisk` (store.js L863-940), `dailyRiskUsage` (L990-1038), `startOfDayBalance` (L1047-1056), pure `microEquivalent` (store.js L807-815), `renderRiskPanel` (app.js L611-769) surfacing the `#riskSuitabilityHint` advisory |
| risk-discipline (6 reqs) | Implemented | `clampRiskPct`, `computeRR`, `recoveryPct`, `stopDiscipline`, `intradayDrawdown`, `losingStreak` |
| risk-settings (4 reqs) | Implemented | `setSettings` shallow merge, `getRiskSettings` normalization, warn-only `dailyLimitStatus` |
| strategy-catalog (5 reqs) | Implemented | 13 `{id,name,group}` entries, `STRATEGY_IDS`, `strategyLabel`, `strategyGroup`; chart + selector executed against stubs |

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Strategy shape `[{id,name,group}]` + derived `STRATEGY_IDS` | Yes | 13 entries in `instruments.js` |
| Stable slug id, legacy values byte-identical | Yes | `E1..E5` retained, no remap |
| Single `strategyLabel` resolver with raw fallback | Yes | named/legacy/unknown/empty asserted |
| Flat per-account settings maps + shallow `setSettings` | Yes | patch-preserves-unrelated asserted |
| Risk balance from current balance | Partial (documented deviation) | The panel uses `startOfDayBalance` so today's losses are not double-counted; pure `dailyRiskUsage` still accepts an explicit `balance` |
| Commission separate from `P_m` | Yes | asserted in `bpt-risk-check.js` |
| Warn-only daily limit and drawdown/streak banners | Yes | submit never disabled |
| Size metadata `micro`/`full` + `MICRO_PAIRS` | Yes | Metadata present and asserted; the SHOULD-level micro-equivalent suitability hint is now surfaced by `renderRiskPanel` and asserted through the real panel path |
| Model B numerator `min(perTradeCap, available)` | Yes | PR 9 supersedes the PR 8 raw-available numerator; asserted |

### Issues Found

**CRITICAL**: None.

**WARNING**:
1. `strategy-catalog / Chart includes legacy entries` is proven by a stub-backed structural execution of the real `js/charts.js` (captured Chart.js config labels), not a browser canvas render; the browser path remains N/A (Firebase-auth gated, no headless runner/credentials).
2. Design deviation (documented, spec-consistent): the Registro panel bases the daily budget on `startOfDayBalance` instead of the live current balance to avoid double-counting today's realized losses.
3. No app test runner / no CI; verification relies on Node VM harnesses plus a syntax gate, not a project test command.

**SUGGESTION**:
1. Add a browser or headless end-to-end path (with test credentials) to cover the Firebase-auth-gated UI flow directly.
2. Keep the Node VM harnesses as the regression baseline for the catalog/balance/defaults/risk behaviors.
3. Consider surfacing the micro-equivalent hint in the instrument-info panel as well, so it is visible outside the Registro risk panel.

### Verdict

PASS — 72/72 scenarios and 36/36 requirements have a passing covering runtime test; all 707 executed assertions pass (exit 0) and the syntax gate passes (exit 0). The PR 11 slice surfaces the SHOULD-level micro-equivalent suitability hint through the real `renderRiskPanel` and the extended `coverage-gaps-check.js` (45/45) executes it, so the previously PARTIAL `risk-calculator / Instrument Size Suitability` scenario is now COMPLIANT. No functional defect, regression, or uncovered scenario remains; the change is archive-ready.
