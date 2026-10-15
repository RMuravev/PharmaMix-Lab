# Phase 34 — scenario result freshness guard

## Added

- `CurrentScenarioResultService.getCurrentResult()` reads the project pointer and scenario result in a single readonly IndexedDB transaction and rejects missing, cross-project, stale, legacy, or unverifiable results.
- `listForProject()` provides a history view with explicit freshness classifications rather than silently presenting old scenario results as current.
- Unit tests document the shared freshness policy for current, stale, legacy, and unverifiable data.

## Integration boundary

This introduces a safe application service. Existing legacy scenario screens and writers have not all been migrated to call it, and scenario writes do not yet guarantee that `datasetVersion` is stamped at creation. Until that integration is complete, do not claim global enforcement.

## Validation

The tests are authored but must be run in an environment with dependencies installed. IndexedDB transaction behavior should additionally be covered with browser-level integration tests.
