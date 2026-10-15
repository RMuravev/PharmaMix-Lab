# Phase 36 — Scenario history UI

Added a workspace route at `/workspace#scenarios` backed by `CurrentScenarioResultService.listForProject`.

The page displays each saved scenario's freshness status (`fresh`, `stale`, `legacy`, `unverifiable`), dataset version, project, algorithm version, and creation time. It includes loading, retryable error, and empty states.

This is a read-only governance screen. It does not execute scenarios, recalculate results, or guarantee that legacy screens block stale outputs. Browser IndexedDB integration tests and production build remain to be run in an environment with project dependencies installed.
