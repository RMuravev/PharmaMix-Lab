# Статус рефакторинга PharmaMix Lab

## Реализованные архитектурные заготовки
- Слой IndexedDB с версионированием схемы и индексами для фактов.
- Staging импорта и контракт проверки снимка из пяти источников.
- `VersionedDatasetPublisher` для записи фактов под новой версией и переключения активного указателя в транзакции.
- `ActiveFactsRepository` для чтения фактов активной версии.
- Сервисы жизненного цикла публикации и возврата к сохранённой версии.

## Важные ограничения
- Старые импортеры и интерфейс ещё не полностью подключены к версионной публикации.
- Старые экраны/расчёты могут читать legacy-хранилища напрямую.
- Миграция существующих фактов без `datasetVersion` не завершена.
- Полная проверка `npm test`, `npm run lint` и `npm run build` в текущем окружении не выполнена: зависимости не установлены.

## Следующие обязательные действия
1. Единый интеграционный путь импорта всех пяти источников.
2. Миграция legacy-фактов с проверкой количества строк и контрольных сумм.
3. Перевод всех запросов, моделей и дашбордов на активную версию.
4. Интеграционные тесты с IndexedDB: ошибка публикации, rollback, reload и миграция старой БД.
5. Полный CI на установленном lockfile и закреплённой версии Node.js.


## Iteration 22 — legacy write guard

Added `legacyWriteGuard.ts` and checks in the five legacy import paths. Once a project has an active versioned snapshot, old per-source importers now fail closed instead of mutating facts behind the active-version pointer. This is a safety measure, not complete UI integration; see `PHASE22_LEGACY_IMPORT_GUARD.md`. Full tests and build have not been run in this environment because dependencies are not installed.

## Phase 23 — versioned snapshot pipeline

Added a pure `VersionedSnapshotBuilder` for sales, market, promo, TV and visits, plus `UnifiedImportService.importSnapshot()` to normalize the full snapshot before calling the versioned publisher. Per-source issues and counts are retained for preview/review. The existing single-source UI is not yet wired to this method, and old analytics readers are not yet fully migrated; do not describe the application as fully atomic until those integrations and browser-level tests are complete.

## Iteration 24 — full snapshot import UI
- Added an isolated `/workspace#snapshot-import` screen for uploading all five CSV sources, previewing normalization issues, explicitly marking intentionally empty sources, and publishing through `UnifiedImportService.importSnapshot`.
- The old single-source sales import remains labelled as legacy; it is not silently presented as the new versioned flow.
- First snapshot publication now creates the local project record if it does not yet exist.
- The versioned snapshot is a full replacement, not a merge. The screen explains that unchanged source data must be included again and that an explicitly empty source will be published empty.
- Analytics screens are not yet all migrated to `ActiveFactsRepository`; end-to-end app migration and full test/build verification remain outstanding.


## Phase 25 — Overview version-aware reads

`OverviewQueryService` now reads the active version pointer and matching sales facts in one readonly IndexedDB transaction. Legacy fallback is allowed only when no active version pointer exists. The result includes `dataVersion` and `legacyData`. Other analytical screens are not yet fully migrated.

### Phase 27 follow-up

- Fixed legacy behavior in `ActiveDatasetSnapshotRepository`: absent active pointer now reads project-scoped rows from all five fact stores and explicitly returns `legacy: true`, `datasetVersion: null`.
- Versioned projects continue to read only the rows matching the active version.
- See `PHASE27_LEGACY_SNAPSHOT_FIX.md`.

## Phase 28 update

Added a version-aware dashboard query service and pure cross-source KPI summary based on a single active dataset snapshot. Legacy read paths now filter out versioned facts when no active pointer exists, preventing accidental mixing of orphaned snapshots. This remains a partial migration: existing analytics pages and model runners still require individual integration.

