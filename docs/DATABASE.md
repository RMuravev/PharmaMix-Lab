# Current browser database contract

The supported application uses IndexedDB database `PharmaMixLabCurrent`, schema version `1`. The former `PharmaMixLabDB_v3` database is neither opened nor migrated. Existing browser data in that database is left untouched but is outside the supported runtime; users publish a complete snapshot into the current database.

| Store | Purpose |
| --- | --- |
| `projects` | Local projects/workspaces |
| `datasetVersions` | Published dataset versions and the active-version pointer |
| `salesFacts`, `marketFacts`, `promoFacts`, `tvFacts`, `visitFacts` | Current versioned source facts |
| `dimensions`, `aggregates` | Normalized dimensions and versioned derived aggregates |
| `calculationJobs` | Calculation lifecycle state |
| `modelRuns`, `modelResults`, `scenarioResults` | Versioned model and scenario records |
| `analysisRegistry`, `eventStudyDiagnostics` | Versioned analytical and Event Study records |
| `appMeta` | Current application metadata |

The stores `sales`, `promos`, `tv`, `visits`, `market`, `meta`, `datasets`, `importBatches`, and `importStaging` are not part of the current schema. Current reads require an active `datasetVersions` entry and never fall back to unversioned or orphaned facts.

## Publication and transactions

- Publish all five sources as one complete versioned snapshot. An explicitly empty source is valid; omitting its intent is not.
- Activate a new dataset version in the same transaction as its complete fact set. Failed publication must leave the previous active version intact.
- Treat missing Sales, Promo, and Visits as zero only inside declared source coverage. Never manufacture observations outside that coverage.
- Keep campaign presence separate from monetary bonus. Promo investment is an accrued RUB-sales bonus, not a consumer discount.
- Resolve a write only after `transaction.oncomplete`; surface `onerror` and `onabort`.
- Do not use timers inside an unfinished IndexedDB transaction.
- IndexedDB is local to one browser profile/device and does not provide cross-device synchronization.

Schema changes apply only to `PharmaMixLabCurrent`. Do not add migration or fallback code for the retired database. Verify current schema changes with `fake-indexeddb` integration tests and Playwright where browser behavior matters.
