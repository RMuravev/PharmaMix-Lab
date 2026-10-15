# PharmaMix Lab v3.2 — Phase 25 release notes

## Implemented

- `OverviewQueryService` reads the project's active dataset pointer and matching sales facts in the same readonly IndexedDB transaction.
- Active snapshot reads use the compound `projectId_datasetVersion` index.
- Legacy facts are used only if there is no `activeDatasetVersion`; an empty active version is an explicit data-quality error, not a reason to silently show old facts.
- Overview UI labels the data mode as `Активная версия` or `Legacy-данные`.
- Aggregate cache key includes the dataset version and therefore differs between publish and rollback versions.

## Verification status

- Archive integrity check: run after packaging.
- Automated tests / TypeScript / production build: not run; project dependencies are not installed in the available workspace.

## Remaining migration work

This iteration moves only the Overview sales query to version-aware reads. Other analytical screens and the legacy application are not yet guaranteed to read only the active dataset version. The full app must not be described as fully migrated until each query path is audited.
