# Iteration 19 — versioned dataset publication

## What was added

- `VersionedDatasetPublisher` accepts normalized facts for sales, market, promo, TV, and visits.
- It writes all supplied source rows under a fresh version-scoped key and writes the project's `activeDatasetVersion` pointer in the same IndexedDB readwrite transaction.
- Ready aggregates for the project are marked stale in that transaction.
- Old fact rows remain stored, allowing a future rollback/audit path; active reads must use `ActiveFactsRepository`.

## Safety and integration limits

- The publisher requires an existing project record and at least one fact across the supplied sources.
- The publisher is an infrastructure/application service and is not yet wired into all legacy import screens. Existing legacy normalizers may still replace facts outside this atomic flow.
- Only facts passed to this call belong to the new version. To publish a complete analytical snapshot, the caller must supply all source data intended to remain active; omitted source stores become empty for this version from the active reader's perspective.
- `ActiveFactsRepository` only returns facts with the exact active version. Legacy records without `datasetVersion` remain invisible through that API.
- This does not yet migrate existing projects' legacy facts automatically. A dedicated migration and integration tests are required before enabling this as the default import path.
