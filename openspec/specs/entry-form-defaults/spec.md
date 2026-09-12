# entry-form-defaults Specification

## Purpose

Define how a new entry form starts from sensible defaults: the current moment, the user's last-used setup, the calculator's contract suggestion, and a duplicate-last-trade shortcut.

## Requirements

### Requirement: Entry and Exit Default to Now

When a new entry form is prepared, the system MUST prefill both entry and exit date with the current local date and both times with the current local time, and MUST reapply these defaults on every reset (after a save, a clear, or an explicit reset).

#### Scenario: Fields prefilled at open

- GIVEN the current local date is `2026-09-11` and the time is `14:05`
- WHEN a new entry form is prepared
- THEN entry and exit dates equal `2026-09-11` and both times equal `14:05`

#### Scenario: Stale time not retained

- GIVEN a form was prepared at `14:05`
- WHEN the form is reset at `14:40`
- THEN the entry and exit times show `14:40`

### Requirement: Prefilled Values Remain Editable

The system MUST allow the user to overwrite any prefilled value and SHALL validate the submitted values as before.

#### Scenario: User override preserved

- GIVEN the entry date is prefilled with today
- WHEN the user changes it to a past date and submits
- THEN the stored trade uses the user-entered past date

### Requirement: Last-Used Selections Prefilled

The system MUST persist the last-used `account`, `instrument`, `strategy`, `direction`, and `emotion` and MUST prefill them on open/reset, validating each against its catalog and falling back to the first catalog value for stale or unknown stored values.

#### Scenario: Prefill from the last save

- GIVEN the user last saved a trade with `Fondeo`, `ES`, `vela-a-vela`, `Corto`, and `Foco`
- WHEN a new entry form is prepared
- THEN those five selects show the last-used values

#### Scenario: Unknown stored value falls back

- GIVEN the stored last-used instrument is no longer in the catalog
- WHEN the form is prepared
- THEN that select falls back to the first catalog value

#### Scenario: Prefill never clobbers an edit

- GIVEN the user is editing an existing trade
- WHEN the edit form is shown
- THEN the trade's own values are used

### Requirement: Contracts Prefilled From the Calculator

The system MUST prefill the contracts field with the calculator's suggested contracts while the field is untouched, MUST stop auto-filling once the user edits it, and MUST leave it blank when the suggestion is 0.

#### Scenario: Untouched contracts prefilled

- GIVEN the calculator suggests 6 contracts for the selected setup
- WHEN the form renders with the field untouched
- THEN the field shows 6

#### Scenario: User edit stops the prefill

- GIVEN the user types a contracts value
- WHEN the calculator re-renders
- THEN the user's value is preserved

### Requirement: Duplicate Last Trade

The system MUST provide a duplicate action that copies the last saved trade's setup fields (account, instrument, strategy, direction, emotion, contracts, target, stop) into the form as a NEW trade, leaving id, trade number, entry/exit prices, and exit data empty. It MUST be disabled while the journal has no trades.

#### Scenario: Duplicate creates a new trade

- GIVEN the journal has a saved trade #9
- WHEN the user duplicates the last trade and saves
- THEN a new trade is added with a new id and the next trade number
- AND the original trade #9 is unchanged

### Requirement: Optional Fields Collapsed

The system MUST keep `notes`, `target`, and `plannedRisk` behind a collapsed "Más opciones" disclosure by default, and MUST open it when an edited or duplicated trade uses any of those fields.

#### Scenario: Collapsed by default

- GIVEN a new entry form is prepared
- WHEN it renders
- THEN the "Más opciones" disclosure is collapsed

#### Scenario: Opened when in use

- GIVEN an edited trade records a target
- WHEN the edit form is shown
- THEN the disclosure is open
