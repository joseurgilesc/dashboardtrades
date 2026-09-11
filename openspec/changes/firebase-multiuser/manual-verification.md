# Manual Verification Runbook: firebase-multiuser

> Covers tasks **4.2** and **4.3**. These steps require the live Firebase
> project (`tradingdashboard-7425a`) and at least two real allowlisted accounts,
> so they are executed by a human, not by the apply phase. Both tasks stay
> unchecked in `tasks.md` until a human records the results below.
>
> Record the outcome of every step in the **Results** table at the end.

## 0. Preconditions

Complete these once before running any step.

1. **Auth providers.** Firebase Console → Authentication → Sign-in method:
   enable **Email/Password** and **Google**.
2. **Authorized domains.** Authentication → Settings → Authorized domains:
   confirm `localhost` and `tradingdashboard-7425a.firebaseapp.com` are listed,
   and add the GitHub Pages domain (`<user>.github.io`) once known.
3. **Allowlist docs.** In Firestore, create `allowlist/{email}` documents for
   the two test accounts (document ID = the exact email), for example:
   - `allowlist/account-a@example.com` → `{ "invited": true }`
   - `allowlist/account-b@example.com` → `{ "invited": true }`
   Do **not** add a third, non-allowlisted account; it is used as the denial case.
4. **Email verification.** Rules require `email_verified == true`. Complete the
   verification email for both email/password accounts before testing. Google
   accounts arrive verified.
5. **Rules deployed.** Deploy `firestore.rules` (Console → Firestore → Rules, or
   `firebase deploy --only firestore:rules`). Confirm no test-mode rule is
   present (step 4.3.6).
6. **Serve over HTTP, never `file://`.** From the project root run a local
   server, e.g. `python -m http.server 8000` or `npx serve .`, then open
   `http://localhost:8000/`.
7. **Browsers.** Use two isolated browser profiles (or one normal + one
   incognito) so Account A and Account B never share a session.

Legend: **Expected** = the pass condition. Any deviation is a failure to record.

## 4.2 — Sign-in, session, logout, isolation (localhost)

| # | Step | Expected |
|---|------|----------|
| 4.2.1 | Open `http://localhost:8000/` with no session. | Auth gate is visible; the journal, tabs, filters and KPIs are hidden; the header user box (`#userEmail`, logout) is hidden; no journal data is displayed. |
| 4.2.2 | Sign in as Account A with email/password. | Gate hides; the app becomes visible; the header shows Account A's email; Account A's trades load (empty on a first run). |
| 4.2.3 | Reload the page (F5). | The user stays signed in with no credential re-entry; Account A's data is restored; the gate does not flash permanently. |
| 4.2.4 | Add one trade as Account A (Registro → Guardar trade). | The trade appears immediately in the table and KPIs; after a reload it is still present. |
| 4.2.5 | Sign out (header → Cerrar sesión). | The session ends; the auth gate is shown; the journal data is hidden; a reload stays signed out. |
| 4.2.6 | Attempt sign-in with an incorrect password for Account A. | Sign-in fails; a non-sensitive error is shown (no raw SDK error, no account enumeration); no journal data is shown. |
| 4.2.7 | Sign in with a verified account that is **not** on the allowlist. | Access is denied; the account is signed out; the gate shows a "not invited"/not-authorized message; no journal data is exposed. |
| 4.2.8 | Sign in as Account A with Google (allowlisted Google account). | Sign-in succeeds. If the popup is blocked, the redirect fallback completes and the user ends authenticated (never partially authenticated). |
| 4.2.9 | Two-account isolation: sign in as Account B in a second profile. | Account B sees only Account B's data; none of Account A's trades, balances or settings are visible. |
| 4.2.10 | Optional rules probe as Account A (DevTools console): `firebase.firestore().doc('users/<ACCOUNT_B_UID>/trades/<id>').get()`. | The read is rejected with `permission-denied`; no data from Account B is returned. |

