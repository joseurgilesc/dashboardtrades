# Exploration: market-data-feed

> Phase: sdd-explore · Change: `market-data-feed` · Artifact store: hybrid
> Goal: add **delayed** instrument quotes to the existing static trading journal
> (vanilla HTML/CSS/JS on GitHub Pages, Firebase Auth + Firestore, no build step).
> The user explicitly wants delayed prices, not licensed real-time CME data.

## Current State

The app is a pure static vanilla HTML/CSS/JS application with **zero network
data calls** today. It is offline-first: `Store` keeps all state in memory, backed
by Firestore for persistence and by pure synchronous calculations. Prices
(`entryPrice`, `exitPrice`, `stop`) are always entered manually by the user.

### Files and responsibilities

- `index.html` — 3 tabs (`registro`, `dashboard`, `ajustes`); loads Firebase
  compat 12.18.0 + vendored Chart.js + `instruments.js`, `store.js`, `charts.js`,
  `firebase.js`, `app.js` as classic `defer` scripts.
- `js/instruments.js` — static reference data for the 12 instruments. Each entry
  has `name, exchange, hours, tick, size, pointValue, commission, note`. **No
  symbol mapping and no price field.**
- `js/firebase.js` — `FirebaseService` IIFE: public config for
  `tradingdashboard-7425a`, compat SDK init, email/Google auth, allowlist gating,
  the `users/{uid}/trades` + `users/{uid}/meta/*` adapter, localStorage migration,
  account deletion.
- `js/store.js` — `Store` IIFE: synchronous read API, optimistic async Firestore
  writes via the adapter, pure calculations (`computeTrade`, `computeRisk`, KPIs,
  scaling plan), import/export.
- `js/app.js` — DOM/UI controller: form, trades table (`TABLE_COLUMNS`), KPIs,
  charts, instrument info panel (`renderInstrumentInfo`), risk panel.
- `firestore.rules` — only `allowlist/{email}` (get for self) and
  `users/{userId}` (+ nested `{document=**}`) are reachable; everything else
  denied by default.
- `package.json` / `firebase.json` — dev-only rules-test harness + Firestore
  emulator. **No Functions, no Hosting, no build.**
- `openspec/config.yaml` — `strict_tdd: false`, no test runner, no build;
  apply guideline "follow IIFE globals, ES5-compatible syntax, no ES modules".

### Key constraints discovered

- The Firebase web config in `firebase.js` is public by design; access control
  lives in Auth + Rules. A market-data **API key is a real secret** and cannot be
  placed in this repo or in browser code.
- `firestore.rules` currently denies everything outside `allowlist` and
  `users/{uid}`; a new `quotes` collection would need an explicit read rule.
- The app works from `file://` today (though the Firebase migration already
  requires an http origin for auth). Any new fetch adds a network dependency to
  an otherwise offline-first UI.

## Affected Areas

- `js/instruments.js` — add a provider symbol map (e.g. `NQ -> { massive, yahoo }`).
- `js/firebase.js` — add a read-only quotes accessor (subscribe/get `quotes/{symbol}`).
- `js/store.js` — expose quote cache read (keep it pure/in-memory; no fetch here).
- `js/app.js` — render delayed price(s), refresh timer, stale/unavailable state.
- `index.html` — price column header and/or a new watchlist card; Spanish copy.
- `css/styles.css` — styles for price cells, "retrasado"/stale badge, offline note.
- `firestore.rules` — new `quotes/{symbol}` read rule (allowlisted users; write denied).
- New: a proxy (Firebase Cloud Function **or** Cloudflare Worker) + its config.
- `firebase.json` — only if the Firebase Functions route is chosen.
- `openspec/config.yaml` — the no-build constraint stays intact for the app; the
  proxy is deployed separately, which must be stated explicitly in the design.

## Provider Findings (verified 2026-09-11)

