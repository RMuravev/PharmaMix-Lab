# PharmaMix Lab: GitHub CI/CD

The `CI` workflow checks pull requests and pushes to `main` on Ubuntu 24.04 with Node 24 and Bun 1.4.3. Installation uses the committed `bun.lock` with `--frozen-lockfile`. The required job runs TypeScript, all Vitest unit/integration tests, Playwright Chromium scenarios, and the production build in sequence. No step permits failure; browser traces and an HTML report are uploaded on failure.

Reproduce from the repository root:

```bash
bun install --frozen-lockfile
bun run lint
bun run test
bunx --no-install playwright install --with-deps chromium
bun run test:e2e
bun run build
```

When a cloud machine already supplies Chromium, `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium bun run test:e2e` runs the same tests with that executable. Leave this variable unset in CI to use Playwright's pinned browser. Vitest's separate config selects unit/integration tests in `src`; Playwright owns the tests in `e2e`.

In GitHub Settings → Branches / Rulesets, require `TypeScript, Vitest, Playwright, Build` before merging into `main`. Repository permissions and plan determine whether enforcement is available. This PR does not change repository administration settings.

Keep automatic Vercel production deployments disabled until a deployment gate is configured. GitHub Actions by itself does not block a Vercel deployment triggered by a push. A future deployment task should use the existing Vercel project with Deployment Checks or a CI-controlled staged deployment and promotion after all checks pass. Store credentials in GitHub Secrets, never in source files. This workflow has no deploy step and needs no Vercel credentials.

For rollback, revert the repair PR, restore the corresponding lockfile, and rerun all checks before any deployment. The repair changes no IndexedDB schema or data migrations. Existing local browser data remains in that browser; take an export before a separate data-migration task.
