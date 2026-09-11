# Client Migration Specification

## Purpose

Defines the no-build Firebase integration, auth-gated boot, synchronous store contract, localStorage migration, and deployment target.

## Requirements

### Requirement: No-Build Firebase Compat SDK

The system MUST load the Firebase compat SDK version `12.18.0` from the gstatic CDN via classic `<script>` tags, with no build step, bundler, or ES modules.

#### Scenario: SDK loads without a build

- GIVEN the deployed static page
- WHEN the page loads
- THEN the pinned `12.18.0` compat scripts load from gstatic
- AND the app functions without any build or bundling step

#### Scenario: Pinned version

- GIVEN the loaded page
- WHEN the SDK version is inspected
- THEN it is `12.18.0`

### Requirement: Auth-Gated Boot

The system MUST NOT render user data until authentication state has resolved.

#### Scenario: Data hidden before auth resolves

- GIVEN a fresh page load
- WHEN authentication state has not yet resolved
- THEN no journal data is displayed

#### Scenario: Data shown after authentication

- GIVEN a valid authenticated session
- WHEN authentication state resolves
- THEN the user's journal data is displayed

### Requirement: Synchronous Store Contract Preserved

The system MUST preserve the existing synchronous in-memory `Store` API so existing calculation and rendering code continues to work, while persistence happens asynchronously in the background.

#### Scenario: Existing call sites still work

- GIVEN the migrated app
- WHEN existing code calls the synchronous `Store` read methods
- THEN valid in-memory data is returned without awaiting
- AND no caller requires modification

#### Scenario: Mutations remain consistent

- GIVEN an authenticated user
- WHEN a synchronous mutation is issued
- THEN in-memory state updates immediately
- AND the change is persisted asynchronously

### Requirement: Automatic localStorage Migration

On first login, the system MUST automatically migrate existing `bpt.journal.v1` data into the user's account when the account has no data.

#### Scenario: First login imports local data

- GIVEN `bpt.journal.v1` exists locally and the account has no stored trades
- WHEN the user logs in for the first time
- THEN the local trades, balances, and settings are written to the user's account
- AND the imported data matches the local KPIs

#### Scenario: No local data

- GIVEN no `bpt.journal.v1` exists
- WHEN the user logs in
- THEN no migration occurs
- AND the app starts from the account's existing state

### Requirement: Explicit JSON Import Retained

The system MUST retain the existing explicit JSON import as an alternative to automatic migration.

#### Scenario: Manual import works

- GIVEN an authenticated user
- WHEN the user imports a valid JSON payload
- THEN its trades, balances, and settings are added to the user's account

#### Scenario: Invalid payload rejected

- GIVEN an authenticated user
- WHEN the user imports a malformed payload
- THEN the system rejects it
- AND MUST NOT corrupt existing data

### Requirement: Client-Side Filtering

The system MUST fetch all of the user's trades and perform filtering and sorting in the browser.

#### Scenario: Filters applied in browser

- GIVEN an authenticated user with trades
- WHEN the user applies account, instrument, strategy, emotion, date, or search filters
- THEN results are computed client-side from the fetched trades

### Requirement: GitHub Pages Deployment

The system MUST be deployable as a static site on GitHub Pages and MUST NOT require `file://` support.

#### Scenario: Works on Pages

- GIVEN the site is deployed to GitHub Pages
- WHEN a user loads it over HTTPS
- THEN authentication and data access function normally

#### Scenario: file:// unsupported

- GIVEN the site is opened via `file://`
- WHEN the app initializes
- THEN Firebase functionality is not guaranteed
- AND documentation MUST NOT claim `file://` support