Sources: firebase.google.com/pricing, massive.com/pricing?product=futures,
massive.com/futures, massive.com/docs/rest/futures/trades-quotes/quotes,
twelvedata.com/pricing, alphavantage.co/premium/,
developers.cloudflare.com/workers/platform/pricing/, and live Yahoo endpoints.

### Does it actually cover the 12 instruments?

| Provider | Futures coverage | Free tier | Delayed/real-time | Auth | Browser CORS |
|---|---|---|---|---|---|
| **Massive** (ex-Polygon.io) | CME, CBOT, NYMEX, COMEX only. **Not Eurex** | Futures Basic **$0**: all futures tickers, **5 calls/min**, 2y history, **historical minute aggregates only** — no delayed quote/snapshot | 10-min delayed from **Futures Starter $29/mo**; bid/ask quotes endpoint only from **Futures Developer $79/mo** | API key (header) | Not verified; key must never be in the browser |
| **Yahoo Finance** (unofficial) | `NQ=F`, `ES=F`, `YM=F`, `CL=F`, `6E=F` all verified live; `FDAX=F` returns **404** | No key, no documented quota | Near-real-time/near-live (unofficial, unspecified delay) | None | **Blocked**: no `Access-Control-Allow-Origin`, requires a proxy (well-known behavior; not re-verified here) |
| **Twelve Data** | No futures; free Basic = 3 markets (stocks, forex, crypto). Commodities need Grow ($29/mo) | Basic **8 credits/min, 800/day** | Real-time forex only | API key | Not verified; key must not be in browser |
| **Alpha Vantage** | No futures | **25 requests/day** | 15-min delayed US market data is **premium** | API key | Not verified |
| **Finnhub** | Futures not advertised (stocks/forex/crypto/fundamentals) | Free tier exists (**UNVERIFIED**: docs page is JS-rendered; commonly cited 60 calls/min) | n/a | API key | Not verified |

### Which of the 12 instruments are actually quotable

| Journal instrument | Massive (futures) | Yahoo symbol | Notes |
|---|---|---|---|
| NQ | yes (CME) | `NQ=F` ✅ verified | |
| MNQ | yes (CME) | `NQ=F` proxy | Micro trades at the same index level as NQ |
| ES | yes (CME) | `ES=F` ✅ verified | |
| MES | yes (CME) | `ES=F` proxy | |
| YM | yes (CBOT) | `YM=F` ✅ verified | |
| MYM | yes (CBOT) | `YM=F` proxy | |
| 6E | yes (CME) | `6E=F` ✅ verified | |
| M6E | yes (CME) | `6E=F` proxy | |
| CL | yes (NYMEX) | `CL=F` ✅ verified | |
| MCL | yes (NYMEX) | `CL=F` proxy | |
| **FDAX** | **no (Eurex)** | `FDAX=F` **404** | Only `^GDAXI` (XETRA cash index, EUR) ✅ verified as a proxy |
| **FDXM** | **no (Eurex)** | `FDAX=F` **404** | Same `^GDAXI` proxy |

Micro contracts (MNQ/MES/MYM/M6E/MCL) are not separate symbols on Yahoo; the
full-size contract price is the correct underlying level and is an acceptable
display proxy, but it must be labelled as such.

## The CORS + Secret Problem

A static GitHub Pages app **cannot** hide an API key (all JS is public) and
**cannot** call APIs that do not send CORS headers (Yahoo). Both constraints
force a server-side proxy that holds the secret and returns CORS-enabled JSON.

### Proxy options

1. **Firebase Cloud Function** (project already uses Firebase)
   - Firebase pricing page confirms Cloud Functions is **"Not applicable" on the
     Spark (no-cost) plan** — Cloud Functions **requires the Blaze pay-as-you-go
     plan**. Blaze free monthly allowances: 2M invocations, 400K GB-s, 200K CPU-s,
     5 GB outbound egress. Blaze requires a **billing account (card)**; new
     accounts may qualify for $300 credit.
   - Pros: same project/console as Auth + Firestore; Admin SDK bypasses rules for
     cache writes; `functions:secrets:set` holds the provider key.
   - Cons: mandatory billing upgrade; adds a deploy pipeline (Node runtime) to a
     repo that is currently build-free.
   - Effort: Medium.

