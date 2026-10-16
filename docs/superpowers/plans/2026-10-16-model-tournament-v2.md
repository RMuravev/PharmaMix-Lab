# Model Tournament v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver a current-architecture, leakage-safe, provenance-bound Model Tournament with transparent recommendation and UI drill-down.

**Architecture:** Pure services define folds, candidates, metrics and evidence; a dedicated worker executes them; current IndexedDB model-run persistence stores reproducible results; a React page renders the workflow.

**Tech Stack:** TypeScript, React, Web Worker, IndexedDB, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-16-model-tournament-v2-design.md`

## Global constraints

- Preserve documented source grains, coverage-zero rules, accrued-bonus semantics, joins, MMM formulas, and causal limitations.
- Do not import retained legacy modules or restore the old database.
- Fit all learned state inside outer training folds and fail closed on stale/non-finite results.

## Review focus

- Calendar gaps/year boundaries produce deterministic folds without fabricated months.
- Inner tuning never consumes outer validation rows.
- Constant/zero targets yield defined nullable metrics rather than false precision.
- Failed or implausible candidates cannot become champion.
- Project/version changes invalidate worker and persisted results.

### Task 1: Evaluation core and candidate registry

**Files:** create `modelTournamentMetricsService.ts`, `modelTournamentCandidates.ts`, `modelTournamentService.ts` and colocated tests.

- [ ] Write failing known-answer tests for folds, metrics, baseline skill, regularized fits, registry support, ties, gates, instability, non-finite failures and deterministic output.
- [ ] Implement typed candidate adapters for seasonal naive, OLS, Ridge, Lasso and Elastic Net.
- [ ] Implement expanding evaluation, paired HAC loss evidence, validity diagnostics and transparent recommendation.
- [ ] Run focused and full Vitest.

### Task 2: Worker and persistence

**Files:** create `modelTournament.worker.ts`, `modelTournamentPersistenceService.ts` and tests; modify worker protocol and current schema indexes only if necessary.

- [ ] Write failing tests for stale version, project mismatch, atomic persistence, cancellation and obsolete messages.
- [ ] Implement deterministic progress/cancellation protocol and version-bound persistence.
- [ ] Run focused integration tests and architecture guard.

### Task 3: Current UI and E2E workflow

**Files:** create `ModelTournamentPage.tsx` and CSS; modify `WorkspaceApp.tsx`; extend `e2e/app.spec.ts`.

- [ ] Write UI/service regressions and an E2E workflow with a realistic snapshot and champion explanation.
- [ ] Implement configuration, states, leaderboard, fold/evidence drill-down, diagnostics, provenance and limitations.
- [ ] Verify project/version changes clear results and stop obsolete runs.

### Task 4: Delivery

- [ ] Run architecture guard, TypeScript, full Vitest, full Playwright, build and `git diff --check`.
- [ ] Document supported/deferred candidates, protocol, ranking rules, test evidence and risks.
- [ ] Commit, push, open a new PR, and report its actual HEAD and CI status without merging or deploying Production.