## 4.3 — Offline sync, migration, deletion, export, rules

### 4.3.A Migration KPI match

| # | Step | Expected |
|---|------|----------|
| 4.3.1 | In a fresh profile, before signing in, seed a known local journal. In DevTools console: `localStorage.setItem('bpt.journal.v1', '<a known export JSON>')`. Record its KPI values (Total trades, Win rate, Neto total). | The key is set; the recorded KPIs are the baseline. |
| 4.3.2 | Sign in as a fresh allowlisted account that has **no** server-side trades. | The local trades, balances and settings are imported into the account; the on-screen KPIs match the baseline from 4.3.1. |
| 4.3.3 | Inspect Firestore. | `users/{uid}/trades/*` contain the imported trades; `users/{uid}/meta/balances` and `users/{uid}/meta/settings` exist; `users/{uid}` has `migratedAt` set. |
| 4.3.4 | Inspect `localStorage`. | `bpt.journal.v1` has been removed after a successful migration. |
| 4.3.5 | Reload and sign out/in. | Data persists; migration does not run again (no duplicates). |

### 4.3.B Offline sync

| # | Step | Expected |
|---|------|----------|
| 4.3.6 | Sign in as Account A and load the journal. Then DevTools → Network → **Offline**. | The app keeps showing the cached journal. |
| 4.3.7 | Add a trade while offline. | The trade appears immediately (optimistic update + offline cache). |
| 4.3.8 | Reload while still offline. | The app still renders the cached data and the offline trade. |
| 4.3.9 | Go back **Online** and wait for sync. | The offline trade appears in Firestore with no duplicate; the UI reconciles without a manual refresh. |

### 4.3.C Account deletion

| # | Step | Expected |
|---|------|----------|
| 4.3.10 | As an account with trades, Ajustes → "Zona de peligro" → request deletion **without** confirming. | No data is deleted; no account change. |
| 4.3.11 | Confirm deletion (enter the password when prompted). | All `users/{uid}/trades`, `users/{uid}/meta/*` and the `users/{uid}` document are deleted; the auth account is deleted; the session ends and the gate is shown. |
| 4.3.12 | Force the reauth path: wait until the session is old, then delete again. | On `auth/requires-recent-login` the app reauthenticates (password or Google) once, retries the delete, and still ends signed out with no orphan documents. |
| 4.3.13 | Confirm in Firestore. | No documents remain under the deleted `users/{uid}` path. |

### 4.3.D Export shape

| # | Step | Expected |
|---|------|----------|
| 4.3.14 | As an account with trades: Ajustes → Exportar JSON; open the file. | The payload is exactly `{version, trades, balances, settings}`; `trades` contains every trade the user owns. |
| 4.3.15 | As a fresh account with no trades: Exportar JSON. | A valid payload with empty `trades` and default balances/settings is produced; no error is thrown. |

### 4.3.E No deployed test-mode rules

| # | Step | Expected |
|---|------|----------|
| 4.3.16 | Firebase Console → Firestore → Rules. | The deployed rules match `firestore.rules`; every rule scopes access to `request.auth.uid`; **no** `allow read, write: if request.auth != null` (or any unscoped authenticated rule) is present. |
| 4.3.17 | Negative REST probe (unauthenticated), e.g. `curl "https://firestore.googleapis.com/v1/projects/tradingdashboard-7425a/databases/(default)/documents/users/<uid>/trades"`. | The request is rejected (permission denied); no data is returned. |

## Results

Fill this table when running the steps. Leave 4.2 and 4.3 unchecked in
`tasks.md` until every row below is recorded.

| Task | Scope | Result (Pass/Fail) | Evidence / notes |
|------|-------|--------------------|------------------|
| 4.2 | Sign-in, session reload, logout, two-account isolation on `localhost` | | |
| 4.3 | Offline sync, migration KPI match, deletion, export shape, no test-mode rules | | |
