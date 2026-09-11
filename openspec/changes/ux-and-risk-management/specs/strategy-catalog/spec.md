# strategy-catalog Specification

## Purpose

Define the named BPT strategy catalog, its grouping and ordering, display-label resolution, and safe handling of legacy identifiers.

## Requirements

### Requirement: Strategy Catalog Structure

The system MUST define eight named strategies, each as `{ id, name, group }` where `id` is a stable identifier and `group` is one of `scalping`, `swing`, or `legacy`.

#### Scenario: Catalog exposes eight named strategies

- GIVEN the catalog is loaded
- WHEN the named strategies are listed
- THEN exactly eight strategies with non-empty `id` and `name` are returned

#### Scenario: Stable identifiers

- GIVEN a strategy is referenced by its `id`
- WHEN the display name changes
- THEN the `id` remains unchanged

### Requirement: Strategy Grouping and Order

The system MUST group strategies as `scalping`, `swing`, and `legacy`, and SHALL present `scalping` first, then `swing`, then `legacy`.

#### Scenario: Group membership

- GIVEN the catalog is loaded
- WHEN strategies are grouped
- THEN `scalping` contains Vela a Vela, Box Breakout, Doble 00, and Cruces de Medias
- AND `swing` contains Tres Impulsos, Gaps, Figuras Chartistas, and Weinstein
- AND `legacy` contains `E1` through `E5`

#### Scenario: Scalping shown first

- GIVEN the strategy selector is populated
- WHEN the options are rendered
- THEN the `scalping` group appears before `swing` and `legacy`

### Requirement: Legacy Identifier Fallback

The system MUST keep existing `E1..E5` trade identifiers unchanged and MUST render unknown strategy identifiers as their raw identifier, without remapping them to named strategies.

#### Scenario: Legacy trade still renders

- GIVEN a stored trade has `strategy` = `E3`
- WHEN the trade strategy is displayed
- THEN the label resolves to a legacy label that includes the raw identifier `E3`

#### Scenario: Unknown identifier fallback

- GIVEN a stored trade has `strategy` = `unknown-code`
- WHEN the trade strategy is displayed
- THEN the label equals `unknown-code`

### Requirement: Label Resolution and Chart Ordering

The system MUST resolve any stored strategy value to a display label through a single lookup, and chart groupings SHALL order strategies by the catalog order with legacy entries last.

#### Scenario: Named strategy label

- GIVEN the catalog contains `id` `vela-a-vela` with name `Vela a Vela`
- WHEN that id is resolved
- THEN the label is `Vela a Vela`

#### Scenario: Chart includes legacy entries

- GIVEN trades exist for named strategies and for `E1`
- WHEN the strategy chart renders
- THEN named strategies appear in catalog order
- AND the `E1` entry is included in the legacy group

### Requirement: Stored Strategy Value Stability

The system MUST keep `trade.strategy` as a string identifier and MUST NOT persist display names as the stored value.

#### Scenario: Persisted value is the id

- GIVEN a trade is saved with the Vela a Vela strategy selected
- WHEN the persisted trade is read
- THEN `trade.strategy` equals the strategy `id`
