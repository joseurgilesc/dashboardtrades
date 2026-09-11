# Research: firebase-multiuser

> **Schema**: `gentle-ai.sdd-research/v1`
> **Revision**: 2
> **Outcome**: `done`
> **Change**: `firebase-multiuser`
> **Artifact store**: `openspec`
> **Accessed at**: 2026-09-11
> **Scope**: source-backed evidence for migrating the static vanilla-JS trading journal to
> Firebase Auth + Cloud Firestore on GitHub Pages with no build step.

## Admission

- **Capability schema**: `gentle-ai.sdd-research-capability/v1` (admitted).
- **Observed exact grants**:
  - `documentation`: `https://firebase.google.com/docs/**`, `https://firebase.google.com/support/**`
  - `openWeb`: `https://firebase.google.com/**`, `https://www.gstatic.com/**`, `https://github.com/firebase/**`
- **Admission result**: admitted for both `documentation` and `open-web`. No class was denied.
- **Retrieval channel (revision 1)**: the runtime did not expose a general-purpose `webfetch` tool.
  Evidence was retrieved through the runtime's documentation-retrieval channel (Context7 index
  `/websites/firebase_google` and `/firebase/firebase-js-sdk`). Every source below resolves to a URL
  inside the declared grants; excerpts are reproduced as returned by that channel. This is an
  operational note, not a capability denial: both granted classes were usable.
- **Observation channel (revision 2)**: the exact gstatic asset URLs were probed directly by the
  orchestrator with HTTP `HEAD` requests on 2026-09-11. Each returned HTTP `200` with the
  content-length recorded in S19–S24. This is a direct HTTP observation, **not** a documentation page:
  the rows record the observed status line and content-length, which is exactly what a HEAD request
  can establish (existence + served size), and nothing more.

## Revision 2 Closure Notes

- **U1 closed** — the exact compat auth URL `.../firebasejs/12.18.0/firebase-auth-compat.js` was
  directly observed returning HTTP `200` (S20). C3 is promoted from *derived* to *validated*.
- **U2 closed** — the exact modular URLs `.../firebasejs/12.18.0/firebase-app.js` and
  `.../firebasejs/12.18.0/firebase-auth.js` were directly observed returning HTTP `200` (S22, S23).
  C6 is promoted from *derived* to *validated*. S24 re-confirms the modular Firestore URL.
- **U5 recorded (non-blocking)** — the canonical limits pages were retrieved in this pass: the 1 MiB
  document limit and a "500" limit for field transformations on a single document were confirmed. The
  "500 writes per batch" figure is still supported **only** by the secondary source S11 (a migration
  guide), not by the canonical limits table. C18 is retained as a validated secondary-source claim with
  that caveat; it no longer blocks the outcome because Q6 is otherwise directly supported.
- **Outcome raised `partial` → `done`**: every question now has at least one mapped source and no
  question depends on a derived URL.

## Questions and Status

| # | Question | Status |
|---|----------|--------|
| Q1 | Compat UMD builds on gstatic + current version + exact URLs | `supported` — exact compat URLs directly observed (S1, S19–S21) |
| Q2 | Exact ESM CDN URLs for app/auth/firestore + static-host/no-build | `supported` — exact modular URLs directly observed (S2, S22–S24) |
| Q3 | Current offline-persistence API; `enableIndexedDbPersistence` deprecation | `supported` |
| Q4 | Authorized domains (GitHub Pages + localhost); popup vs redirect | `supported` |
| Q5 | Per-user isolation Security Rules shape; test-mode unsafety | `supported` |
| Q6 | 500 writes/batch, 1 MiB/document, Spark free-tier quotas | `supported` — 1 MiB and 500 field transforms confirmed; 500-writes/batch secondary (S11) |
| Q7 | Client-only model with public `apiKey` + security implications | `supported` |

## Sources

