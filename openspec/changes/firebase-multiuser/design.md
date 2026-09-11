# Design: firebase-multiuser

## Technical Approach

Keep the synchronous in-memory `Store` API, backed by Firebase Auth + Firestore. New `js/firebase.js` owns SDK init, auth, allowlist gating, adapter, migration. `js/store.js` keeps all calculations and swaps `load()/save()` for adapter calls plus `attach()/subscribe()`. `app.js` boot becomes async and auth-gated; `charts.js`/`instruments.js` are untouched.

## Architecture Decisions

### Allowlist enforcement

| Option | Tradeoff | Verdict |
|---|---|---|
| (a) Disable sign-up, pre-provision accounts | Cannot block Google auto-creation | Rejected |
| (b) `allowlist/{email}` doc enforced by Rules | Provider-agnostic, no backend, testable | **Chosen** |
| (c) Custom claims via Admin SDK | Needs a trusted backend/credential | Rejected |

Enforcement: Firestore Security Rules (authoritative); the client pre-check is UX only. Rules require `email_verified == true` to block allowlisted-email spoofing. Test: sign in with a non-listed email; assert permission-denied.

### Firestore data model

| Path | Shape |
|---|---|
| `users/{uid}` | `{ email:string, createdAt:Timestamp, migratedAt?:Timestamp }` |
| `users/{uid}/trades/{tradeId}` | same fields as `sanitizeTrade`; `tradeId = trade.id` |
| `users/{uid}/meta/balances` | `{ Sim:number, Real:number, Fondeo:number }` |
| `users/{uid}/meta/settings` | settings map |

Dates/times stay `'YYYY-MM-DD'`/`'HH:mm'` strings (no `Timestamp`), preserving `parseDateTime` timezone behavior exactly.

### Offline cache + tab manager

The canonical `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })` is **modular**. The compat classic-script equivalent is `firebase.firestore().enablePersistence({ synchronizeTabs: true })`, called once **before any other Firestore call**. Verify at apply time; adopt modular only with ESM.

### Async Store adapter

`Store` keeps `state` in memory; the read/compute API stays synchronous. `Store.attach(uid)` hydrates `state`, then subscribes via `onSnapshot` on `trades` and `meta/*`; `Store.subscribe(fn)` re-renders when snapshots rebuild `state.trades`. Mutations update `state` optimistically, then write async; Firestore's cache re-emits local writes via `onSnapshot`, reconverging state, and failures surface via a status callback. `charts.js` is unchanged (it calls `Store.computeAll()` synchronously).

### Auth-gated async boot

`app.js` splits `init()` into `boot()` (once: selects, events, app hidden) and `enterApp(user)` (after auth + first snapshot). Gate markup: `<section id="authGate">` with `#authForm`, `#btnGoogle`, `#authError`; the header gains `#btnLogout`/`#userEmail`. `onAuthStateChanged`: signed-out → gate; allowlisted → `attach` → app; not allowlisted → "not invited" + sign-out.

### localStorage migration

On first snapshot, if `users/{uid}` has no trades AND `bpt.journal.v1` exists: parse with `normalize()`, write trades in `writeBatch` chunks of ≤500 plus `meta/balances` and `meta/settings`, set `migratedAt`, then remove the key. Runs once per browser.

### Account deletion + export

Deletion (confirmed): chunked `writeBatch` deletes trade docs + `meta/*` + the `users/{uid}` doc, then `user.delete()`; on `auth/requires-recent-login`, reauthenticate, then sign out. Export reuses `exportJSON()`, which already emits `{version, trades, balances, settings}` from hydrated state.

## File Changes

| File | Action | Description |
|---|---|---|
| `js/firebase.js` | Create | SDK init, offline cache, auth, allowlist, adapter, migration, deletion |
| `firestore.rules` | Create | uid-scoped + allowlist rules (deployed via CLI/Console, not Pages) |
| `index.html` | Modify | Compat scripts, `#authGate` markup, logout/user email |
| `js/store.js` | Modify | Adapter persistence; `attach`/`subscribe`; optimistic mutations |
| `js/app.js` | Modify | Async auth-gated boot, auth UI, change subscription, deletion |
| `css/styles.css` | Modify | Auth gate styles |
| `README.md` | Modify | Pages/Auth/Rules setup; drop `file://` claim |
| `js/charts.js`, `js/instruments.js` | Unchanged | Sync API preserved |

## Security Rules

    rules_version = '2';
    service cloud.firestore {
      match /databases/{database}/documents {
        function allowlisted() {
          return request.auth != null
            && request.auth.token.email_verified == true
            && exists(/databases/$(database)/documents/allowlist/$(request.auth.token.email));
        }
        match /allowlist/{email} {
          allow get: if request.auth != null && request.auth.token.email == email;
          allow read, write: if false;
        }
        match /users/{userId} {
          allow read, write: if allowlisted() && request.auth.uid == userId;
          match /{document=**} {
            allow read, write: if allowlisted() && request.auth.uid == userId;
          }
        }
      }
    }

Test-mode (`allow read, write: if request.auth != null`) MUST NOT ship. Rules deploy outside the Pages pipeline.

## Testing Strategy

No runner, linter, or CI exists (`strict_tdd: false`).

| Layer | What | Approach |
|---|---|---|
| Rules (only automatable) | owner allowed; cross-user/unauthenticated/non-allowlisted denied | Firebase Emulator + `@firebase/rules-unit-testing` (needs npm; not in CI) |
| Manual E2E | sign-in, isolation, offline sync, migration, deletion, export | Two accounts on the deployed URL; DevTools offline toggle |
| Regression | KPIs/charts unchanged post-migration | Compare imported KPIs against a pre-migration export |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

- [ ] Deploy `firestore.rules`; confirm no test-mode rules.
- [ ] Add GitHub Pages domain + `localhost` to Auth authorized domains.
- [ ] Enable Google + Email/Password; confirm SDK pin `12.18.0`.
- [ ] Verify the free-tier quota for `tradingdashboard-7425a`.
- [ ] Tag `main` before merge; rollback = revert merge + redeploy Pages.
- `file://` is intentionally dropped (already in `config.yaml`).

## Open Questions

- [ ] Require email verification for email/password (assumed yes, to close allowlisted-email spoofing)?
