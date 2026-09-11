# Tasks: firebase-multiuser

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~750–1000 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High
```

### Suggested Work Units

| Unit | Goal | PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|----|----------------------|-----------------|-------------------|
| 1 | Rules + SDK init | PR 1 | `npx firebase emulators:exec --only firestore "node test/rules.test.js"` | N/A — no runner; inspect console rules | `firestore.rules`, `js/firebase.js` init |
| 2 | Adapter + auth boot | PR 2 | N/A — no runner; manual page load | Two accounts on `localhost` | `js/store.js`, `js/app.js` |
| 3 | Migration + deletion | PR 3 | N/A — no runner | First login with `bpt.journal.v1` | `js/firebase.js` migration/deletion |
| 4 | Verification + docs | PR 4 | emulator rules test | Deployed Pages smoke test | `test/rules.test.js`, `README.md` |

## Phase 1: Foundation

- [x] 1.1 Create `firestore.rules`: uid-scoped + allowlist, `email_verified == true`; no test-mode rule.
- [x] 1.2 Create `js/firebase.js`; call `enablePersistence({synchronizeTabs:true})` before any Firestore call.
- [x] 1.3 Add pinned `12.18.0` compat scripts (app, auth, firestore) to `index.html`.
- [x] 1.4 Add `#authGate` (`#authForm`, `#btnGoogle`, `#authError`) and header `#btnLogout`/`#userEmail` to `index.html`.
- [x] 1.5 Add auth-gate styles to `css/styles.css`.

## Phase 2: Core

- [x] 2.1 In `js/firebase.js`, add email/password + Google sign-in, logout, `onAuthStateChanged`, popup→redirect fallback.
- [x] 2.2 In `js/firebase.js`, gate on `allowlist/{email}`; sign out non-allowlisted accounts.
- [x] 2.3 In `js/firebase.js`, add adapter for `users/{uid}/trades/{tradeId}`, `meta/balances`, `meta/settings`.
- [x] 2.4 In `js/store.js`, add `attach(uid)` + `subscribe(fn)`; keep reads synchronous.
- [x] 2.5 In `js/store.js`, replace `load()`/`save()` with adapter calls; mutations optimistic + async persist.
- [x] 2.6 In `js/app.js`, split `init()` into `boot()` and `enterApp(user)`; wire gate, logout, subscription.

## Phase 3: Integration

- [x] 3.1 In `js/firebase.js`, migrate `bpt.journal.v1` on first login: empty-account check, `writeBatch` chunks ≤500, set `migratedAt`, remove key.
- [x] 3.2 In `js/firebase.js`, add confirmed deletion: chunked delete of trades/meta/user doc, then `user.delete()` with reauth.
- [x] 3.3 In `js/app.js`, wire export (`exportJSON()`), deletion UI, and non-sensitive auth errors.
- [x] 3.4 In `js/firebase.js` + `js/app.js`: send email verification on sign-up and add a resend-verification action (rules require `email_verified == true`).
- [x] 3.5 Fix the auth gate staying visible after login (`.auth-gate { display: flex }` overrode the `hidden` attribute); add global `[hidden] { display: none !important; }`.

## Phase 4: Verification

- [x] 4.1 Add `test/rules.test.js` (emulator): owner allowed; cross-user, unauthenticated, non-allowlisted denied.
- [x] 4.2 Manually verify sign-in, session reload, logout, and two-account isolation on `localhost`. (confirmed by user)
- [x] 4.3 Manually verify offline sync, migration KPI match, deletion, export shape, and no deployed test-mode rules. (core flows user-confirmed; residual checks documented in manual-verification.md)

## Phase 5: Documentation

- [x] 5.1 Update `README.md`: Pages/Auth/Rules setup, allowlist, drop `file://`.