| ID | Class | Title | Publisher | URL | Accessed | Excerpt |
|----|-------|-------|-----------|-----|----------|---------|
| S1 | documentation | Include Firebase compat scripts from CDN (Cloud Firestore quickstart) | Google (Firebase) | https://firebase.google.com/docs/firestore/quickstart | 2026-09-11 | `<script src="https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js"></script>` / `<script src="https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore-compat.js"></script>` |
| S2 | documentation | Manually Import Firebase JavaScript SDK from CDN for Web | Google (Firebase) | https://firebase.google.com/docs/flutter/setup | 2026-09-11 | `await import("https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js")` ; `.../firebase-analytics.js` |
| S3 | documentation | Load Firebase JS SDKs via reserved URLs in HTML | Google (Firebase) | https://firebase.google.com/docs/hosting/reserved-urls | 2026-09-11 | `<script src="/__/firebase/8.10.1/firebase-app.js">` , `.../firebase-auth.js` , `.../firebase-firestore.js` (Firebase Hosting path; file names documented) |
| S4 | documentation | Configure local cache options in JavaScript (Modular) / Configure offline persistence | Google (Firebase) | https://firebase.google.com/docs/firestore/enterprise/enable-offline | 2026-09-11 | `initializeFirestore(app, {localCache: persistentLocalCache(/*settings*/{})})` ; multi-tab via `persistentMultipleTabManager()` ; "disabled by default on the web"; "cache is not automatically cleared between web sessions" |
| S5 | open-web | enableIndexedDbPersistence(firestore, persistenceSettings) | Firebase (GitHub) | https://github.com/firebase/firebase-js-sdk/blob/main/docs-devsite/firestore_.md | 2026-09-11 | "This API is now obsolete and will be removed in a future major release." Replaced by configuring `FirestoreSettings.localCache`. |
| S6 | documentation | Enforce user-owned document access in Firestore Security Rules | Google (Firebase) | https://firebase.google.com/docs/firestore/security/rules-conditions | 2026-09-11 | `match /users/{userId} { allow read, update, delete: if request.auth != null && request.auth.uid == userId; }` |
| S7 | documentation | Allow Access to Authenticated Users in Firestore Rules (test mode) | Google (Firebase) | https://firebase.google.com/docs/firestore/security/get-started | 2026-09-11 | `allow read, write: if request.auth != null;` — "Not recommended for production without further scoping." |
| S8 | documentation | Standard limits > Collections, documents, and fields | Google (Firebase) | https://firebase.google.com/docs/firestore/enterprise/quotas-native-mode | 2026-09-11 | "The maximum document size is 1 MiB (1,048,576 bytes), maximum document name size is 6 KiB, and maximum field value size is 1 MiB minus 89 bytes." |
| S9 | documentation | Pricing overview > Free quota | Google (Firebase) | https://firebase.google.com/docs/firestore/pricing | 2026-09-11 | "1 GiB of stored data, 50,000 document reads per day, 20,000 document writes per day, 20,000 document deletes per day, and 10 GiB of outbound data transfer per month" |
| S10 | documentation | Native mode: Quotas and Limits > Free tier usage | Google (Firebase) | https://firebase.google.com/docs/firestore/enterprise/quotas-native-mode | 2026-09-11 | "1 GiB of stored data, 50,000 read units per day, 50,000 real-time update units per day, 40,000 write units per day, and 10 GiB of outbound data transfer per month" |
| S11 | documentation | Move historical data to Cloud Firestore | Google (Firebase) | https://firebase.google.com/docs/firestore/firestore-for-rtdb | 2026-09-11 | "...batched writes of up to 500 operations per network request, while staying within rate limits by keeping operations under 500 writes per second for each collection." |
| S12 | documentation | General information about API keys and Firebase | Google (Firebase) | https://firebase.google.com/docs/projects/api-keys | 2026-09-11 | "Firebase API keys are not used to control access to backend resources; access control is handled through Firebase Security Rules and Firebase App Check. As a result, Firebase API keys are safe to include in client code or checked-in configuration files..." |
| S13 | documentation | Inspect unauthorized redirect domain error message | Google (Firebase) | https://firebase.google.com/docs/auth/faq-and-troubleshooting | 2026-09-11 | `This domain YOUR_REDIRECT_DOMAIN is not authorized to run this operation.` |
| S14 | documentation | Authorized domains / localhost behavior | Google (Firebase) | https://firebase.google.com/docs/auth/web/email-link-auth | 2026-09-11 | "For projects created after April 28, 2025, Firebase Authentication no longer includes localhost as an authorized domain by default... it can be manually added in the Firebase console under Authentication Settings in the Authorized Domains section." |
| S15 | documentation | Switch from signInWithRedirect to signInWithPopup (redirect best practices) | Google (Firebase) | https://firebase.google.com/docs/auth/web/redirect-best-practices | 2026-09-11 | "Note that popup flows may be blocked by some devices or browsers." |
| S16 | documentation | Initialize Firebase with Custom Auth Domain | Google (Firebase) | https://firebase.google.com/docs/auth/web/github-auth | 2026-09-11 | "Ensure the domain is authorized in Firebase console and whitelisted in GitHub OAuth settings." |
| S17 | documentation | Track security rules document access call limits | Google (Firebase) | https://firebase.google.com/docs/firestore/security/rules-conditions | 2026-09-11 | "Batched writes enforce a maximum of 20 total document access calls across the batch, with a 10-call limit per individual operation." |
| S18 | documentation | Writes and transactions | Google (Firebase) | https://firebase.google.com/docs/firestore/enterprise/quotas-native-mode | 2026-09-11 | "A maximum of 500 field transformations can be performed on a single document in a Commit operation or transaction." |
| S19 | open-web | gstatic SDK asset — compat app (direct HTTP HEAD observation) | Google (gstatic) | https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js | 2026-09-11 | HTTP 200 OK; content-length: 32039 |
| S20 | open-web | gstatic SDK asset — compat auth (direct HTTP HEAD observation) | Google (gstatic) | https://www.gstatic.com/firebasejs/12.18.0/firebase-auth-compat.js | 2026-09-11 | HTTP 200 OK; content-length: 140149 |
| S21 | open-web | gstatic SDK asset — compat firestore (direct HTTP HEAD observation) | Google (gstatic) | https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore-compat.js | 2026-09-11 | HTTP 200 OK; content-length: 547052 |
| S22 | open-web | gstatic SDK asset — modular app (direct HTTP HEAD observation) | Google (gstatic) | https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js | 2026-09-11 | HTTP 200 OK; content-length: 104893 |
| S23 | open-web | gstatic SDK asset — modular auth (direct HTTP HEAD observation) | Google (gstatic) | https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js | 2026-09-11 | HTTP 200 OK; content-length: 156403 |
| S24 | open-web | gstatic SDK asset — modular firestore (direct HTTP HEAD observation) | Google (gstatic) | https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js | 2026-09-11 | HTTP 200 OK; content-length: 683614 |

