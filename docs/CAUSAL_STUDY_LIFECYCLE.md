# Causal study identity, freshness and sample diagnostics

## Sources and result eligibility

`CausalStudySource` distinguishes two sources:

- `active`: immutable originating project, published dataset version, brand and grain.
- `uploaded`: validated declared unit/calendar panel belonging to the current local project context, without a verifiable dataset version.

Both sources can calculate matched DiD and staggered Event Study. Uploaded results are sandbox estimates: reliability remains `insufficient`/`unverifiable`, automatic project persistence is disabled, and automatic MMM calibration remains blocked. Uploading data never manufactures an active version.

For active studies, calculation checks the live project/version before and after synchronous estimation. Population changes invalidate preparation. Parameters and study revision form a calculation key used by **both** matched and Event Study display, chart and reliability consumers. Results with a different key or unverified/stale source are hidden. Returning to another selection cannot relabel a persisted population; automatic saves use the immutable source identity.

`CausalStudySession` revision tokens discard obsolete preparation, deferred calculation, verification and save completions. The metadata-only poller serializes reads, schedules the next read after completion, rejects superseded contexts and stops on cleanup. Failed reads revoke verification. Existing output is revalidated approximately once per second after each completed read; this is a bounded polling delay, not an instantaneous cross-tab publication subscription. Calculation and persistence do not rely on the last poll alone.

## Persistence boundary

Automatic saves pass a current-operation guard to the existing repositories. The project pointer is read and the result written in **one readwrite IndexedDB transaction containing `projects` and the result store**. A stale dataset or obsolete operation aborts the write. Publication cannot interleave between pointer verification and commit. Existing explicit historical/manual repository writes remain supported; historical records are not rewritten or deleted.

Current-version checks do not establish causal identification. No formulas, treatment definitions, source joins or zero-fill rules are changed by this lifecycle contract.

## Estimator-specific sample diagnostics

Matched DiD exposes a descriptive pair count and availability. Its matching algorithm does not reuse controls, but that is **not proof of statistical independence**.

Event Study exposes `eventStudySupport: unknown` (or `not-run`) independently of whether a matched estimate exists. Each event-time record retains treated count, minimum eligible controls across contributing cohorts, and cohort count. These are descriptive support counts; they must never be added or combined across event times into a universal independent ESS. Not-yet-treated controls can be shared across cohorts; the present estimator does not define independent influence/cluster weights from which a defensible universal ESS follows. A future estimator-specific measure would require an explicit dependence/weighting definition and validation, not a relabeling of these counts.

## Regression evidence

- `causalStudySessionService.test.ts`: obsolete context/project work, failed live verification, uploaded sandbox allowance, delayed reads, nonoverlapping polling and unmount cleanup.
- `database.integration.test.ts`: active pointer metadata reads and atomic rejection of stale/cancelled matched and diagnostic writes; successful guarded writes.
- `causal-lifecycle.spec.ts`: actual production page upload through both estimators, parameter switches, malformed upload, no sandbox writes, v1→v2 then stale recomputation, brand/grain/project changes, verification errors and obsolete preparation/deferred calculation.
- `staggeredEventStudyDiagnosticsService.test.ts`: A first treated in May, B in July, C/D never treated. C/D support both cohorts; B additionally supports A before July. Exact event-time ATT is zero, treated count is 2, minimum controls is 2, cohorts is 2. The generated report feeds the reliability summary with and without a matched estimate; Event Study support stays unknown.
- `causalReliabilitySummaryService.test.ts`: neither, matched-only, Event Study-only and mixed estimator inputs keep support and warnings separate.

## Remaining methodological limits

Observational confounding, endogenous realized promo bonus, anticipation, spillovers and cross-unit dependence remain. Bootstrap intervals and non-rejected pretrends do not prove parallel trends or causal identification. The current distinct-group bootstrap is not a validated global independent-unit covariance estimator for partially overlapping groups. Spatial uncertainty, formal power analysis, and a universal Event Study ESS are not delivered here.
