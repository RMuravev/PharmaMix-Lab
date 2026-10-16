# Staged Data Import Workspace design

## Goal and boundary

The current browser application imports the user's BOM/semicolon Russian CSV templates through a durable workspace. Parsing, mapping, canonical validation, staging and publication are separate boundaries. Upload never mutates active facts. Publication assembles exactly the staged facts plus explicit source statuses and atomically creates one active dataset version.

## Canonical templates

Built-in versioned profiles cover Sales, Market, Visits and TV exactly. Year and month columns form `YYYY-MM`; decimal commas become numbers. Sales preserves federal district, federal subject, city and Nanobrick separately. Visits uses Nanobrick as its authoritative geography. Market preserves `isOurBrand`; blank SKU creates a `grainLevel: brand` row and is never expanded to SKUs.

Profiles are typed and stored after confirmation. The UI shows required/optional fields and provides a raw-column dropdown, including an ignored/unmapped choice, for every canonical field and each part of the period transformation. Confirmed profiles are reused when the same header signature returns. Profile identifiers and versions are retained on every batch; unmatched schemas start visibly incomplete rather than falling back to normalizer aliases.

## Staging, overlap and quality

Each file becomes an IndexedDB `ImportBatch` with filename, profile, fingerprint, counts, issues, canonical facts, coverage and timestamp. Multiple files per source survive reload. Overlap is explicit: cancel, replace all existing batches touching the incoming source periods, or append only non-overlapping periods. Duplicate canonical grains are rejected within a file and again across assembled batches.

Quality views show counts, period membership, dimensions, canonical preview and source-row errors. Malformed, negative or non-finite measures never become zero.

## Availability and publication

Every source is `LOADED`, `KNOWN_EMPTY`, or `NOT_PROVIDED`, with coverage when evidence exists. The current workflow publishes Promo as `NOT_PROVIDED`. Previously active facts are never carried forward implicitly. The current atomic publisher stores availability metadata with `datasetVersions`, writes all facts, switches the project pointer and stales aggregates in one transaction.

Active snapshots expose the metadata. Promo-dependent MMM/Model Tournament and Promo causal studies fail closed for `NOT_PROVIDED`; a deliberately excluded Promo feature may run only when the model configuration omits it. TV is never backfilled before its loaded periods.

## Performance and limitations

Files are parsed one at a time and only canonical facts are persisted; React retains only the current preview. IndexedDB stores each batch, avoiding one combined raw dataset in component state. Parsing is currently per-file in memory; streaming/chunked parsing and a parsing worker are deferred for files whose measured size causes UI blocking. Browser storage remains device/profile-local.
