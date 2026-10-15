# Phase 28 — version-aware analytics summary

## Delivered

- Added `ActiveDatasetAnalyticsService`, a pure transformation from one consistent `ActiveDatasetSnapshot` to dashboard KPIs and source-coverage warnings.
- Added `ActiveDatasetDashboardQueryService` as a query entry point backed by `ActiveDatasetSnapshotRepository`.
- KPI summary covers sales units/revenue, market units/revenue, summed TV TRP, weighted visits, promo accrued-bonus estimate, and unmatched promo rows.
- Promo bonus is treated as an accrued sales bonus, not a consumer discount. The estimate matches period + pharmacy chain + brand + SKU and applies the percentage to matched sales revenue. Rows without a matching sales key are reported and excluded from the estimate.
- Hardened legacy reads in both the common snapshot repository and Overview: when no active pointer exists, rows with a non-legacy dataset version are excluded.

## Important limits

- This phase adds a reusable query entry point and pure summary logic; it does not replace every existing dashboard/model query.
- Summed TRP is a simple exposure total, not a reach/frequency estimate. Promo bonus is an estimate unless actual accrued bonus values are supplied and validated.
- Legacy records with a historical non-empty version but no active pointer are deliberately excluded to avoid mixing snapshots; a migration/recovery tool should classify such records before production rollout.
- Automated tests, TypeScript checks and production build must be run in an environment with dependencies installed before deployment.