## Phase 29 update
A new `/workspace#analytics` page now consumes `ActiveDatasetDashboardQueryService` and displays headline metrics, source row counts, and data-quality warnings from one consistent snapshot. This is a connected analytics entry point, not a claim that all legacy dashboards/models have been migrated. See `docs/PHASE29_ACTIVE_ANALYTICS_UI.md`.

## Phase 30 — защита свежести результатов моделей

Добавлен `ModelRunFreshnessService`, который сопоставляет `modelRuns.datasetVersion` с `projects.activeDatasetVersion`, группирует результаты по запуску и возвращает явный статус свежести. Добавлены тесты классификатора и индексы версии для modelResults/scenarioResults; версия IndexedDB повышена до 6. Guard ещё не интегрирован во все legacy-экраны/исполнители моделей — см. `PHASE30_MODEL_FRESHNESS_GUARD.md`. Полная сборка и тестовый прогон не подтверждены из-за отсутствующих установленных зависимостей.

## Итерация 31 — экран актуальности запусков моделей

- Добавлен экран `Модели и актуальность` (`/workspace#models`), использующий `ModelRunFreshnessService`.
- Показываются сохранённые запуски, версия данных, количество результатов и статус `fresh` / `stale` / `legacy` / `unverifiable`.
- Отдельно отмечается расхождение версии результата с версией запуска.
- Ограничение: экран мониторинга не блокирует устаревшие результаты в старых страницах и не создаёт записи запусков. До полного подключения расчётных сценариев статусы отражают только существующие записи в IndexedDB.
- Проверка сборки и тестов зависит от установки npm-зависимостей; отсутствие `node_modules` означает, что успешная сборка в этой среде не подтверждена.

## Итерация 32 — сохранение запусков с привязкой к версии

Добавлен `ModelRunPersistenceService`: запись запуска и всех результатов выполняется одной read-write транзакцией IndexedDB, версия активного набора данных фиксируется в каждой записи, вместе с версией алгоритма и параметрами. Поддерживается optimistic guard `expectedDatasetVersion`: если версия данных изменилась после старта расчёта, запись отменяется, а вызывающей стороне предлагается перезапустить расчёт. Это готовая точка подключения для новых исполнителей моделей, но существующие legacy-исполнители пока не переведены на неё. См. `PHASE32_MODEL_RUN_PERSISTENCE.md`.

## Phase 33 — guarded current model result access

Added `CurrentModelResultService` as an opt-in safe read path. It reads the project active-version pointer, run metadata, and results in one readonly IndexedDB transaction, rejecting stale/legacy/unverifiable runs, empty results, cross-project runs, and result rows with inconsistent versions. Existing legacy screens still need to be migrated to use this guard; see `PHASE33_CURRENT_MODEL_RESULT_GUARD.md`.

## Phase 34 — scenario freshness guard

Added `CurrentScenarioResultService` for safe reads of scenario results against the active dataset version, plus freshness-history classification and unit tests. This is an opt-in safe path; existing scenario screens and writers still require migration. Automated test/build status remains unverified in the current dependency-free environment.

## Итерация 35 — сохранение результатов сценариев

Добавлен `ScenarioResultPersistenceService` с атомарной записью сценарного результата и обязательной optimistic-проверкой `expectedDatasetVersion`. Результат сохраняется с версией данных, версией алгоритма и параметрами; смена активной версии во время расчёта приводит к отмене транзакции. Добавлены unit-тесты политики версий. Старые сценарные исполнители ещё должны быть подключены к сервису, а интеграционные тесты с реальным IndexedDB и полный npm CI остаются обязательными.

## Итерация 36 — экран истории сценариев
- Добавлен экран `/workspace#scenarios` с историей результатов сценариев и статусами свежести относительно активной версии набора данных.
- Экран показывает число сценариев, актуальные/устаревшие/непроверяемые записи, версию набора данных, проект и версию алгоритма.
- Добавлены состояния загрузки, ошибки и пустой истории; данные читаются через `CurrentScenarioResultService`.
- Ограничение: экран не запускает сценарии и не делает устаревшие результаты автоматически недоступными в legacy UI. Интеграционные тесты реального IndexedDB требуют браузерного окружения или `fake-indexeddb`; выполнение тестов и сборки в текущем окружении не подтверждено.

