# Phase 33 — guarded access to model results

## Changes

- Added `CurrentModelResultService.getCurrentResults(projectId, runId)` as a safe read path for consumers that require current model output.
- The service reads project, run, and results in one IndexedDB readonly transaction.
- It rejects a missing/wrong-project run, legacy or unverifiable run, a run computed against an older dataset version, an empty result set, and result rows whose dataset version differs from the run.
- Added a typed `ModelResultNotCurrentError` with stable error code `MODEL_RESULT_NOT_CURRENT`.

## Scope and limitations

This is an opt-in guard service. Existing legacy dashboards and model screens do not automatically use it yet; callers must explicitly switch to this service before treating saved model outputs as current. The transaction makes the read internally consistent, but does not replace a fresh calculation when the active dataset changes later.

## Validation

Unit tests cover freshness classification and the typed guard error. Runtime IndexedDB integration tests and production build must be run in an environment with project dependencies installed.
