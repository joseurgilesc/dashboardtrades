# User Authentication Specification

## Purpose

Defines authentication, registration, session, account deletion, and data-portability behavior for the multi-user trading journal.

## Requirements

### Requirement: Email and Password Authentication

The system MUST allow a user to authenticate with an email address and password.

#### Scenario: Successful sign-in

- GIVEN an allowlisted account exists with a valid password
- WHEN the user submits the correct email and password
- THEN the system establishes an authenticated session
- AND the user's journal data becomes visible

#### Scenario: Rejected credentials

- GIVEN an account exists
- WHEN the user submits an incorrect password
- THEN authentication fails
- AND no journal data is shown
- AND a non-sensitive error message is displayed

### Requirement: Google Sign-In

The system MUST allow a user to authenticate with a Google account.

#### Scenario: Successful Google sign-in

- GIVEN an allowlisted Google account
- WHEN the user completes Google sign-in
- THEN an authenticated session is established

#### Scenario: Google flow unavailable

- GIVEN a browser blocks the popup flow
- WHEN the user attempts Google sign-in
- THEN the system MUST present a usable fallback or an actionable error
- AND MUST NOT leave the user in a partially authenticated state

### Requirement: Allowlist-Only Registration

The system MUST NOT grant access to any account that is not on the allowlist.

#### Scenario: Allowlisted account obtains access

- GIVEN an email on the allowlist
- WHEN the user registers or signs in
- THEN the system grants access to the journal

#### Scenario: Non-allowlisted account denied

- GIVEN an email that is not on the allowlist
- WHEN that account attempts to register or sign in
- THEN the system MUST deny access
- AND MUST NOT expose any journal data

### Requirement: Session Persistence and Logout

The system MUST persist an authenticated session across page reloads and MUST end it on logout.

#### Scenario: Session survives reload

- GIVEN an authenticated user
- WHEN the page is reloaded
- THEN the user remains authenticated without re-entering credentials

#### Scenario: Logout clears access

- GIVEN an authenticated user
- WHEN the user logs out
- THEN the session ends
- AND journal data is no longer visible
- AND the auth gate is shown

### Requirement: Account Deletion

The system MUST allow a user to delete their account and all associated data.

#### Scenario: Deletion removes user data

- GIVEN an authenticated user with stored trades
- WHEN the user confirms account deletion
- THEN the account is removed
- AND all of the user's stored documents are deleted
- AND the session ends

#### Scenario: Deletion requires confirmation

- GIVEN an authenticated user
- WHEN the user requests deletion without confirming
- THEN no data is deleted

### Requirement: Full Data Export

The system MUST allow a user to export all of their data as a JSON payload shaped `{version, trades, balances, settings}`.

#### Scenario: Export contains all data

- GIVEN an authenticated user with trades, balances, and settings
- WHEN the user requests a full export
- THEN the system produces a JSON payload with `version`, `trades`, `balances`, and `settings`
- AND the payload includes every trade the user owns

#### Scenario: Export for an empty account

- GIVEN an authenticated user with no trades
- WHEN the user requests a full export
- THEN the system produces a valid payload with empty collections
- AND MUST NOT error
