# Implementation Plan - PharmaMix Lab Architectural Hardening & Documentation

## Overview
Implement all architectural improvements requested in the audit report, including the new documentation suite:
1. LocalStorage state persistence and auto-save in `core/store.ts`.
2. Incremental rendering & memoization in `renderAdapter.ts`.
3. Centralized `Logger` singleton for error logging and monitoring.
4. Calculation caching & memoization for AutoML tournament and OOS validation.
5. IndexedDB schema versioning and migration support.
6. Async operation manager to prevent race conditions on rapid clicks.
7. Numerical stability guards (`safeExp`, `safeLog`, EPSILON bounds) in math utilities.
8. Debounce / rate limiting on input events and slider/dropdown changes.
9. **Comprehensive Documentation Suite (`docs/`)**: Architecture, Modules, Data Types, API, and Setup instructions.

---

## Proposed Changes

### 1. State Persistence & Auto-Save (`src/core/store.ts`)
- Add `STORAGE_KEY` and `AUTO_SAVE_INTERVAL` (30s).
- Implement `loadFromStorage()` and `saveToStorage()` with serialization / deserialization helpers for Sets/Maps.

### 2. Render Optimization (`src/ui/renderAdapter.ts`)
- Memoize page data selections and avoid full DOM re-renders unless data/state actually changes.
- Add `AsyncOperationManager` to serialize heavy asynchronous button clicks and prevent race conditions.
- Add debounce handlers for high-frequency input and select change events.

### 3. Monitoring & Logger (`src/services/monitoring.ts`)
- Enhance `Logger` singleton with timestamps, log levels (`info`, `warn`, `error`), context tracking, and error metrics.

### 4. MMM & AutoML Calculation Caching (`src/modules/mmm-engine/automlEngine.ts`)
- Implement `memoizeAutoML` to cache brand tournament results when the panel dataset reference is unchanged.

### 5. IndexedDB Schema Migrations (`src/modules/browser-db/browserDB.ts`)
- Add schema versioning (`DB_VERSION = 3`) and `migrate()` method to handle schema upgrades safely.

### 6. Numerical Stability (`src/utils/math.ts`)
- Add `safeExp(x)` and `safeLog(x)` with `EPSILON` and `MAX_VALUE` bounds to prevent NaN / Infinity errors in matrix inversions and log-gamma computations.

### 7. Documentation Suite (`docs/`)
- Create `docs/ARCHITECTURE.md`: Overall system architecture, data flow, Web Worker isolation.
- Create `docs/MODULES.md`: Detailed description of MMM engine, Causal inference, Promo optimization, and Data ingestion.
- Create `docs/DATA_TYPES.md`: Schema definitions for PanelRecord, OLSResult, GeoABExperimentResult.
- Create `docs/API.md`: Function signatures and parameters across modules.
- Create `docs/SETUP.md`: Installation, dev server, and deployment guidelines.

---

## Verification Plan

1. **Build & Compile**: Run `compile_applet` to verify TypeScript compilation and Vite build success.
2. **Linting**: Run `lint_applet` (`tsc --noEmit`) to verify strict type correctness.
3. **Documentation Check**: Verify that `docs/` Markdown files are created and complete.