## Итерация 37 — описательная диагностика регрессионных прогнозов

Добавлен `regressionDiagnosticsService`: MAE, RMSE, MAPE с явным исключением нулевого факта, WAPE, R² и скорректированный R² с защитой от вырожденных выборок. Сервис возвращает предупреждения, если метрика математически не определена. Добавлены unit-тесты на обычный случай, нулевые значения, постоянный факт и некорректные входы.

Ограничение: сервис пока не подключён к существующему экрану MMM и не оценивает статистическую значимость коэффициентов. Значимость нельзя корректно вывести только из факта/прогноза — нужны стандартные ошибки, ковариационная матрица и степени свободы конкретной модели.

## Итерация 38 — сравнение моделей на общей тестовой выборке

Добавлен `modelComparisonService`. Перед сравнением он проверяет уникальность идентификаторов моделей, наличие общего `testWindowId` и полное совпадение упорядоченного вектора фактических значений. Это не позволяет ранжировать модели по разным периодам или разным наборам наблюдений. Для каждой модели рассчитываются MAE, RMSE, MAPE, WAPE, R² и скорректированный R² через общий сервис диагностики. Основной критерий ранжирования — меньший WAPE; если WAPE не определён, используется RMSE. Добавлены тесты на корректное ранжирование, несовпадение окон и факта, нулевой факт и повторяющиеся ID.

**Ограничение:** сервис пока не подключён к существующему экрану MMM и не создаёт тестовое окно самостоятельно. Вызывающий код должен передать прогнозы и фактические значения, полученные на одном и том же отложенном временном интервале. Это описательная оценка прогноза, а не тест статистической значимости коэффициентов.

## Итерация 39 — интеграция диагностики в OOS-валидацию

- Экран временной валидации теперь использует `compareModelsOnSameTestWindow` для сравнения доступных OOS-моделей.
- В сравнение попадают только строки, для которых фактическое значение и прогнозы всех сравниваемых моделей конечны. Это исключает ситуацию, когда разные модели ранжируются на разных наборах наблюдений.
- Таблица показывает MAE, RMSE, WAPE, MAPE и R²; ранжирование идёт по WAPE с fallback на RMSE, если WAPE неопределён.
- Сравнение привязано к текущему набору тестовых месяцев. Оно не заменяет повторный запуск валидации и не доказывает причинность маркетинговых эффектов.
- UI-интеграция добавлена, но автоматическая сборка и тесты в этом окружении не подтверждены: зависимости `node_modules` отсутствуют.

## Итерация 40 — базовая OLS-диагностика коэффициентов

Добавлен `calculateOlsInference`: оценки коэффициентов OLS, остаточная дисперсия, стандартные ошибки, t-статистики, доверительные интервалы и пороговая оценка значимости для выбранного уровня 90/95/99%. Матрица `XᵀX` инвертируется с частичным выбором ведущего элемента; вырожденные матрицы и недостаток степеней свободы возвращают предупреждения вместо вывода о значимости.

Ограничения: это классическая OLS-инференция при предположениях независимых гомоскедастичных ошибок; для временных рядов нужны проверки автокорреляции и, возможно, HAC/Newey–West. Сервис не подключён к старому MMM-движку и не доказывает причинность. P-value не рассчитывается; `significantAtLevel` основан на табличном критическом t-значении с консервативным выбором ближайшей меньшей степени свободы.


## Итерация 41 — таблица диагностики коэффициентов в MMM UI

