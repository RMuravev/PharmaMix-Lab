# Phase 22 — guard against legacy writes to versioned projects

## Why

The existing per-source normalizers replace facts independently and do not publish a complete snapshot. Once a project has `activeDatasetVersion`, allowing these writers to run can make the old import path and the versioned read path disagree, and may damage historical facts used for rollback.

## Change

- Added `assertLegacyWriteAllowed(projectId)`.
- Sales, market, promo, TV and visit normalization services check the project pointer before using the legacy per-source write path.
- Projects without an active version retain the previous import behavior.
- Projects with an active version fail closed with an actionable error directing callers to full-snapshot versioned publication.

## Limitation

This is a defensive compatibility guard, not the final integration. The check is a separate readonly transaction, so concurrent legacy import and version activation are not serialized by a shared transaction. The production integration must remove the old write path or make the guard and writes transactionally coordinated. The versioned publisher is not yet wired into the UI import flow.

## Required next steps

1. Add pure prepare/normalize methods for all five source types.
2. Compose their outputs into a complete `VersionedDatasetInput`.
3. Publish the full snapshot through `VersionedDatasetPublisher`.
4. Switch the UI and calculations to `ActiveFactsRepository`.
5. Add browser IndexedDB integration tests for publish, rollback, concurrent import, and migration.
