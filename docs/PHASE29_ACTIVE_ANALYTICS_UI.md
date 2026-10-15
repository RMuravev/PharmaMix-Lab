# Phase 29 — active analytics dashboard UI

## Delivered
- Added a dedicated `ActiveAnalyticsDashboardPage` backed by `ActiveDatasetDashboardQueryService`.
- Added workspace route `/workspace#analytics` and sidebar navigation.
- Exposed headline metrics for pharmacy sales, market sales, estimated accrued promo bonus, summed TV TRP and weighted visits.
- Exposed per-source row counts and repository warnings so absent data is visible rather than silently interpreted as zero.
- Added focused unit tests for cross-source metric calculation and unmatched promo rows.

## Metric semantics
- Promo rate is treated as an accrued bonus rate, not as a consumer discount. The calculated value is an estimate (`rate × matched sales revenue`) and must not be presented as an accounting-confirmed accrued amount.
- TRP is summed across supplied rows. It is not unique reach or audience size.
- Source totals are simple sums for the currently selected active snapshot; there are no filters or causal-effect estimates on this page yet.

## Verification status
The archive is structurally checked. Test execution, TypeScript checks and production build are not claimed unless run in an environment with installed dependencies.

## Remaining integration work
- Migrate other existing dashboards and model-run entry points to version-aware repository/query services.
- Add real IndexedDB integration tests for publish/rollback/read consistency.
- Reconcile legacy rows with missing datasetVersion before broad rollout.