На экране модели добавлена таблица коэффициентов: β, классическая SE, robust SE, robust t-статистика, robust p-value, индикатор p < 0,05 и 95% классический OLS-доверительный интервал. Значения берутся из результата текущего OLS-движка (`REG.fit.m`), а имена факторов — из спецификации модели. В таблице явно указано, что robust-ошибки не являются HAC/Newey–West, а интервалы остаются классическими OLS.

Ограничения: это диагностическое представление, не доказательство причинности. Robust p-value зависит от реализации ковариационной оценки в текущем движке; временная автокорреляция может оставаться проблемой. UI использует HTML-таблицу внутри существующего блока инсайтов. Сборка и тесты не запускались, поскольку зависимости проекта не установлены в рабочем окружении.

## Итерация 42 — HAC/Newey–West

Добавлен независимый сервис `calculateNeweyWest` для оценки HAC-ковариационной матрицы OLS-оценок с ядром Bartlett. На вход подаются матрица регрессоров в хронологическом порядке и остатки уже оценённой модели; сервис возвращает ковариационную матрицу и стандартные ошибки. Реализована проверка формы данных, конечности значений, диапазона лага и вырожденности `XᵀX`; конечновыборочная поправка включена по умолчанию.

Ограничения: сервис пока не подключён к действующему движку MMM и сам не оценивает коэффициенты. Не реализованы p-value/доверительные интервалы на основе HAC-ошибок. Пользователь обязан подавать строки в правильном временном порядке; пропуски периодов и панельные данные требуют отдельной обработки. Тесты добавлены, но в текущем окружении не запускались, поскольку зависимости проекта не установлены.

## Итерация 44 — контроль пригодности временных рядов

Добавлен `validateTimeSeries` для предварительной проверки месячных данных MMM. Сервис обнаруживает некорректные периоды, пропущенные месяцы, повторяющиеся месяцы, нечисловой факт/прогноз, короткие ряды и случаи, когда несколько панельных групп переданы как одна последовательность. Возвращает структурированный отчёт с уровнями серьёзности, затронутыми строками и рекомендациями.

Это data-quality gate, а не статистический тест: сервис не заполняет пропуски автоматически, не доказывает причинность и не выполняет HAC-инференцию. Панельные данные следует валидировать по каждой серии и только затем строить регрессионную матрицу. Добавлены unit-тесты на пропуски/дубликаты, некорректные значения, смешанные группы и корректный ряд. Выполнение тестов и production-сборки не подтверждено: зависимости в рабочем окружении не установлены.

## Итерация 45 — подключение контроля временного ряда к OOS-валидации

Экран временной валидации MMM теперь запускает `validateTimeSeries` для агрегированной по брендам месячной последовательности факта и первого доступного модельного прогноза. Отчёт показывает диапазон месяцев, критические ошибки, предупреждения и рекомендации. При критических ошибках качества временного ряда таблица ранжирования моделей скрывается, чтобы не поощрять интерпретацию метрик на некорректных периодах. Пропуски месяцев остаются предупреждением: они не заполняются автоматически и сами по себе не блокируют сравнение.

Ограничение: это проверка агрегированного общего ряда на экране OOS, а не полноценная проверка каждой панели «бренд × регион × сеть». Она не предотвращает первоначальный расчёт OOS-моделей, поскольку выполняется при отображении результатов; для строгого preflight gate вызов следует перенести в `runOOSValidation` до обучения. Тесты и production-сборка не запускались в текущем окружении, поскольку зависимости не установлены.

## Итерация 46 — проверка полноты OOS-окна до интерпретации метрик

Усилен `validateTimeSeries`: теперь сервис принимает `expectedPeriods` и проверяет, что фактический набор месячных наблюдений полностью совпадает с ожидаемым тестовым окном. Пропуск ожидаемого месяца, наличие периода вне окна, некорректный или повторяющийся период в спецификации holdout становятся критическими ошибками. Экран OOS-валидации передаёт `VAL.testM` в эту проверку, поэтому сравнение моделей блокируется при неполном или несогласованном тестовом окне.

