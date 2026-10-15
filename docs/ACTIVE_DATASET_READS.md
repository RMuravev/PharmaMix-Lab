# Version-aware fact reads (phase 18)

## Added

- IndexedDB schema version 5 adds compound `projectId + datasetVersion` indexes to all five fact stores.
- `ActiveFactsRepository` reads the project's `activeDatasetVersion` and facts from the selected store in one readonly transaction.
- Facts without a version are deliberately excluded by this API to avoid mixing legacy rows with versioned rows.

## Important limitation

This is the version-aware read primitive, not a completed migration of the application. Current normalizers/import services and existing UI/analytics paths may still write or read legacy rows. Until every writer stamps `projectId` and `datasetVersion`, every query uses the active-version repository, and an import pipeline prepares all five stores before activation, the application must not claim end-to-end atomic publication.

## Integration checklist

1. Assign an unpublished dataset version before writing facts.
2. Write normalized facts with both `projectId` and `datasetVersion`.
3. Validate row counts, source coverage, required fields, and numeric ranges.
4. Build aggregates keyed by the same dataset version.
5. Mark the version ready only after all expected sources and aggregates succeed.
6. Activate through `DatasetPublicationService`.
7. Move all analytics reads to `ActiveFactsRepository` and version-keyed aggregates.
8. Add migration and rollback tests before removing legacy read paths.
