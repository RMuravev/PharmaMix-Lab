# Phase 25 — Overview version-aware reads

## Changes

- Overview reads `projects.activeDatasetVersion` and `salesFacts` in one readonly IndexedDB transaction.
- When an active version exists, only facts matching `[projectId, activeDatasetVersion]` are queried.
- Legacy fallback is used only when the project has no active snapshot pointer. An empty active version does not silently fall back to old facts.
- Aggregate cache identity now uses the active snapshot version, so rollback or republishing cannot reuse the aggregate for another version.
- Overview view data exposes `dataVersion` and `legacyData` for a later UI status indicator.

## Safety boundary

This change covers the Overview query only. Other pages and calculations must be audited and moved to version-aware repositories before the entire application can be described as version-consistent. Legacy importers must not write after an active snapshot exists.

## Verification

The ZIP archive is integrity-checked. Full test, TypeScript, and production-build results must be recorded separately in an environment with dependencies installed.
