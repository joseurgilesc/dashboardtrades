# Exploration: firebase-multiuser

> Phase: sdd-explore · Change: `firebase-multiuser` · Artifact store: openspec
> Goal: migrate the static, single-device, localStorage-only trading journal into a
> multi-user web app (Firebase Auth + Cloud Firestore) hosted on GitHub Pages,
> replacing the cancelled Hostinger Node.js plan.

## Current State

The app is a pure static vanilla HTML/CSS/JS application. No framework, no bundler,
no build step, no network calls. It runs from `file://` and GitHub Pages.

### Files and responsibilities

- `index.html` — single page with 3 tabs (`registro`, `dashboard`, `ajustes`). Loads
  five classic `<script defer>` tags in order: `vendor/chart.umd.js`,
  `js/instruments.js`, `js/store.js`, `js/charts.js`, `js/app.js`.
- `js/instruments.js` — global consts `INSTRUMENTS`, `ACCOUNTS`, `DIRECTIONS`,
  `STRATEGIES`, `EXIT_TYPES`, `EMOTIONS`, `DEFAULT_BALANCES`.
- `js/store.js` — global `Store` IIFE. Persistence, calculations, KPIs, import/export.
- `js/charts.js` — global `DashboardCharts` IIFE wrapping Chart.js 4.4.4 (vendored).
- `js/app.js` — DOM/UI controller IIFE. No global exports; wires events on
  `DOMContentLoaded`.

### Data model (persisted, `localStorage["bpt.journal.v1"]`)

```
{ version: 1, trades: [], balances: { Sim, Real, Fondeo }, settings: {} }
```

Trade record shape (from `sanitizeTrade`, store.js:136-156):
`id, tradeNumber, account, instrument, contracts, strategy, direction, entryDate,
entryTime, entryPrice, exitDate, exitTime, exitPrice, exitType, emotion, notes`.

Key facts:

- `Store.load()` runs synchronously at IIFE evaluation (store.js:594). `Store.save()`
  runs on every mutation. The whole `Store` public API is **synchronous**
  (store.js:596-622).
- `js/app.js` calls `Store.getTrades()`, `Store.getBalances()`,
  `Store.getAccountBalances()`, `Store.getTotalBalance()`, `Store.getKpis()`,
  `Store.computeTrade()`, `Store.nextTradeNumber()`, `Store.addTrade()`,
  `Store.updateTrade()`, `Store.deleteTrade()`, `Store.clearAll()`,
  `Store.setBalances()`, `Store.importJSON()`, `Store.exportJSON()`,
  `Store.exportCSV()`, `Store.seedSample()` directly and re-renders synchronously.
- `js/charts.js` calls `Store.computeAll()` synchronously (charts.js:308-310).
- Filtering and sorting are entirely client-side: `getFilteredTrades()` (app.js:142),
  `matchesSearch()` (app.js:155), `sortTrades()` (app.js:171). No server-side query
  exists today.
- Calculations to preserve unchanged: `computeTrade` (points/gross/commission/net/
  duration/dayOfWeek/month/year), `computeAll` (chronological cumulative net),
  `getKpis`, `computeMaxDrawdown`, `getEquitySeries`, `getAccountBalances`,
  `getTotalBalance`.
- The JSON export payload (`exportJSON`, store.js:446-453) is already
  `{ version, trades, balances, settings }` — the exact shape needed for migration.

### Git / OpenSpec state

- Repo: `github.com/joseurgilesc/dashboardtrades.git`, branch `main`.
- `openspec/` and `.gitignore` are currently untracked (`git status` shows `??`).
- `.gitignore` ignores `.atl/` (skill registry cache).
- `openspec/config.yaml` declares no tests, no build, and apply guideline
  "Follow existing code patterns (IIFE globals, ES5-compatible syntax, no ES modules)".

### Firebase project (user-provided)

`projectId: tradingdashboard-7425a`. A Firebase web `apiKey` is a PUBLIC client
identifier, not a secret; security rests on Firebase Auth + Firestore Security Rules.
No service-account key or admin credential may ever enter this repo.

## Affected Areas

- `index.html` — add Firebase SDK scripts, auth gate screen (login/register), header
  logout control; script loading order changes.
- `js/store.js` — replace `load()`/`save()` localStorage with a Firestore-backed
  async layer while keeping the synchronous in-memory API. Add per-user scoping.
- `js/app.js` — auth gating, async boot, re-render on data snapshot, logout wiring,
  migration prompt.
- `js/charts.js` — unaffected if `Store.computeAll()` remains synchronous (target).
- `js/instruments.js` — unaffected.
- New file(s): auth/bootstrap module (e.g. `js/firebase.js` or `js/auth.js`).
- `README.md` — update persistence, privacy, and local-open sections; `file://`
  guarantee changes.
