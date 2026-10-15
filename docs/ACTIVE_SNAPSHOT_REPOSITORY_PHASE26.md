# Phase 26 — active dataset snapshot repository

## Added

`ActiveDatasetSnapshotRepository` reads the project's `activeDatasetVersion` pointer and all five versioned fact stores (`salesFacts`, `marketFacts`, `promoFacts`, `tvFacts`, `visitFacts`) inside one IndexedDB readonly transaction. This provides a single consistency boundary for downstream analytics queries and returns row counts per source, including zero-row sources.

## Compatibility behavior

When no active pointer exists, the repository returns `legacy: true` and `datasetVersion: null` with empty versioned collections. It deliberately does **not** merge legacy stores into the versioned snapshot. Callers must explicitly route legacy projects through their existing legacy query path until a dedicated migration has been completed.

## Integration status

This repository is a shared read primitive, not proof that every page or model has been migrated. Overview currently has its own version-aware sales query; market, promo, TV, visit, model, and scenario consumers still require explicit integration. Do not remove legacy paths until migration and equivalence tests are in place.

## Verification

Added contract tests for the five-source row-count shape and the distinction between versioned and legacy snapshots. Full Vitest, TypeScript, and Vite build checks require installing the project dependencies and were not confirmed in this environment.