## Validated Claims

Each claim maps to source IDs. No claim is derived in revision 2.

### Q1 — Compat SDK availability and version

- **C1** *(validated)*: Google still publishes compat UMD builds on gstatic. The Firestore quickstart
  documents loading `firebase-app-compat.js` and `firebase-firestore-compat.js` directly from
  `https://www.gstatic.com/firebasejs/12.18.0/`. → **[S1]**
- **C2** *(validated)*: The documented current SDK version string is `12.18.0`. → **[S1] [S2]**
- **C3** *(validated, revision 2)*: `https://www.gstatic.com/firebasejs/12.18.0/firebase-auth-compat.js`
  exists and is served from gstatic: a direct HTTP HEAD returned HTTP `200` with content-length 140149.
  This confirms the documented `<product>-compat.js` convention **[S1]** with a direct observation. → **[S20]**

### Q2 — Modular SDK from CDN, no build step

- **C4** *(validated)*: The modular file names `firebase-app.js`, `firebase-auth.js`, and
  `firebase-firestore.js` are documented. → **[S3]**
- **C5** *(validated)*: gstatic serves modular ESM bundles that can be imported directly from a plain
  HTML page via dynamic `import()` with no bundler/build step. → **[S2]**
- **C6** *(validated, revision 2)*: The exact gstatic modular URLs
  `https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js` (HTTP `200`, content-length 104893) and
  `https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js` (HTTP `200`, content-length 156403)
  exist and are served from gstatic, confirming the documented base **[S2]** plus documented file names
  **[S3]**. The modular Firestore URL `.../firebase-firestore.js` (HTTP `200`, content-length 683614) is
  likewise directly observed. → **[S22] [S23] [S24]**

### Q3 — Offline persistence API

- **C7** *(validated)*: The current API is
  `initializeFirestore(app, { localCache: persistentLocalCache(/*settings*/{}) })`. → **[S4]**
- **C8** *(validated)*: Multi-tab persistence is configured with
  `persistentLocalCache({ tabManager: persistentMultipleTabManager() })`. → **[S4]**
- **C9** *(validated)*: `enableIndexedDbPersistence` is obsolete and will be removed in a future major
  release; the replacement is configuring `FirestoreSettings.localCache`. → **[S5]**
