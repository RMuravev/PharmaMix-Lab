# Import bundles (iteration 13)

`ImportBundleService` coordinates the preview and ordered publication of multiple source files for one project. It checks project selection, empty source lists, empty row arrays, unknown source names, and duplicate source types before starting writes.

## Important consistency guarantee

This implementation provides **per-source atomicity only**. It does not promise all-or-nothing publication for a bundle. Each existing source normalizer owns its IndexedDB transaction; if a later source fails, previously committed sources remain committed. The result uses `status: 'partial'` and lists `completedSources` and `failedSource` so the UI can communicate this accurately.

Do not label this workflow “atomic bundle import” in the UI. True bundle atomicity requires staging all normalized records first, validating the complete staging set, then publishing all target stores and dataset versions in one IndexedDB transaction (subject to browser transaction limits). Large datasets may need a generation-pointer/snapshot strategy instead of one oversized transaction.

## API

- `preview(request)` returns source counts, total rows, validation errors, and a reusable `batchId`.
- `commit(request)` validates before writing and then processes sources in request order.
- Result `status` is `completed`, `partial`, or `failed`; `atomicity` is explicitly `per-source-only`.

## Next engineering step

Implement a real staging store and a publication-generation pointer, add quota-failure and reload recovery integration tests in a browser, then migrate the import UI to this service. Until then, use the partial-result report to avoid hiding already committed sources.
