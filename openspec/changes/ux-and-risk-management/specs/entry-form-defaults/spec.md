# entry-form-defaults Specification

## Purpose

Define how entry and exit date/time fields are prefilled so a new trade starts from the current moment.

## Requirements

### Requirement: Entry Date/Time Default to Now

When a new entry form is prepared, the system MUST prefill the entry date with the current local date and the entry time with the current local time.

#### Scenario: Entry fields prefilled at open

- GIVEN the current local date is `2026-09-11` and the current local time is `14:05`
- WHEN a new entry form is prepared
- THEN the entry date field equals `2026-09-11`
- AND the entry time field equals `14:05`

### Requirement: Exit Date/Time Default to Now

When a new entry form is prepared, the system MUST prefill the exit date with the current local date and the exit time with the current local time.

#### Scenario: Exit fields prefilled at open

- GIVEN the current local date is `2026-09-11` and the current local time is `14:05`
- WHEN a new entry form is prepared
- THEN the exit date field equals `2026-09-11`
- AND the exit time field equals `14:05`

### Requirement: Defaults Reapplied After Reset

The system MUST reapply the current date/time defaults whenever the form is reset, including after a successful save and after an explicit clear.

#### Scenario: Defaults refreshed after save

- GIVEN a trade was just saved and the form is reset
- WHEN the reset completes
- THEN all four date/time fields show the current local date and time

#### Scenario: Stale time not retained

- GIVEN a form was prepared at `14:05`
- WHEN the form is reset at `14:40`
- THEN the entry and exit times show `14:40`, not `14:05`

### Requirement: Prefilled Values Remain Editable

The system MUST allow the user to overwrite any prefilled date/time value and SHALL validate the submitted values as before.

#### Scenario: User override preserved

- GIVEN the entry date is prefilled with today
- WHEN the user changes the entry date to a past date and submits
- THEN the submitted trade stores the user-entered past date

#### Scenario: Invalid value rejected

- GIVEN the entry time is prefilled
- WHEN the user clears the entry time and submits
- THEN validation reports the missing required field
- AND the trade is not saved
