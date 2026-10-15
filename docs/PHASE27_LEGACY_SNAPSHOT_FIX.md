# Phase 27 — legacy snapshot read-path correction

## Change

`ActiveDatasetSnapshotRepository` now loads project-scoped rows for all five fact stores when a project has no `activeDatasetVersion` pointer. The result remains explicitly marked `legacy: true` with `datasetVersion: null`.

## Why

Previously the repository returned an empty snapshot immediately when the pointer was absent. This contradicted its compatibility contract and made legacy projects appear to have no data when consumers used the shared snapshot API.

## Consistency rules

- If an active pointer exists, each store is queried by the compound key `[projectId, datasetVersion]`.
- If no active pointer exists, each store is queried only by `projectId` and the snapshot is marked legacy.
- The pointer and all five store reads remain inside one readonly IndexedDB transaction.
- Legacy rows are never mixed with versioned rows.

## Validation status

Archive integrity is checked. Runtime tests, TypeScript and production build require installing the project dependencies and have not been certified in this environment.

## Remaining migration work

This fixes the shared repository's legacy read path; it does not automatically migrate all existing dashboards and model services to use this repository. Consumers must be migrated individually and tested against both legacy and versioned projects.
