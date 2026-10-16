# Current runtime and compilation boundary

PharmaMix Lab has one supported application: `src/main.tsx` renders `WorkspaceApp`. Production, TypeScript, Vitest, and Playwright operate only on the current layered architecture.

## Supported graph

- `src/app`: current application shell and routing
- `src/application`: orchestration, analytical services, and current contracts
- `src/domain`: source facts, business concepts, statistics, and pure analytical logic
- `src/infrastructure`: IndexedDB, imports, and current workers
- `src/pages`: current workspace pages
- `src/shared`: current reusable presentation utilities

The current application must have no dependency on `src/App.tsx`, `src/core`, `src/modules`, `src/types`, `src/ui`, `src/utils`, or `src/workers`. The `check:architecture` command uses the repository TypeScript compiler to resolve runtime and type-only imports, re-exports, configured path aliases, transitive edges, and TypeScript extension substitution across production, unit-test, and Playwright entries. Explicit source traversal adds Vite worker queries, dynamic imports, and `new URL(..., import.meta.url)` workers and fails closed on unresolved local edges. The production esbuild graph remains complementary bundle evidence. Executable positive and negative fixtures prove each boundary case, and CI runs the guard explicitly.

Reusable logic formerly reached through legacy modules has current ownership:

- OLS and VIF: `src/domain/statistics`
- CSV parsing: `src/infrastructure/import`
- marketing optimization worker: `src/infrastructure/workers`

## Retired compatibility

The old IndexedDB database and its compatibility stores, schema migration, unversioned fallback reads, per-source legacy publication, staging contracts, compatibility aliases, and the classic runtime entry are unsupported. `PharmaMixLabCurrent` starts at schema version 1 and accepts complete snapshot publication only.

Legacy source directories remain physically in the repository so isolation can be reviewed independently from bulk deletion. They are dead with respect to supported compilation and tests. A later cleanup PR may delete them after verifying that no historical material still needs to be retained.

## Semantic invariants

This boundary refactor does not change analytical formulas or estimands. Sales, Promo, and Visits missing-row zero semantics apply only within declared coverage. Promo percentage remains an accrued bonus on applicable chain/SKU RUB sales; campaign presence remains distinct from monetary impact. Source grains, fan-out protections, freshness checks, immutable causal-study identity, sandbox/atomic-save behavior, placebo logic, numerical guards, and report coherence remain in force.

## Verification scope

Use `npm run lint`, `npm test`, `npm run test:e2e`, and `npm run build`. `lint` includes both positive TypeScript entry configurations and the architecture boundary guard. Vitest discovers tests only in current architecture directories; Playwright exercises the current workspace and complete snapshot import path.
