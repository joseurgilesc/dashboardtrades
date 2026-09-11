# Proposal: firebase-multiuser

## Intent

Migrate the localStorage-only journal (`bpt.journal.v1`) to a multi-user Firebase Auth + Firestore app on GitHub Pages, no build step.

## Scope

### In Scope
- Email/password + Google sign-in, logout, session persistence; invite/allowlist registration.
- Firestore `users/{uid}/trades/{tradeId}` + user-scoped balances/settings docs.
- uid-scoped Security Rules (test-mode rules must not ship).
- Compat SDK `12.18.0` via gstatic classic `<script>` tags; async `Store` adapter keeping the synchronous API; offline cache.
- Automatic `bpt.journal.v1` migration on first login; JSON import retained; account deletion and full export.
- README/config updates for GitHub Pages; `file://` dropped.

### Out of Scope
- Build step, bundler, or ESM modular SDK; server-side queries (filtering stays client-side).
- `file://` support.

## Capabilities

### New Capabilities
- `user-auth`: email/password + Google sign-in, session/logout, allowlist registration, deletion, export.
- `firestore-user-data`: `users/{uid}/trades/{tradeId}`, balances/settings docs, uid-scoped Rules, offline cache.
- `client-migration`: compat SDK, auth gate, async `Store` adapter, localStorage migration, Pages deploy.

### Modified Capabilities
- None.

## Approach

Keep the synchronous `Store` API and in-memory state. On auth change, hydrate from Firestore and subscribe via `onSnapshot`; mutations write async optimistically. Calculations and `charts.js` stay untouched; boot is async and auth-gated.

**Open design point (sdd-design):** Auth allows open signup by default. Candidates: (a) disable public sign-up and pre-provision accounts; (b) require an `allowlist/{email}` doc or custom claim enforced by Rules. The mechanism MUST block non-allowlisted accounts.

**localStorage impact:** `bpt.journal.v1` keeps `version: 1` as a one-time migration source, no longer the source of truth; clearing it is deferred to design.

## Affected Areas

| Area | Change |
|------|--------|
| `index.html`, `js/app.js`, `js/store.js` | Firebase scripts, auth gate, async boot, Firestore adapter |
| `js/firebase.js`, `firestore.rules` | New: SDK init/auth, uid-scoped rules |
| `README.md`, `openspec/config.yaml` | Pages docs; dropped `file://` |

## Risks

| Risk | Mitigation |
|------|------------|
| Rules misconfig exposes data | uid-scoped rules; cross-user denial test |
| No tests/CI | Manual checks + emulator |
| Quota conflict (X1), batch cap (U5) | Verify in console before release |

## Rollback Plan

Tag `main` before merge. On failure, revert the merge and redeploy Pages; the prior version works immediately. `bpt.journal.v1` stays intact (no local data lost) and Firestore copies remain exportable.

## Dependencies

- Firebase `tradingdashboard-7425a`: Auth providers + authorized domains configured; SDK `12.18.0` (verified).

## Success Criteria

- [ ] Two accounts see only their own trades; cross-user reads denied.
- [ ] Sign-in works on GitHub Pages and localhost.
- [ ] First login imports `bpt.journal.v1` with matching trades and KPIs.
- [ ] Offline entry syncs on reconnect.
- [ ] Deletion removes user docs; export yields `{version, trades, balances, settings}`.
- [ ] No test-mode rules ship.
