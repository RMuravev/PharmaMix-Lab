# Versioned publication — iteration 20

## Contract tightened

`VersionedDatasetPublisher.publish` now accepts a complete five-source snapshot. Each source must be present explicitly; an intentionally empty source must be represented by `[]`. This prevents an omitted source from silently becoming an empty source in the new active snapshot. Validation also rejects duplicate source IDs within a source and records whose `projectId` differs from the target project before opening IndexedDB.

## Rollback

`activateExistingVersion(projectId, datasetVersion)` switches the project pointer to an existing version in a single read-write transaction with version status updates and aggregate invalidation. It does not rewrite fact rows. The target version must belong to the project and cannot be `building` or `failed`.

## Important limitations

- This publisher is still an infrastructure service; existing legacy import UI/services have not all been wired to it.
- The app's legacy screens may still read legacy stores. They do not automatically become version-aware just because the pointer exists.
- A full snapshot should only be published after all source data has been normalized and validated.
- Browser IndexedDB is local to a browser profile/device. It does not provide cross-user synchronization.
- Automated tests in this iteration cover pre-transaction validation. Full IndexedDB integration tests, typecheck and production build must run in an environment with dependencies installed before calling this production-ready.

## Итерация 21 — обработка ошибок публикации

- `VersionedDatasetPublisher.publish()` сохраняет доменную ошибку, возникшую при подготовке транзакции, и возвращает её вызывающему коду после отката. Ранее такой сценарий мог выглядеть как малопонятный `AbortError`.
- Ошибки IndexedDB по-прежнему пробрасываются как исходная ошибка транзакции, если доменная причина не была зафиксирована.
- Проверки входного снимка остаются до открытия транзакции: все пять источников должны присутствовать явно; пустой источник допустим, если весь набор не пустой.

### Ограничение

Это улучшение диагностики отказов, а не доказательство сквозной атомарности всего приложения. Существующие импортеры и экраны ещё должны быть переведены на `VersionedDatasetPublisher` и `ActiveFactsRepository`.