Это закрывает конкретный риск: диапазон дат мог выглядеть непрерывным или валидным, даже если в нём отсутствовал месяц, который должен был присутствовать в OOS-окне. Сервис всё ещё проверяет агрегированный месячный итог для экрана сравнения, а не каждый SKU/бренд/регион как самостоятельную панель; HAC-инференция по панельным данным не добавлена. Тесты добавлены, но запуск тестов и сборки не подтверждён из-за отсутствия установленных зависимостей.

## Итерация 48 — панельная проверка на экране OOS

`renderVal` теперь передаёт OOS-строки с идентификатором бренда в `validatePanelTimeSeries` и проверяет непрерывность/полноту ожидаемого тестового окна отдельно для каждой серии. Критические ошибки любой серии блокируют таблицу сравнения моделей. Если данные не содержат стабильных идентификаторов групп, используется агрегированный fallback. Проверка не выполняет импутацию пропусков.

Ограничения: OOS-движок пока предоставляет `brand × month`, а не `brand × region × pharmacy chain`; поэтому это ещё не полная проверка всех уровней панели. Наличие пропуска в бренд-месяце нужно трактовать с учётом правил формирования источника продаж. Автотесты и production-сборка не подтверждены из-за отсутствия установленных зависимостей.

### Phase 49 — OOS preflight
- `runOOSValidation` checks the raw panel before model fitting for invalid/nonpositive sales, duplicate brand-months, and missing brand-months in the test window.
- No implicit zero imputation; test cases added. Existing data pipeline may need explicit aggregation upstream when multiple records share a brand-month.
- This is brand-level protection, not region/chain-level panel validation.

### Итерация 50 — подготовка детализированных панелей продаж
- `panelSalesPreparationService.ts`: группировка SKU в бренд × регион × сеть × месяц, без смешения панелей.
- Проверка дублированных SKU, неотрицательных конечных продаж, полноты каждого тестового окна и опционального требования `salesRub > 0` для log-MMM.
- Отсутствующие месяцы не превращаются в нулевые продажи; при повторе SKU сумма не удваивается.
- Добавлены unit-тесты `panelSalesPreparationService.test.ts`.
- **Ограничение:** старый `PanelRecord` не содержит регион/сеть; сервис пока не встроен в старый `runOOSValidation`. Нельзя считать, что детализированная MMM или панельный HAC уже работают.

### Iteration 51 — granular panel bridge
- `DerivedStructures.detailedPanel` now preserves observed brand × region × chain × month sales from normalized SKU records; `panel` remains unchanged for legacy MMM.
- `PanelRecord` has optional region/chain dimensions for forward compatibility.
- OOS explicitly rejects granular input until promo/TV/visits/market features are aligned at that grain; no invented zero covariates.
- Added adapter and tests. **This is not a granular MMM model implementation.**

### Phase 52 — panel source alignment
- Added pure `panelSourceAlignmentService.ts` and focused tests.
- Aligns five source families to sales panels while preserving distinct source grains.
- Allocates chain/SKU promo bonus across regions using actual SKU sales, preventing repeated accruals.
- Broadcast TV/visits/market signals are explicitly non-additive across lower-grain panels.
- Market metrics require an addressable-market filter before interpreting market share.
- This service is a staging building block, **not yet connected** to the legacy MMM executor.

### Итерация 53
Добавлен `panelDesignMatrixService`: каузальное лагирование TV (бренд/месяц), визитов (бренд/регион/месяц) и промобонуса (бренд/регион/сеть/месяц). Пропущенные месяцы не сжимаются; отсутствующие сигналы остаются null. Добавлены тесты. Пока сервис не подключён к старому движку MMM; OOS-разделение и антиутечка при обучении требуют отдельной интеграции.

