# Dataset publication lifecycle (phase 17)

## What this phase introduces

- IndexedDB schema v4 adds `datasetVersions`.
- Each publication record has `building`, `ready`, `active`, `superseded`, or `failed` lifecycle status.
- A version becomes `ready` only after all declared source types have been marked prepared.
- `activate()` writes the project `activeDatasetVersion` pointer and updates the old/new publication statuses in one IndexedDB transaction.
- A failed preparation can be marked `failed`; an active or superseded version cannot be marked failed.

## Important limitation

This is lifecycle and pointer infrastructure, **not yet end-to-end atomic import**. Current normalizers still write facts to the existing source fact stores without a required `datasetVersion` partition, and existing read paths do not consistently filter on `projects.activeDatasetVersion`. Therefore the new activation pointer must not yet be used to claim that a multi-source import is isolated or rollback-safe.

## Required follow-up before enabling in the UI

1. Add `datasetVersion` to every fact and aggregate record and add indexes such as `[projectId, datasetVersion]`.
2. Change normalizers to write to the target unpublished version without deleting active facts.
3. Make every query, dashboard, model run, export, and worker resolve the active pointer once and filter all reads by that version.
4. Validate row counts, required sources, schema versions, and aggregate readiness before calling `activate()`.
5. Add browser-level integration tests for interrupted staging, quota errors, concurrent tabs, reload/recovery, and atomic pointer switching.
6. Garbage-collect superseded versions only after confirming no active jobs or model runs reference them.

Do not wire `activate()` into the existing `ImportBundleService` until steps 1–4 are complete.
