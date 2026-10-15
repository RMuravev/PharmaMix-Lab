# Phase 32 — version-bound model run persistence

Added `ModelRunPersistenceService` as the canonical persistence entry point for new model runners. It reads `projects.activeDatasetVersion` and writes the run and all result rows in one IndexedDB read-write transaction. The same dataset version is stamped onto the run and every result, together with algorithm version and parameters.

Callers can pass `expectedDatasetVersion` captured when the calculation started. If the active version changed before persistence, the transaction is aborted and the caller receives an instruction to rerun. This prevents persisting newly completed calculations as if they were based on the newer snapshot.

Important limits:
- Existing/legacy model runners are not automatically rerouted through this service in this phase.
- The service requires a project with an active published dataset version.
- It records model results, but does not implement any statistical model or perform recalculation itself.
- IndexedDB is local to the browser profile; this is not cross-device synchronization.
- Build and full test suite still require installing project dependencies.