- Firestore Security Rules — new artifact, deployed outside the Pages pipeline.
- `openspec/config.yaml` — the no-build / no-ES-modules constraints are now in tension
  with the migration; a design decision is required.

## Approaches

### 1. Firebase compat SDK via classic `<script>` tags (no build)

Load `firebase-app-compat.js`, `firebase-auth-compat.js`,
`firebase-firestore-compat.js` from the gstatic CDN (or vendor them locally, like
Chart.js) and keep the existing IIFE/global architecture. Use the v8-style namespaced
API (`firebase.initializeApp`, `firebase.auth()`, `firebase.firestore()`).

- Pros: smallest diff and lowest risk; preserves current ES5 IIFE/global patterns;
  no module conversion; no build step; compatible with the existing `Store` shape.
- Cons: no tree-shaking (larger payload); compat layer is a legacy bridge that Google
  discourages for new code; must verify the compat UMD build exists for the chosen
  SDK version.
- Effort: Low–Medium.

### 2. Firebase modular SDK via ESM `<script type="module">` from CDN (no build)

Import `firebase-app.js`, `firebase-auth.js`, `firebase-firestore.js` as native ES
modules; convert `instruments.js`, `store.js`, `charts.js`, `app.js` to modules with
`import`/`export`. Top-level `const` globals become explicit module exports.

- Pros: modern, supported, tree-shakeable SDK; still no build step; GitHub Pages
  native; best long-term path.
- Cons: touches all four JS files plus `index.html`; changes global scoping semantics;
  module CORS requires an http(s) origin, so `file://` support is effectively lost;
  larger review surface.
- Effort: Medium.

### 3. Build step (Vite/esbuild bundling modular SDK)

- Pros: modern SDK, bundling, env handling, best DX.
- Cons: violates the project's explicit no-build preference and the config.yaml design
  rule; adds npm/Node and a GitHub Actions build; largest change.
- Effort: High. **Rejected** unless the user changes the constraint.

## Firestore Data Model

Recommended layout (subcollection per user, doc per trade):

```
users/{uid}                        -> { createdAt, email, settings: {} }
users/{uid}/meta/balances          -> { Sim, Real, Fondeo }
users/{uid}/trades/{tradeId}       -> one doc per trade; tradeId = existing trade.id
```

- One doc per trade scales to thousands of trades and makes ownership rules trivial.
- `balances` and `settings` live on user-scoped docs so they are isolated identically.
- Keep `entryDate`/`exitDate` as `YYYY-MM-DD` strings to preserve exact calculation and
  timezone behavior. If server-side ordering/filtering is later required, add a derived
  `entryAt` Firestore `Timestamp` field.
- Initial implementation fetches all of a user's trades through a single realtime
  listener and reuses all existing client-side filtering/sorting/KPI code. Server-side
  queries and composite indexes are deferred until data volume demands them.

Alternative considered and rejected: a single blob doc
`users/{uid}/journal/state = { trades, balances, settings }`. It mirrors localStorage
exactly and is trivial to migrate, but the 1 MiB document limit and whole-document
writes cap growth and create write contention. Not recommended.

### Query needs (current, client-side)

Filters by account/instrument/strategy/emotion and date range, plus sort by entry
date/time. If moved server-side, these need composite indexes
(`account + entryDate`, `instrument + entryDate`, etc.). Recommendation: keep
client-side for now.

## Security Rules Shape (first-class requirement)

