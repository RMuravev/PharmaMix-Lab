# Phase 24 — versioned snapshot import UI

## Added
- New `VersionedSnapshotImportPage` in the isolated `/workspace` experience.
- CSV selectors for sales, market, promo, TV, and medical-rep visits.
- Explicit opt-in for intentionally empty sources, to distinguish empty from omitted.
- Preview report with per-source accepted/skipped counts and row issues.
- Explicit confirmation before allowing skipped rows, followed by publication through `UnifiedImportService.importSnapshot` / `VersionedDatasetPublisher`.
- Existing single-source sales import is clearly labelled legacy and remains available.

## Important behavior
- A publication is a complete snapshot, not a merge. Users must include unchanged sources in the new snapshot; marking a source empty publishes it with no rows.
- The legacy sales importer remains available for projects without active versioned data; do not treat the application as fully migrated.
- IndexedDB is local to the current browser profile. The project ID is not a shared multi-user workspace.

## Verification
- ZIP integrity is checked when packaging.
- Full typecheck, tests and production build must be run in an environment with dependencies installed before production use.