- **C10** *(validated)*: On the web, persistence is disabled by default and the Firestore cache is not
  automatically cleared between sessions; apps handling sensitive data should confirm a trusted device
  before enabling persistence. → **[S4]**

### Q4 — Auth authorized domains and popup vs redirect

- **C11** *(validated)*: If the hosting domain is not authorized, authentication fails with
  `This domain <domain> is not authorized to run this operation.` → **[S13]**
- **C12** *(validated)*: The GitHub Pages domain MUST be added to Firebase Auth authorized domains in
  the Firebase console; a custom `authDomain` must likewise be authorized. → **[S13] [S16]**
- **C13** *(validated)*: For projects created after 2025-04-28, `localhost` is NOT an authorized domain
  by default and MUST be added manually in the console for local development. → **[S14]**
- **C14** *(validated)*: Popup sign-in (`signInWithPopup`) may be blocked by some devices or browsers;
  redirect (`signInWithRedirect` + `getRedirectResult`) is the documented fallback. → **[S15]**

### Q5 — Security Rules shape

- **C15** *(validated)*: The correct per-user isolation shape is
  `match /users/{userId} { allow read, write: if request.auth != null && request.auth.uid == userId; }`.
  The `{userId}` wildcard makes the claimed uid available to the rule. → **[S6]**
- **C16** *(validated)*: The default test-mode rule `allow read, write: if request.auth != null` grants
  every authenticated user access to all documents and is explicitly "Not recommended for production
  without further scoping." It MUST NOT ship for a multi-user app. → **[S7]**

### Q6 — Limits and quotas

- **C17** *(validated)*: The maximum Firestore document size is 1 MiB (1,048,576 bytes). → **[S8]**
- **C18** *(validated, secondary source — see U5)*: Batched writes are limited to up to 500 operations
  per network request. This figure comes from a migration guide (S11), not the canonical limits table;
  the canonical limits pages retrieved in revision 2 confirmed the 1 MiB document limit and a "500"
  limit for field transformations (S18) but did not restate 500 writes per batch. → **[S11]**
- **C19** *(validated)*: The standard free ("Spark"/no-cost) daily quota is 1 GiB stored data, 50,000
  document reads/day, 20,000 document writes/day, 20,000 document deletes/day, and 10 GiB/month
  outbound transfer. → **[S9]**
- **C20** *(validated)*: Security-rules evaluation for batched writes allows a maximum of 20 total
  document access calls, with a 10-call limit per operation. → **[S17]**
- **C23** *(validated, revision 2)*: A maximum of 500 field transformations can be performed on a single
  document in a Commit operation or transaction; this is a distinct limit from writes-per-batch. → **[S18]**

### Q7 — Client-only security model

- **C21** *(validated)*: Firebase API keys are NOT used to control access to backend resources; access
  control is enforced by Firebase Security Rules and (optionally) App Check. API keys are safe to
  include in client code and checked-in config. → **[S12]**
- **C22** *(validated)*: A static web app can talk to Firestore directly using the public `apiKey`.
  Consequently, confidentiality and integrity of user data depend entirely on correctly deployed
  Security Rules; the `apiKey` itself provides no protection. → **[S12]**

## Contradictions, Uncertainty, and Freshness

### Contradictions

- **X1 — Free-tier quota figures conflict.** S9 (`/docs/firestore/pricing`) states 50,000 reads/day,
  20,000 writes/day, 20,000 deletes/day. S10 (enterprise `/docs/firestore/enterprise/quotas-native-mode`)
  states 50,000 read units/day, 50,000 real-time update units/day, 40,000 write units/day. The unit
  names and values differ (likely standard vs. enterprise edition). The proposal MUST verify the quota
  that applies to project `tradingdashboard-7425a` in the Firebase console rather than assume either.
- **X2 — Two different "500" limits.** S11 supports "up to 500 operations per network request" for
  batched writes; S18 states "a maximum of 500 field transformations ... on a single document." These
  are distinct limits and must not be conflated. In revision 2 the canonical limits pages were retrieved
  and confirmed the 1 MiB document limit and the 500 field-transformations limit; the 500-writes-per-batch
  figure still rests on S11 (see U5).

### Uncertainty

- **U1 — CLOSED (revision 2).** The exact `firebase-auth-compat.js` URL is no longer derived; it was
  directly observed returning HTTP `200` (S20), and C3 is validated.
