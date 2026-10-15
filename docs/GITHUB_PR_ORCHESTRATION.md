# GitHub PR orchestration MVP

This repository contains a read-only Codex review workflow at `.github/workflows/codex-pr-review.yml`.

## Behavior

The workflow runs on `opened`, `ready_for_review`, and `synchronize` for trusted pull requests whose head repository is this repository. It is concurrency-safe per PR head SHA and cancels superseded runs. Bot-authored runs are excluded to prevent comment/commit loops. Fork pull requests are skipped because secrets are not exposed to fork workflows; a maintainer can review a fork manually or rerun an approved workflow after applying repository policy.

Codex checks only the PR diff and relevant surrounding code using `permission-profile: ":read-only"`. Repository and PR text are explicitly treated as untrusted data to reduce prompt-injection risk. The output must match `.github/codex-review-schema.json`, include `APPROVED`, `CHANGES_REQUIRED`, or `NEEDS_DECISION`, bounded severity findings, file/line locations, methodology notes, the exact head SHA, and `iteration: 0`. Invalid, missing, stale, or malformed output fails closed.

The workflow updates one marker-based PR comment and creates a commit-specific `Codex PR review` check. `APPROVED` succeeds; `CHANGES_REQUIRED` and `NEEDS_DECISION` fail the review job and require human action. Existing CI remains independent and required. This is a review gate, not a merge or deployment authorization. The enforcement schema is inline in the trusted workflow; the checked-in schema file is a reviewable reference and validator contract, never a runtime policy loaded from the PR checkout.

## Explicitly disabled corrective loop

The bounded corrective loop is design-only. `fix-stage-design` is disabled with `if: false`. No autonomous file edits, commits, pushes, merges, or deployments are possible in this MVP. Any future opt-in fix stage requires separate user authorization, security review, a trusted actor policy, a maximum of three iterations, per-commit checks, and explicit loop/idempotency protections.

## One-time setup

A repository administrator must add the GitHub Actions secret `OPENAI_API_KEY` at **Settings → Secrets and variables → Actions → New repository secret**. Do not put the key in YAML, PR text, source, artifacts, or logs. The action uses the key for the OpenAI Responses API; ChatGPT Plus does not include API billing or API quota. API usage is billed and governed separately by the OpenAI Platform account.

After adding the secret, open a same-repository PR or rerun the workflow from the Actions tab. If the secret is absent, the trusted-PR job fails closed with a configuration message and makes no API request. Fork PRs do not receive the secret by design.

## Permissions and pins

The workflow grants `contents: read`, `pull-requests: write`, and `checks: write` only to the trusted review job. Checkout, Codex Action, and GitHub Script are pinned to immutable commit SHAs corresponding to the documented releases. No `pull_request_target` is used, and checkout does not persist credentials. Production Vercel is not invoked.

The official `openai/codex-action@v1` documentation requires `OPENAI_API_KEY` (or an explicitly configured Azure endpoint), supports `output-schema`/`output-file`, and documents read-only permission profiles and write-access checks. This repository uses the read-only profile and the official v1 commit pin.
