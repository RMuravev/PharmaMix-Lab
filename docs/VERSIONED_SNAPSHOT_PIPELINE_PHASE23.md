# Phase 23 — versioned snapshot preparation

## Implemented

- `VersionedSnapshotBuilder` normalizes all five data sources without opening IndexedDB or mutating persisted facts.
- Every source must be explicit (`sales`, `market`, `promo`, `tv`, `visits`); an intentionally empty source is represented by `[]`.
- Per-source row counts, fingerprints, skipped rows and validation issues are returned for import review. `previewSnapshot()` exposes this report without writing data.
- `UnifiedImportService.importSnapshot()` connects the pure builder to `VersionedDatasetPublisher`; publication starts only after all source normalization has completed.
- Tests cover required-source validation, all five source normalizers, promo mechanic preservation and invalid-row reporting.

## Important limits

- This is an application API, not yet a fully wired UI flow. The current screen-level single-source import remains present for legacy projects.
- `importSnapshot()` expects a complete snapshot. It must not be called with only the changed source, because omitted or intentionally empty sources are not interchangeable.
- `importSnapshot()` rejects snapshots with skipped rows by default. It only proceeds with `allowSkippedRows: true`, which must be used after explicit review/confirmation. A validation error carries the report in its `report` property for the caller to render.
- Existing analytics pages and every direct legacy-store reader have not yet been migrated to `ActiveFactsRepository`.
- Multi-user synchronization is not provided by IndexedDB; it remains browser-profile local storage.

## Next acceptance criteria

1. Add preview/confirm/cancel UI for full-snapshot imports.
2. Wire `previewSnapshot()` into UI, render the report, and only call `importSnapshot()` with `allowSkippedRows: true` after confirmation.
3. Migrate analytics queries to active-version reads and include `datasetVersion` in all aggregate cache keys.
4. Add browser-level IndexedDB tests for publication, rollback, quota failures and upgrade from existing DB versions.
5. Run `npm ci`, `npm test`, `npm run lint`, and `npm run build` in an environment with dependencies available.
