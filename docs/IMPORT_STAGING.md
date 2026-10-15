# Import staging — iteration 16

## Purpose

`ImportStagingService` stores a prepared multi-source import bundle separately from published facts. Rows are keyed by batch/source/row and can be reviewed before `publish(batchId)`.

## Lifecycle

`preview -> stage -> staged -> publishing -> published | partially-published | failed`

A `batchId` is an immutable idempotency key. `stage` refuses to overwrite any existing batch, preventing a retry from silently replacing a published or in-flight batch. Use a new `batchId` for a new attempt.

Status changes are guarded by allowed source states in a read-write transaction. Only a batch in `staged` can transition to `publishing`; final status is set only from `publishing`. This limits duplicate concurrent publication attempts, although the service is not a distributed lock across different browser profiles.

`discard(batchId)` refuses batches that are published, partially published, or currently publishing. Failed batches may be removed, but a failed/partial publication result must be inspected before cleanup.

## Consistency boundary

This implementation does **not** promise cross-source atomic publication. The bundle publisher commits each source in its own IndexedDB transaction. A later-source failure can leave earlier sources published. The explicit `partially-published` status preserves that distinction; `failed` means the publisher reported no completed source, not that the batch is guaranteed to have had no side effects in every possible runtime failure.

## Storage and migration

IndexedDB schema version is 3 and includes `importStaging`, indexed by `batchId`, `projectId`, and `sourceType`. Existing stores are retained. Staging uses one record per row to avoid putting a large CSV bundle into a single IndexedDB value.

## Operational notes

- Large imports are currently written in one transaction and should be benchmarked on target browsers.
- No automatic TTL cleanup is enabled.
- Quota failures should be surfaced to the user; staging failure must not mutate published facts.
- True cross-source atomicity still requires version-aware facts and reads: prepare all normalized facts under an unpublished dataset version, validate required aggregates, and atomically switch the project's active version pointer. Until every reader filters by the active version, a pointer alone is not sufficient and must not be treated as implemented.