Minimum correct isolation rule:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      match /{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

- The default Firebase "test mode" rule (`allow read, write: if request.auth != null`)
  is NOT sufficient — any authenticated user could read every other user's data.
- Rules SHOULD also validate `request.resource.data` shape (required fields and types)
  because client-side validation is not trust.
- Rules are deployed via the Firebase console or the Firebase CLI, not by GitHub Pages;
  this is a manual step that must be part of the release checklist.
- `request.auth == null` for unauthenticated clients, so the rule fails closed.

## Authentication

- Baseline: email/password via `createUserWithEmailAndPassword`,
  `signInWithEmailAndPassword`, `signOut`, and `onAuthStateChanged` for session
  persistence (Firebase persists the session in the browser by default).
- Optional enhancement: Google sign-in (`GoogleAuthProvider` + `signInWithPopup` or
  `signInWithRedirect`). Requires enabling the provider in the console and adding the
  GitHub Pages domain to authorized domains. Redirect is more reliable on mobile.
- Recommended extras: `sendPasswordResetEmail`, optional `sendEmailVerification`.
- Auth gate UI: a login/register screen with Spanish copy, an error area, and a logout
  control in the header. The app must not render user data until `onAuthStateChanged`
  resolves.

## Frontend Refactor Strategy

Preserve the synchronous `Store` API so `app.js` and `charts.js` keep working:

1. Keep in-memory `state` in `Store` as today.
2. After login, hydrate `state` from Firestore and subscribe with `onSnapshot` to
   `users/{uid}/trades`; on each snapshot, rebuild `state.trades` and re-render.
3. Make mutations async under the hood (`addTrade`/`updateTrade`/`deleteTrade`/
   `setBalances`/`clearAll`) while updating in-memory state optimistically so the
   synchronous read API and rendering stay valid.
4. Replace `load()`/`save()` with a Firestore adapter; keep `normalize`/`sanitizeTrade`
   for validation of incoming and imported data.
5. Introduce an async boot sequence: init Firebase → auth state → hydrate → render.
   `app.js`'s `DOMContentLoaded init()` becomes an async entry gated on auth.

This keeps every calculation and Chart.js renderer unchanged.

## Data Migration

- The existing `exportJSON()` payload already matches the target Firestore layout, so
  the existing Ajustes import/export can be repointed at Firestore.
- First-login path: detect no data in Firestore AND an existing
  `localStorage["bpt.journal.v1"]` → offer a one-time "import local data into your
  account" action (or let the user use the existing JSON import).
- Batch writes must be chunked: Firestore caps at 500 writes per batch; use
  `writeBatch` in chunks.
- `seedSample` writes 8 documents instead of replacing an array.

## Offline Behavior

- `enableIndexedDbPersistence` is obsolete. The current API is
  `initializeFirestore(app, { localCache: persistentLocalCache() })`, which also
  supports multi-tab. Enable it so journaling works offline and syncs later.
- Tradeoffs: stale cache reads, cache growth, and the need to initialize persistence
  before other Firestore operations. Auth sign-in itself still requires network.

## Recommendation

- **Firestore model**: subcollection `users/{uid}/trades/{tradeId}` plus user-scoped
  balances/settings docs. Reuse existing client-side filtering.
- **Frontend**: keep the synchronous in-memory `Store` API; back it with an
  `onSnapshot` listener and an async Firestore adapter. Minimal changes to `app.js`
  and none to `charts.js`.
- **SDK loading**: prefer **Approach 1 (compat SDK, no build)** for the initial
  migration because it is the lowest-risk, smallest-diff path and honors the project's
  declared no-build / no-ES-modules constraints. Treat **Approach 2 (ESM modular)** as
  the recommended follow-up modernization once the migration is stable and `file://`
  support is formally dropped. Reject Approach 3 (build step).
- **Security**: ship the uid-scoped rules above; never leave test-mode rules.

## Risks

1. **Sync/async impedance** — `Store` is synchronous and called synchronously across
   `app.js`/`charts.js`; an async rewrite without the in-memory cache would ripple
   through every call site. Mitigated by the cache + snapshot design.
2. **Loss of `file://` support** — Firebase requires an http(s) origin, so the README's
   "open `index.html` directly" guarantee breaks. Needs an explicit product decision
   and README update.
3. **Security Rules misconfiguration** — leaving test-mode rules would expose all users'
   data. Rules deploy outside the Pages pipeline and must be in the release checklist.
4. **Authorized domains** — the GitHub Pages domain (and any local dev origin) must be
   added to Firebase Auth authorized domains or sign-in popups/redirects fail.
5. **No tests / no CI** — config.yaml confirms no runner, linter, or CI; the refactor
   has no automated safety net. Verification will be manual; the Firestore emulator is
   the only realistic automated option.
6. **Review workload** — the multi-file refactor likely exceeds the 400-line review
   budget and should be split into chained PRs.
7. **Quota/cost** — per-user reads/writes on Firestore; likely within the free tier but
   worth noting.
8. **Compat SDK availability** — the gstatic compat UMD builds must be confirmed for
   the chosen SDK version (or vendored locally).
9. **Secrets** — only `firebaseConfig` (public identifiers) may be committed; no
   service-account credentials.

## Open Questions (product decisions required)

1. Registration model: open self-registration or invite/allowlist only?
2. Include Google sign-in now, or email/password only for the first release?
3. Accept dropping local `file://` open support (required for Firebase)?
4. Which SDK loading approach: compat (Approach 1) or ESM modules (Approach 2)?
5. Keep filtering client-side (fetch all trades) or invest in server-side queries and
   composite indexes?
6. Enable Firestore offline persistence (recommended yes)?
7. Migrate existing localStorage data automatically on first login, or only via the
   explicit JSON import?
8. Is account deletion / full data export required (privacy/compliance)?

## Ready for Proposal

Yes — pending the open product decisions above, especially #3 and #4, which change the
scope and the config.yaml constraints. The orchestrator should surface those decisions
to the user before sdd-propose.
