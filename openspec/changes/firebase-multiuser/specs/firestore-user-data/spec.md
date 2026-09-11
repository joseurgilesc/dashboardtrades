# Firestore User Data Specification

## Purpose

Defines per-user storage, isolation, synchronization, and offline behavior for journal data.

## Requirements

### Requirement: Per-User Data Isolation

The system MUST prevent any user from reading or writing another user's documents. Firestore Security Rules MUST scope all access to `request.auth.uid`.

#### Scenario: Owner accesses own data

- GIVEN user A is authenticated
- WHEN user A reads or writes their own documents
- THEN the operation is permitted

#### Scenario: Cross-user read denied

- GIVEN user A is authenticated and user B has documents
- WHEN user A attempts to read user B's documents
- THEN the operation is denied
- AND no data from user B is returned

#### Scenario: Unauthenticated access denied

- GIVEN no authenticated session
- WHEN any document read or write is attempted
- THEN the operation is denied

### Requirement: Trade Storage

The system MUST store each trade as a document under `users/{uid}/trades/{tradeId}`, where `{uid}` is the owner's uid.

#### Scenario: Trade persisted under its owner

- GIVEN an authenticated user
- WHEN the user creates a trade
- THEN the trade is stored under that user's `trades` subcollection
- AND it is retrievable by the same user

#### Scenario: Trade update and delete

- GIVEN an authenticated user with a stored trade
- WHEN the user updates or deletes it
- THEN the change is reflected for that user only

### Requirement: Balances and Settings Persistence

The system MUST persist per-user balances and settings in user-scoped documents isolated identically to trades.

#### Scenario: Balances scoped to the user

- GIVEN an authenticated user
- WHEN the user changes account balances or settings
- THEN the values persist under that user's documents
- AND another user's balances and settings are unaffected

### Requirement: Realtime Synchronization

The system MUST reflect data changes to the owning user without a manual refresh.

#### Scenario: Change appears live

- GIVEN an authenticated user viewing the journal
- WHEN the user's data changes
- THEN the view updates to reflect the change

### Requirement: Offline Persistence

The system MUST enable offline persistence so the journal is usable without a network connection and synchronizes on reconnect.

#### Scenario: Offline entry syncs later

- GIVEN an authenticated user who has loaded the journal
- WHEN the user creates a trade while offline
- THEN the trade is retained locally
- AND it is synchronized when connectivity returns

### Requirement: Prohibited Test-Mode Rules

The system MUST NOT ship Security Rules that grant every authenticated user access to all documents (for example `allow read, write: if request.auth != null`).

#### Scenario: Rules are uid-scoped before release

- GIVEN a release candidate
- WHEN its deployed Security Rules are inspected
- THEN every rule scopes access to `request.auth.uid`
- AND no unscoped authenticated-user rule is present

### Requirement: API Key Is Not Access Control

The system MUST treat the Firebase web `apiKey` as a public identifier and MUST NOT rely on it to protect data.

#### Scenario: apiKey grants no access

- GIVEN an attacker possesses the public `apiKey`
- WHEN the attacker attempts to read another user's documents without an authorized session
- THEN access is denied by Security Rules
