# calculator-tab Specification

## Purpose

Split the risk calculator and its live preview into their own top-level "Calculadora" tab, leaving "Registro" with the daily goal, session review, trade form, and trades list. The form⇄calculator sync survives the split through the existing hidden-DOM mechanism.

## Requirements

### Requirement: Calculadora Tab

The system MUST show a top-level "Calculadora" tab button (`data-tab="calculadora"`) and a matching `#tab-calculadora` section. `switchTab` MUST include `calculadora` in its tab list and MUST toggle the section's visibility with the other tabs.

#### Scenario: Tab appears and switches

- GIVEN the app shell
- WHEN the "Calculadora" tab is clicked
- THEN the calculator card and preview aside are shown and the other tabs are hidden

### Requirement: Tab Content Split

The system MUST hold the calculator card and the `#riskPreview` aside in the "Calculadora" tab, and MUST keep the daily goal, session review, trade form, and trades list in "Registro".

#### Scenario: Content is split

- GIVEN the "Calculadora" tab
- WHEN it renders
- THEN the calculator card and preview are present, and no goal/review/form/trades markup is in it

#### Scenario: Registro keeps its content

- GIVEN the "Registro" tab
- WHEN it renders
- THEN the daily goal, session review, trade form, and trades list are present

### Requirement: Cross-Tab Sync Preserved

The calculator MUST keep reading the trade form's instrument, stop, and entry and writing drafts back across the split via the existing `syncInstrument`/`syncContracts` mechanism. The form MUST remain in the DOM (hidden, not removed) so the sync never breaks.

#### Scenario: Instrument sync across tabs

- GIVEN the instrument changed in the trade form
- WHEN the user opens the "Calculadora" tab
- THEN the calculator shows the same instrument

#### Scenario: Contracts sync across tabs

- GIVEN a contracts value set in the calculator
- WHEN the trade form is inspected
- THEN the form's contracts field reflects the same value

### Requirement: No Regression to Registro

Splitting the tab MUST NOT change the Registro flow: goal, session review, trade form, and trades list MUST keep their existing ids and behavior.

#### Scenario: Registro behavior unchanged

- GIVEN the Registro tab
- WHEN the user saves a goal, review, or trade
- THEN the existing save paths and element ids work as before
