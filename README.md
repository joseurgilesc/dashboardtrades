# Trading Journal

A **static** web app for logging and analysing trading operations. It replaces the old macro-driven spreadsheet with a clear, fast interface and no external dependencies at runtime.

- Plain HTML, CSS and JavaScript (vanilla). No framework, no bundler, no build step.
- Charts use [Chart.js](https://www.chartjs.org/) 4.4.4, vendored locally at `vendor/chart.umd.js`.
- Data lives in **Cloud Firestore**, scoped to the signed-in user; authentication is handled by **Firebase Auth**.
- Deployed as a static site on **GitHub Pages**. Opening the app over `file://` is **not supported**.

## Requirements

- A modern browser (current Chrome, Edge, Firefox or Safari).
- Network access for sign-in and synchronization. Offline persistence keeps the journal usable while offline and syncs on reconnect.
- For local development, a simple static server (see below). You do **not** need Node to use the app.

## Run locally

The app must be served over HTTP/HTTPS; `file://` will not work because Firebase Auth and Firestore require an origin.

```bash
# From the project root, pick one:
python -m http.server 8000
# or
npx serve .
```

Then open `http://localhost:8000/`.

`localhost` must be listed as an authorized domain in Firebase Auth (see below). The default Firebase configuration lives in `js/firebase.js`.

## Firebase setup

The app talks to the Firebase project `tradingdashboard-7425a`. The web `apiKey` in `js/firebase.js` is a **public client identifier, not a secret** — access control lives in Firebase Auth and Firestore Security Rules.

### 1. Enable authentication providers

Firebase Console → **Authentication → Sign-in method**:

- Enable **Email/Password**.
- Enable **Google**.

### 2. Add authorized domains

Firebase Console → **Authentication → Settings → Authorized domains**:

- `localhost` (for local development).
- Your GitHub Pages domain, e.g. `<user>.github.io`.
- `tradingdashboard-7425a.firebaseapp.com` (already present by default).

### 3. Invite users with the allowlist

Registration is **invite-only**. Signing up is allowed, but access is granted only when the account's email has a matching document in the `allowlist` collection.

For each invited person, create a document in Firestore:

```
allowlist/{email}
  { "invited": true }
```

The **document ID must be the exact email address** (for example `allowlist/ana@example.com`). Accounts that are not on the allowlist are signed out automatically and never see any journal data.

Email/password accounts must also be **email-verified**: Security Rules require `email_verified == true`, which blocks anyone from impersonating an allowlisted email. Google accounts arrive verified.

### 4. Deploy the Security Rules

`firestore.rules` is the authoritative access control: it scopes every read and write to `request.auth.uid` and requires the allowlist check. Deploy it with the Firebase CLI:

```bash
firebase deploy --only firestore:rules
```

Or paste `firestore.rules` into Firebase Console → **Firestore → Rules** and publish.

> **Never ship test-mode rules.** A rule such as `allow read, write: if request.auth != null` would grant every authenticated user access to every document. The shipped rules must keep the uid scope and the allowlist check.

## Data storage

Trades, balances and settings are stored per user in Firestore:

```
users/{uid}                     { email, createdAt, migratedAt? }
users/{uid}/trades/{tradeId}    one document per trade (tradeId = trade id)
users/{uid}/meta/balances       { Sim, Real, Fondeo }
users/{uid}/meta/settings       settings map
```

Data is private to each account and synchronized in real time. Offline persistence is enabled before any Firestore call, so entries made offline are retained locally and synchronized when connectivity returns.

### Migrating from localStorage

Older versions stored everything in `localStorage` under the key `bpt.journal.v1`. On first sign-in, if the account has **no** stored trades **and** `bpt.journal.v1` exists, the app automatically:

1. parses and normalizes the local journal;
2. writes the trades (in batches of at most 500), plus balances and settings;
3. stamps `migratedAt` on the user document;
4. removes the local `bpt.journal.v1` key only after all writes succeed.

The imported trades keep the same KPIs they had locally. If the account already has trades, migration is skipped and the local key is left untouched. Explicit **Import JSON** remains available as a manual alternative.

## Backups

In the **Ajustes** tab:

- **Exportar JSON** — downloads `{version, trades, balances, settings}`; the recommended full backup.
- **Importar JSON** — restores a previous backup (replaces current data).
- **Exportar CSV** — downloads trades as a spreadsheet, useful for external analysis.
- **Cargar datos de ejemplo** — inserts 8 demo trades.
- **Borrar todo** — deletes all trades and resets starting balances (asks for confirmation).

**Recommendation:** export a JSON backup regularly, especially before a migration or account deletion.

## Account deletion

**Ajustes → Zona de peligro** lets a signed-in user delete their account. After an explicit confirmation, the app deletes all of the user's trades and meta documents, then deletes the auth account and ends the session. If Firebase asks for a recent login, the app re-authenticates once (password or Google) and retries.

## Deploy to GitHub Pages

1. Create a new GitHub repository, for example `trading-journal`.

2. From this folder, run:

   ```bash
   git init
   git add .
   git commit -m "feat: trading journal"
   git branch -M main
   git remote add origin https://github.com/<user>/trading-journal.git
   git push -u origin main
   ```

3. In the repository, go to **Settings → Pages**.

4. Under **Source**, select **Deploy from a branch**. Choose branch `main` and folder `/ (root)`. Click **Save**.

5. Wait a minute or two. The site is published at:

   ```
   https://<user>.github.io/trading-journal/
   ```

6. Add that Pages domain to **Authentication → Settings → Authorized domains** in Firebase.

## Testing the Security Rules

The only automatable test layer is the Firestore Security Rules. It runs against the Firestore emulator with `@firebase/rules-unit-testing` and does **not** add a build step to the app: the tooling is dev-only and the app never imports it.

```bash
npm install         # installs dev-only tooling (never used by the app)
npm run test:rules  # starts a throwaway emulator project and runs test/rules.test.js
```

`test/rules.test.js` proves that an allowlisted owner is allowed, while cross-user, unauthenticated, non-allowlisted, and unverified-email access are denied. Requirements: Node ≥ 20 and a Java runtime (the Firestore emulator needs Java). The emulator uses the throwaway project `demo-trading-journal`, so no real Firebase project is touched. You can remove the tooling at any time by deleting `node_modules/`.

Everything else (sign-in, isolation, offline sync, migration, deletion, export) is verified manually; see `openspec/changes/firebase-multiuser/manual-verification.md`.

## Project structure

```
trading-journal/
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── instruments.js   # Reference data (instruments, accounts, strategies, emotions...)
│   ├── store.js         # In-memory state, calculations, KPIs, import/export
│   ├── charts.js        # Dashboard charts (Chart.js)
│   ├── firebase.js      # SDK init, auth, allowlist, Firestore adapter, migration, deletion
│   └── app.js           # UI: auth gate, form, table, filters, tabs
├── vendor/
│   └── chart.umd.js     # Chart.js 4.4.4 (vendored locally)
├── test/
│   └── rules.test.js    # Firestore Security Rules tests (emulator)
├── firestore.rules      # Deployed Security Rules
├── firebase.json        # Emulator configuration for the rules tests
├── package.json         # Dev-only test tooling (the app stays build-free)
└── README.md
```

## Calculation rules

For each trade:

- `points = (Long) ? exit − entry : entry − exit`
- `gross = points × contracts × point value`
- `commission = instrument commission × contracts`
- `net = gross − commission`
- The **cumulative** figure is the running sum of net, ordered by ascending entry date/time.
- Each account's **balance** is the starting balance plus the sum of its trades' net.
- A trade is a **winner** when `net > 0` and a **loser** when `net <= 0`.
