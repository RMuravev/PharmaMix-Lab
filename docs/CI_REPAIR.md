# CI repair — 15 October 2026

## Baseline and comparison

The source of truth was GitHub `main` at `eb810119e1411e4608526cbfb6816b5eedce55a2`. All 306 source archive entries in the user-supplied transfer package already matched that checkout byte for byte; no archive file needed restoration. In particular `src/pharma_engine.ts` exists in this revision. The supplied CI logs describe an earlier missing-module failure alongside the reproduced TypeScript failures.

## Fixes and analytical invariants

- Active snapshots retain a separate domain fact type per store. Reads still use one IndexedDB transaction and the same project/version filtering. Legacy loads infer row types from the store name rather than callers asserting types.
- Import previews preserve `csv-bundle` / `legacy-dump` metadata. Store initialization includes the detailed panel fields. A project without a published dataset shows an empty diagnostics registry rather than passing null as a version.
- Hill stability now filters month strings correctly, excluding holdout data from expanding training windows. A regression test checks the actual month lists passed to optimization.
- Executive Brief uses the actual connected, active page in its animation callback. Data-partition controls and previews are scoped to their page; React table roots are unmounted before its DOM is replaced. Applying uploaded data uses the existing recalculation pipeline.
- The Vite 5 / Vitest 5 peer conflict is repaired using Vite 8 and its matching React plugin. Bun, Vite, Vitest, Playwright and esbuild versions are pinned; the lockfile includes the browser-test and IndexedDB-test dependencies. No legacy-peer-deps workaround remains necessary.
- Vitest and Playwright have separate test discovery. All existing 72 unit/integration test files remain selected; browser tests fail on runtime and console errors.

Three original test failures were incorrect fixtures or expectations, not a reason to change model formulas:

1. For the supplied finite noisy series, closed-form OLS gives intercept `2.067307692307692` and slope `0.4900349650349651`. Assertions now check these values to ten decimal places rather than assuming the data-generating coefficients are recovered exactly.
2. The DiD fixture gives `(124 - 101) - (98 - 91) = 16`, not 17. Pre-period averages are also asserted.
3. Adstock with decay 0.5 requires 19 prior monthly observations before the weight drops below `1e-6`. The trajectory fixture now supplies observed zeroes over a complete 27-month history and asserts a nonempty result. A separate test verifies that insufficient history still fails; missing exposure is never silently filled with zero.

The sales-bonus definition, source coverage semantics, model formulas, separation of observational MMM from causal evidence, IndexedDB schema and migrations are unchanged. Regression checks cover zero-sales rows, missing sources, project/version isolation, import commit metadata, expanding training windows, browser navigation, CSV preview/re-entry, revenue after import, and an unpublished diagnostics registry.

## Validation and remaining scope

Local required checks: frozen-lockfile installation, TypeScript, 253 Vitest tests across 72 files, three Playwright Chromium scenarios, and production build. Cloud Playwright uses system Chromium through the documented executable override; the workflow downloads the browser matching its pinned Playwright version. CI results must be checked on the PR before merge.

The build still warns about the existing large main chunk and mixed static/dynamic imports of the chart renderer. Other analytical screens retain their existing limitations and demo content; this repair does not certify every model or convert demo recommendations into causal conclusions.

No production Vercel deployment, promotion, project relinking, or branch-protection administration is performed. Rollback and deployment gating are documented in `../CI-CD-SETUP.md`.
