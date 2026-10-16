# PharmaMix Lab: instructions for coding agents

This file is mandatory guidance for every coding agent working in this repository. Read it before changing code, tests, schemas, analytical definitions, or deployment configuration. The repository is a browser-first React/Vite application with TypeScript application services, domain contracts, workers, and IndexedDB persistence.

## Source of truth and change discipline

- Start from the latest `origin/main`, create a focused `feature/` or `fix/` branch, and inspect the relevant services, tests, README, `docs/`, and `CODEX_HANDOFF_RU.md` when that file is present.
- Treat the current repository code and documented business rules as the primary source. Archives are recovery/comparison material only.
- Do not change application code, formulas, dependencies, schemas, or deployment settings in a documentation-only task.
- Never change analytical semantics solely to make a test pass. If a test conflicts with a documented business rule, correct the test or escalate the conflict explicitly.
- Never silently change a formula, aggregation level, join cardinality, zero/missing interpretation, treatment definition, attribution rule, or estimand.
- Keep unrelated working-tree changes intact. Do not use destructive reset/checkout commands without explicit authorization.

## Business data contract

The following grains and semantics are binding.

| Source | Grain | Measures / meaning |
| --- | --- | --- |
| Sales | year-month × federal district × federal subject/region × city × Nanobrick × pharmacy chain × brand × SKU | units and RUB sales; absent geographic levels remain absent |
| Promo | year-month × pharmacy chain × brand × SKU | investment % is the actually accrued bonus calculated from RUB sales of that SKU in that pharmacy chain; it is not a consumer discount; retain promo mechanic text |
| Medical Rep Visits | year-month × Nanobrick × brand | weighted visits for the supplied template; do not relabel Nanobrick as region |
| TV | year-month × brand | TRP |
| Market | year-month × addressable market × brand × optional SKU × region | units and RUB sales; preserve brand-level rows and `isOurBrand` without SKU fan-out |

Source availability is explicit: `LOADED`, `KNOWN_EMPTY`, or `NOT_PROVIDED`, with declared calendar coverage. Absence of a Promo row means zero promo exposure only inside declared Promo coverage for a `LOADED` or explicitly `KNOWN_EMPTY` source. `NOT_PROVIDED` means unknown/unavailable and must never become zero. The same coverage rule applies to Sales and Medical Rep Visits. A Promo row with `0%` means zero monetary promo impact; preserve campaign presence when a binary treatment indicator is required. A period with no Sales row may become an explicit zero-sales observation only when the declared panel calendar and unit scope contain that period.

Promo bonus is a RUB sales-based accrued amount. Do not relabel it as consumer discount, media spend, or an independently randomized treatment. A realized bonus can be endogenous to sales; causal designs should prefer a defensible treatment definition such as campaign presence or rate and must disclose the distinction.

### Join cardinality guardrails

Sales is the most detailed commercial grain. Promo is chain/brand/SKU/month, the supplied visits source is Nanobrick/brand/month, TV is brand/month, and market is market/brand/SKU-or-brand/region/month. A Nanobrick-to-region/city bridge must be explicit and governed before regional analytics may consume Visits. Joining any higher-level source to sales without an explicit allocation or aggregation rule can multiply its value. Never duplicate TV TRP across rows and then sum it, never duplicate visits across chains/SKUs and then sum them, and never count one promo bonus once per region when it was recorded once per chain/SKU/month. Aggregate to the intended estimand before joining, or use a non-additive feature with documented semantics. Add a cardinality/checksum test for every new join.

## Architecture boundaries

- **Data/infrastructure:** import parsing, normalization, IndexedDB repositories, schema/migrations, versioned snapshots, and browser persistence. Infrastructure owns storage mechanics; it must not contain business formulas.
- **Domain:** typed facts, shared value rules, and pure business concepts. Keep source grain and identifiers explicit.
- **Application:** query/orchestration services, panel construction, MMM, Promo Effectiveness, Causal Lift, Event Study, validation, and persistence contracts. Prefer deterministic pure functions and explicit inputs.
- **Presentation:** React pages, state, forms, tables, charts, and navigation. UI coordinates services and displays warnings; it must not duplicate business calculations or access IndexedDB directly when a query service exists.
- Heavy optimization/model work belongs in the existing worker boundary where applicable. Use cancellation/version guards for long-running work and do not claim worker support that is not implemented.

## Import and data quality

Use the existing normalizers and import pipeline for all five sources. Validate required identifiers, year-month format, non-negative finite measures, duplicate keys, source/project/version consistency, and explicit empty-source intent. Preserve source warnings and rejected-row diagnostics. Do not silently coerce malformed values to zero. A missing source row is zero exposure only within an explicitly declared unit/calendar panel; it does not invent an unobserved unit or silently expand a study universe.

## IndexedDB and browser-only constraints

IndexedDB is local to the browser profile/device, not a shared workspace or authentication layer. The supported runtime uses the current `PharmaMixLabCurrent` database and complete, versioned snapshot publication. The former database, legacy stores, migration adapters, and unversioned fallbacks are unsupported and must not be reintroduced. Preserve current transaction boundaries, indexes, active-version validation, and atomic writes. Read active facts through repositories/query services. Do not move browser-only persistence into server code or assume cross-device synchronization. Test current schema changes and rollback/error paths with `fake-indexeddb` or browser integration tests as appropriate.

