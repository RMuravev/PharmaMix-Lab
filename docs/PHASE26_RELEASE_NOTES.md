# PharmaMix Lab v3.2 — phase 26

- Added `ActiveDatasetSnapshotRepository` for consistent reads of all five fact stores from the active dataset version.
- Added explicit per-source row counts, including intentionally empty sources.
- Legacy projects are marked explicitly and are not silently mixed with versioned facts.
- Added repository contract tests and integration-status documentation.

Validation note: archive integrity is checked. Full tests, TypeScript validation, and production build have not been confirmed because dependencies are not installed in the working environment.