### Итерация 54: временное разделение и train-only нормализация
- `temporalModelDatasetService.ts`: проверяет уникальность `бренд × регион × сеть × месяц`, положительность выручки и полноту выбранных факторов; делит выборку строго по календарному тестовому окну.
- Средние и стандартные отклонения вычисляются **только на обучающих наблюдениях** и затем применяются к тестовым; константные факторы сопровождаются предупреждением.
- Тесты покрывают утечку нормализации, дубли, пропуски факторов, будущие периоды и несколько панелей.
- **Ограничение:** это подготовка данных, а не подключение к старому обучающему MMM. Обучение, подбор параметров и OOS-оценка на этих структурах требуют следующей интеграции. Пустые месяцы не создаются автоматически.

### Итерация 55 — обучение OLS/Ridge на временном разбиении
- `temporalMmmTrainingService.ts`: отдельный сервис обучения OLS и Ridge на подготовленном train, с прогнозом и метриками на test в рублях.
- Ridge не штрафует intercept; при вырожденной OLS-матрице расчёт прекращается с ошибкой.
- Отдельно предупреждаем, что `exp` прогноза лог-выручки без smearing correction не оценивает условное среднее без смещения.
- Тесты в `temporalMmmTrainingService.test.ts`; интеграция с прежним UI и автоматический подбор lambda пока не выполнены.

### Iteration 56 — inner temporal Ridge CV
- `temporalRidgeTuningService.ts`: expanding-window folds on outer train only; fold-local predictor normalization, pooled validation WAPE selection, final outer-test evaluation.
- The current input may have already been normalized on the full outer train; inner fold scaling is refit on each fold. Feature selection and lag tuning still require nesting inside CV.
- This is an application service, not yet wired into the legacy MMM UI. Build/test status is not asserted without installed dependencies.

### Итерация 60 — насыщение Hill (подготовительный модуль)
- Добавлен `marketingSaturationService.ts`: численно устойчивое преобразование Hill для неотрицательных воздействий и детерминированный выбор параметров по готовым train-only CV оценкам.
- Добавлены unit-тесты для EC50, монотонности, экстремальных значений и валидации.
- **Не интегрировано:** совместный поиск Hill с лагами, adstock и Ridge; Web Worker; экран MMM. Не следует считать этот модуль готовым автоматическим оптимизатором насыщения.

### Phase 61 — sequential Hill CV integration
- `marketingHillCvService.ts`: per-driver Hill EC50/slope coordinate search, after lag/adstock; train-only calendar folds and identical observation identities per candidate.
- `TemporalMmmComparisonPage.tsx`: one-click sequential lag/adstock/Ridge then Hill optimization, with selected parameters and CV diagnostics shown.
- Limitations: not a global joint optimization; UI thread may be blocked on large datasets; production build and automated tests require installed dependencies.

Iteration 62: moved lag/adstock/Hill optimization and transformed dataset preparation to a dedicated module Web Worker. Added phase progress and cancellation (worker termination). Progress percentages are stage indicators, not measured candidate progress. Pending: performance benchmarks, worker integration tests, full build, candidate-level progress.

### Phase 64 — sensitivity of optimized carryover parameters
Added `marketingParameterStabilityService.ts`: repeats train-only carryover optimization on progressively longer historical windows and reports lag/decay variation per driver, with warnings for insufficient history. The stability criterion is heuristic (constant lag and decay range <= 0.2), not a significance test. Hill parameter stability and UI wiring remain outstanding.

### Phase 68 — observational causal-lift foundation
- Added `quasiExperimentalLiftService.ts`: a balanced-common-month, two-period Difference-in-Differences descriptive estimator for treated/control units, with explicit non-randomization warnings.
- Added tests for numerical lift, duplicates, missing controls, and missing pre-periods.
- **Not an A/B test**: no randomization, propensity matching, pretrend inference, staggered-adoption estimators, clustered SEs, or integration into the MMM UI yet. Avoid causal claims without identifying assumptions.