Current production and test code must not import `src/App.tsx` or modules under `src/core`, `src/modules`, `src/types`, `src/ui`, `src/utils`, or `src/workers`. These paths remain only as physically retained cleanup candidates. Run `npm run check:architecture` after changing entrypoints, imports, test discovery, or build configuration.

## Aggregates and model results

Precomputed aggregates and model results must carry project identity, dataset version, algorithm version, definition/parameters, and creation time where their existing contract requires them. Reject stale or unverifiable results rather than presenting them as current. Preserve true zero effects; do not use zero to hide a missing or failed model result. Keep historical records auditable and distinguish them from the active dataset.

## Promo Effectiveness

Compute promo investment from the accrued bonus or the documented sales-based rate at Promo grain. Do not treat it as a consumer discount. Reconcile bonus totals against matched SKU/chain/month Sales and report unmatched or duplicate Promo rows. Separate campaign presence, rate, and realized RUB bonus as different exposures. A zero-rate row has zero monetary impact, while its presence may still define treatment. State endogeneity and attribution limits in outputs.

## MMM requirements

MMM work must document the target, unit of observation, source joins, adstock/carryover, Hill saturation, lags, seasonality, trend, controls, regularization, and multicollinearity handling. Fit transformations and scaling on training data only; preserve calendar order and out-of-sample boundaries. Do not sum non-additive TV or visit signals after a detailed join. Report conditional association/counterfactual status separately from causal claims. Statistical significance is not business significance; uncertainty, stability, practical effect size, and decision context must be considered.

## Causal Lift and Event Study

Causal Lift and Event Study are observational designs. Make treated/control definitions, exposure grain, treatment timing, eligibility, pre-period, post-period, and estimand explicit. Use zero Promo/Visits exposure according to the business contract, including valid control observations. Check pre-trends, placebo leads, staggered adoption, interference/spillovers, treatment contamination, and clustered uncertainty. Report confidence intervals and diagnostic limitations; a non-rejected pre-trend is not proof of parallel trends, and a CI or p-value is not proof of causality. Do not automatically calibrate MMM from a causal estimate without verified estimand and population alignment.

## Statistical validation

Validate assumptions, sample size, missing periods, duplicates, leverage/outliers, residual behavior, serial/cross-sectional dependence, uncertainty estimation, and sensitivity to reasonable specifications. Keep diagnostic status separate from methodological eligibility and from business significance. Never infer significance from point estimates, chart appearance, or a successful model run.

## Neural and other predictive models

Neural models remain predictive unless an identifying design is explicitly established. Preserve temporal train/validation/test separation, leakage checks, reproducibility, feature provenance, normalization boundaries, and baseline comparisons. Do not present predictive importance or counterfactual output as causal attribution.

## Dashboard and UX

Screens should show dataset/version freshness, source coverage, warnings, units, definitions, and limitations at the point of interpretation. Avoid hiding rejected rows or silently replacing missing/invalid data. Keep controls consistent with the selected grain and driver. Long-running work must remain cancellable and must not block the UI unnecessarily. Accessible labels, keyboard operation, readable tables, and useful empty/error states are part of correctness.

## Performance

Avoid quadratic joins and repeated full-table scans when a keyed map or indexed query is appropriate. Do not duplicate high-level signals to manufacture detail. Keep large calculations in workers when the existing architecture supports it, transfer only necessary data, and preserve cancellation/version guards. Measure before optimizing and do not trade away auditability or numerical correctness for speed.

## Testing and verification

Changes to calculation or data contracts require regression tests and synthetic known-answer tests, including zero exposure, zero sales, duplicate/cardinality, unmatched-source, stale-version, and boundary cases where relevant. Maintain meaningful integration tests for repositories and import flows.

The normal pre-PR checks are:

```bash
bun run lint
bun run test
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium bun run test:e2e
bun run build
```

For documentation-only PRs, heavy browser/model checks may be omitted when the diff proves no application code, dependency, lockfile, or build configuration changed. At minimum inspect `git diff --check`, the Markdown diff, and `git diff --name-only` to confirm scope. Never weaken, skip, or disable checks to obtain a green result.

## Git, PR, CI, and Vercel workflow

Work on a focused branch, commit coherent changes, push the branch, and open a Pull Request into `main`. Include behavior, scope, tests, risks, and any follow-up. Wait for CI and review; do not merge your own PR unless explicitly instructed. The repository CI runs TypeScript, Vitest, Playwright, and production build on PRs and pushes to `main`. Passing CI does not authorize a production deployment. Vercel Production may be deployed only after a separate explicit user command; preview checks and production promotion are distinct actions.

## Definition of Done

A change is done only when the documented behavior is implemented without semantic drift, affected tests and known-answer regressions pass, stale/version/cardinality risks are addressed, user-facing warnings and limitations are clear, and the focused PR is reviewable. For documentation-only work, the final diff contains only the intended Markdown/documentation files, application code and dependencies are unchanged, Markdown has no whitespace errors, CI policy is respected, and the PR is open for review but not merged or deployed.
