# PharmaMix Lab: GitHub CI/CD

1. Upload **contents** of this ZIP to the repository root, preserving `.github/workflows/ci.yml` and `bun.lock`.
2. Open GitHub Actions and inspect the `CI` workflow. It runs TypeScript, Vitest, Playwright Chromium, and Vite build.
3. In Settings > Branches / Rulesets, require status check `TypeScript, Vitest, Playwright, Build` for pull requests into `main`. Availability of ruleset enforcement depends on the GitHub plan and repository visibility.
4. Keep Vercel automatic production deployments **disabled** until a deployment gate is configured. GitHub Actions alone does not block Vercel deployments triggered by a push.
5. For strict deployment gating, use Vercel Deployment Checks or a CI-controlled staged deployment and promotion after tests pass; configure Vercel credentials in GitHub Secrets, never in the repo.

Note: This package adds a minimal smoke E2E test, not comprehensive functional coverage. Dependencies/tests were not executed in this environment. `bun.lock` is inherited from the source and should be refreshed after adding @playwright/test: run `bun install` locally and commit the resulting lockfile, then change CI to `bun install --frozen-lockfile`.