- **U2 — CLOSED (revision 2).** The exact gstatic modular `firebase-app.js` / `firebase-auth.js` URLs
  are no longer derived; both were directly observed returning HTTP `200` (S22, S23), and C6 is validated.
- **U3 — `file://` support loss is not source-backed.** The claim that native ES modules cannot run from
  `file://` is a general web-platform constraint and was not retrieved from a granted source; treat it
  as reasoning, not evidence. It does not affect Approach 1 (classic scripts). The orchestrator has since
  dropped `file://` as a target (GitHub Pages is the deployment target), so this is no longer load-bearing.
- **U4 — GitHub Pages serving of ESM was not directly evidenced by a Firebase source.** C5 evidences
  CDN dynamic import generally; it does not specifically prove GitHub Pages behavior. Approach 1 (compat
  classic scripts) does not depend on ESM serving.
- **U5 — 500-writes-per-batch rests on a secondary source (recorded, non-blocking).** The canonical
  limits pages retrieved in revision 2 (`/docs/firestore/quotas`, `/docs/firestore/manage-data/transactions`)
  confirmed the 1 MiB document limit and a "500" limit for field transformations on a single document,
  but did not restate 500 writes per batch. C18 therefore stays a validated secondary-source claim; the
  proposal SHOULD treat the exact batch ceiling as "verify before relying on it" rather than as canonical.
  This does not block the outcome because Q6 is otherwise directly supported.
- **U6 — Retrieval channel.** For revision 1, no general-purpose `webfetch` tool was exposed;
  documentation was retrieved via the runtime's documentation channel. The revision 2 gstatic URLs were
  observed by direct HTTP HEAD from the orchestrator. HEAD establishes existence and served size only;
  it does not validate content semantics.

### Freshness

- All sources were accessed on **2026-09-11**. Firebase documentation and the SDK version string
  (`12.18.0`) are living values and may change; quota figures especially are subject to change.
  Re-verify the SDK version and quota numbers immediately before implementation and release. The gstatic
  `12.18.0` assets are version-pinned and immutable for that version, so the observed URLs stay valid as
  long as that version is the chosen pin.

## Non-Authoritative Product Choices (separate from evidence)

These are product/architecture decisions owned by the orchestrator and the user. They are recorded
here only to keep them distinct from validated evidence. As of revision 2 the orchestrator has
**confirmed** the following choices; they remain non-authoritative for evidence.

- **Confirmed** — SDK loading: Firebase compat SDK via classic `<script>` tags from the gstatic CDN,
  no build step (exploration Approach 1). Directly supported by S1/S19–S21.
- **Confirmed** — Registration: invite/allowlist only (not open self-registration).
- **Confirmed** — Auth methods: email/password AND Google sign-in.
- **Confirmed** — Offline persistence: ENABLED (`initializeFirestore` + `persistentLocalCache`).
- **Confirmed** — Existing localStorage migration: automatic on first login; explicit JSON import
  remains available.
- **Confirmed** — Account deletion and full data export: INCLUDED now.
- **Confirmed** — Filtering: client-side (fetch all of the user's trades, filter in the browser).
- **Confirmed** — `file://` support: DROPPED (Firebase requires an http(s) origin); deployment target
  is GitHub Pages.
- **Still open (not evidence)** — whether to vendor the Firebase compat SDK locally instead of relying
  on the gstatic CDN. U1/U2 are already closed by direct observation, so vendoring is now an offline
  robustness choice, not a correctness requirement.
- **Still open (not evidence)** — Firestore data model shape: `users/{uid}/trades/{tradeId}`
  subcollection plus user-scoped balances/settings docs vs. a single blob document.
- **Still open (not evidence)** — offline persistence tab manager choice (`persistentSingleTabManager`
  vs. `persistentMultipleTabManager`).

None of the above is admitted as evidence, and none is decided by this research.

## Outcome

`done` — every question (Q1–Q7) has at least one mapped source, and no validated claim depends on a
derived URL. U1 and U2 were closed in revision 2 by direct HTTP HEAD observations of the exact gstatic
assets (S19–S24), promoting C3 and C6 from *derived* to *validated*. U5 is recorded honestly: the
500-writes-per-batch figure remains a secondary-source claim (S11) with a non-blocking "verify before
relying" note, while the 1 MiB document limit and the 500 field-transformations limit are directly
supported (S8, S18). Remaining uncertainties (U3–U6) are documented and do not block proposal admission.
Product decisions are confirmed and separated from evidence.