2. **Cloudflare Worker** (recommended for a free, card-free path)
   - Workers **Free** plan: **100,000 requests/day**, 10 ms CPU per invocation,
     Workers KV free tier, no payment method required (verified pricing page).
     Paid is $5/mo if ever needed.
   - Pros: genuinely free, trivially sets CORS headers, stores the key as a
     Worker secret, can cache in Workers KV, no Firebase plan change.
   - Cons: a second platform/account outside Firebase; separate deploy flow.
   - Effort: Medium.

3. **Direct browser call** — **rejected**: exposes the key and fails on Yahoo's
   missing CORS headers.

4. **Netlify/Vercel functions** — viable free-tier alternatives, but also a
   second platform; no advantage over a Worker for this use case.

## Firestore Caching (tradeoffs)

Recommended shape: one document per symbol, `quotes/{symbol}`:

```
quotes/NQ = { symbol, price, changePct, currency, source, asOf, stale }
```

- **Why cache**: provider free tiers are rate-limited (Massive Basic 5 calls/min,
  Twelve Data 800/day, Alpha Vantage 25/day) and Yahoo will 429. Caching makes
  upstream calls **O(symbols), not O(users)**.
- **How clients read**: read once on load + on an interval, or `onSnapshot` for
  push. Firestore free tier is 20K writes/day and 50K reads/day; a low refresh
  interval and a single doc per symbol keep this comfortably inside free limits
  for a small allowlist. A per-user polling loop across 12 symbols could still
  burn reads — cache client-side in memory/localStorage too.
- **Who writes**: only the proxy (Admin SDK in the Firebase case, or a Worker
  using a service credential). `firestore.rules` must allow **read for allowlisted
  users and deny all client writes**.
- **Alternative without a scheduler**: the proxy fetches upstream only when
  `asOf` is older than a TTL, otherwise returns the cached doc (lazy refresh).
  Avoids Cloud Scheduler cost but adds first-request latency.
- **Tradeoff**: caching adds Firestore coupling and a rules change, but it is the
  only way to respect provider limits and to serve all users from one upstream call.

## Approaches

1. **Worker proxy → Yahoo Finance + Firestore cache** — free, card-free.
   - Pros: zero recurring cost; all 12 instruments covered (DAX via `^GDAXI`
     proxy); no Firebase plan change.
   - Cons: unofficial source (ToS, 429s, symbol changes, no SLA); `FDAX=F` absent
     so DAX is an index proxy; adds a second platform.
   - Effort: Medium.

2. **Firebase Cloud Function → Massive Futures Starter ($29/mo) + Firestore cache**
   — licensed, delayed 10 min.
   - Pros: official, documented, stable; same Firebase project; clear delayed
     semantics; CME/CBOT/NYMEX/COMEX covered.
   - Cons: requires Blaze billing; $29/mo; **does not cover Eurex**, so DAX still
     needs Yahoo `^GDAXI` or must be dropped; Massive Basic ($0) cannot serve
     delayed quotes.
   - Effort: Medium–High.

3. **Hybrid: Worker/Function → Massive Starter (CME/CBOT/NYMEX/COMEX) + Yahoo
   `^GDAXI` (DAX proxy)** — licensed where possible, free proxy where needed.
   - Pros: best accuracy for 10 of 12 instruments; DAX still visible.
   - Cons: two upstreams; mixed provenance to label in the UI; still needs the
     paid tier for CME delayed data.
   - Effort: High.

4. **Twelve Data / Alpha Vantage / Finnhub** — **insufficient**: no futures, and
   Alpha Vantage's 25/day free tier is unusable for multi-user.
   - Effort: Low but does not meet the requirement.

## Recommendation

- **Transport**: a server-side proxy is mandatory. For a genuinely free,
  card-free path use a **Cloudflare Worker**; if the user prefers one platform and
  accepts billing, use a **Firebase Cloud Function on Blaze**.
- **Source**: start with **Yahoo Finance** behind the proxy for zero cost and full
  instrument coverage (accepting unofficial-source risk), and treat **Massive
  Futures Starter** as the upgrade path if reliability/licensing becomes a
  requirement. Do **not** rely on Massive Futures Basic for delayed quotes — it is
  historical-aggregates only.
- **Cache**: one `quotes/{symbol}` doc, written only by the proxy, read by
  allowlisted clients; add a rules read rule and keep all client writes denied.
- **UI**: a "Precio" column in the trades table (or a compact watchlist strip),
  showing the delayed last price with an "as of HH:MM" timestamp and a
  "Retrasado" badge. **Display-only**: never prefill `entryPrice` automatically.
  When the feed is unavailable, show `—` plus a subtle "datos no disponibles"
  note; never block the form or degrade the journal's offline behavior.
- **DAX**: label `^GDAXI` output explicitly as an index proxy, or drop DAX from
  the feed. Do not present it as the Eurex future.

## Risks

- **Secret exposure** if any direct browser call is used — must be proxied.
- **CORS** blocks Yahoo (and possibly others) from GitHub Pages — proxy required.
- **Firebase Cloud Functions requires Blaze** (billing account); a runaway loop
  could incur charges despite free monthly allowances.
- **Firestore quotas** (20K writes / 50K reads per day) — a naive per-user polling
  loop can exhaust reads; cache and a low refresh interval mitigate.
- **Massive Futures Basic does not include delayed data** — a likely
  misconception; $29/mo Starter is the minimum for 10-min delayed futures.
- **No Eurex coverage on Massive**, and Yahoo has no `FDAX=F` (verified 404) —
  FDAX/FDXM are only available as a cash-index proxy (`^GDAXI`).
- **Yahoo is unofficial**: ToS/redistribution concerns, 429 rate limits, symbol
  changes, and silent breakage with no SLA.
- **Micro-contract mapping** uses the full-size symbol; acceptable but must be
  labelled, not passed off as the exact micro contract.
- **Contract rollover**: `=F` symbols are front-month/continuous; prices gap at
  rollover and providers handle continuous contracts differently.
- **Offline-first regression**: the app currently needs no market data; a feed
  adds a network dependency that must fail soft.
- **No test runner** (config.yaml) — verification is manual.
- **Review workload**: proxy + rules + UI likely exceeds the 400-line budget;
  plan chained PRs.

## Open Questions (product decisions required)

1. **Provider**: free unofficial (Yahoo) or paid licensed (Massive $29/mo)?
2. **Billing**: accept Firebase Blaze (card) or use a card-free Cloudflare Worker?
3. **Instruments**: feed all 12, or only the 10 with a true futures source
   (and drop DAX), or show DAX as a labelled `^GDAXI` index proxy?
4. **Refresh interval** and staleness tolerance (e.g. 1 min? 5 min? on-demand)?
5. **Placement**: trades-table column, a separate watchlist card, or the existing
   instrument Info panel?
6. **Display-only or prefill** `entryPrice` from the delayed quote? (Recommend
   display-only.)
7. **Access**: quotes visible to allowlisted users only (rules) or public?
8. **Provenance**: is a clearly-labelled cash-index proxy acceptable for DAX?

## Ready for Proposal

Yes — pending the open decisions above. The orchestrator should surface **#1
(provider), #2 (billing/proxy host), and #3 (instruments incl. DAX)** to the user
before sdd-propose, because they determine the scope, cost, and the rules change.
