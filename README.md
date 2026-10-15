# PharmaMix Lab

Браузерное приложение для анализа аптечных продаж, промоэффективности, адресного рынка и маркетинг-микса.

## Запуск локально

Требуются Node.js 24 и Bun 1.4.3 (версия закреплена в `packageManager`).

```bash
bun install --frozen-lockfile
bun run dev
```

Обязательные проверки (Vitest запускает unit/integration, Playwright — браузерные сценарии):

```bash
bun run lint
bun run test
bunx --no-install playwright install --with-deps chromium
bun run test:e2e
bun run build
```

В облачной среде с установленным системным Chromium можно выполнить браузерные тесты через `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium bun run test:e2e`. CI использует штатный Chromium закреплённой версии Playwright. Настройка CI и ограничения публикации описаны в `CI-CD-SETUP.md`; причины исправлений — в `docs/CI_REPAIR.md`.

## Текущее состояние архитектурного рефакторинга

Рефакторинг выполняется поэтапно. На первом этапе добавлен целевой каркас слоёв, IndexedDB schema v2, совместимый legacy-адаптер с исправленными транзакциями, контракты репозиториев, базовый сервис агрегатов, протокол/клиент Web Worker и дизайн-токены. Существующие UI-страницы и расчётные модули сохранены; они будут переноситься по одной после регрессионной проверки.

Документы:

- `docs/ARCHITECTURE.md` — слои и направление зависимостей.
- `docs/DATABASE.md` — схема IndexedDB и правила хранения.
- `docs/ENGINEERING_GUIDELINES.md` — обязательные правила разработки.
- `docs/REFACTORING_STATUS.md` — выполненное, ограничения и следующие этапы.

## Важно о пользователях и хранении

IndexedDB хранит данные локально в профиле браузера. Эта версия не синхронизирует данные между устройствами и не предоставляет общую базу для разных пользователей. Для совместной работы потребуется backend или отдельный синхронизационный сервис.

## Промо-метрика

В доменной модели `bonusRatePct` отражает бонус, фактически начисляемый за продажи, а не скидку покупателю. Механика промо хранится отдельным текстовым атрибутом.

## Iteration 13 — coordinated multi-source import

Added `ImportBundleService` for preflight validation and ordered import of multiple source files. It detects empty bundles, duplicate source types, empty sources and missing project selection before writes. Partial publication is surfaced explicitly: cross-source atomicity is **not** claimed until staging and generation-based publication are implemented. See `docs/IMPORT_BUNDLES.md`.

## Architecture update — iteration 33

Added `CurrentModelResultService` as an opt-in guarded read path for model outputs. It rejects stale or unverifiable runs and version-inconsistent result rows. See `docs/PHASE33_CURRENT_MODEL_RESULT_GUARD.md`. Existing legacy screens still require migration to this service.

### Итерация 37

Добавлен независимый сервис диагностических метрик регрессии (`src/application/services/regressionDiagnosticsService.ts`) и unit-тесты. Метрики включают MAE, RMSE, MAPE, WAPE, R² и скорректированный R². MAPE исключает наблюдения с нулевым фактом и возвращает счётчик исключений; неопределённые метрики представлены как `null` с предупреждениями, а не маскируются фиктивными числами.

Сервис пока не подключён к существующим моделям/экранам; тесты и production-сборка должны быть выполнены в окружении с установленными зависимостями.

Добавлен сервис честного сравнения моделей `src/application/services/modelComparisonService.ts`. Он допускает сравнение только на одном `testWindowId` и идентичном упорядоченном векторе факта, рассчитывает общие диагностические метрики и ранжирует модели по WAPE (при неопределённом WAPE — по RMSE). Это отдельный application-сервис; существующий интерфейс MMM пока не подключён к нему автоматически.

### Диагностика коэффициентов OLS

В application-слое доступен `calculateOlsInference` для оценок коэффициентов, стандартных ошибок, доверительных интервалов и предварительной проверки значимости. Это отдельный чистый сервис; он пока не заменяет регрессионный движок MMM. Для временных рядов классические стандартные ошибки могут быть неверны при автокорреляции или гетероскедастичности.

### Диагностика временных рядов

В `src/application/services/neweyWestService.ts` доступна отдельная функция HAC/Newey–West для оценки робастной ковариационной матрицы регрессионных коэффициентов по матрице регрессоров и остаткам. Это сервисный компонент, пока не подключённый к действующему расчётному движку MMM. Перед интерпретацией результата необходимо обеспечить хронологический порядок наблюдений и корректно обработать пропущенные периоды.

### Итерация 43 — HAC-инференция коэффициентов

Добавлен `src/application/services/hacInferenceService.ts`: сервис оценивает коэффициенты OLS и строит доверительные интервалы на основе HAC/Newey–West стандартных ошибок. Он использует заданный максимальный лаг и опциональную конечновыборочную поправку. Строки матрицы должны быть заранее отсортированы по времени и представлять равномерно расположенные наблюдения; пропуски месяцев и панельные группы нужно обработать до вызова.

Сервис не выдаёт p-value: для HAC-оценок не следует представлять простое t-приближение как точное маловыборочное распределение. Интервалы используют табличное t-приближение и сопровождаются предупреждением. Это application-сервис; действующий регрессионный движок MMM и UI пока не переведены на него. Автотесты добавлены, но должны быть запущены в окружении с установленными зависимостями.

### Итерация 44 — проверка временных рядов

Добавлен `src/application/services/timeSeriesValidationService.ts` — чистый сервис предварительной проверки месячных рядов MMM. Он сообщает о некорректных периодах, пропущенных/повторяющихся месяцах, нечисловых значениях, коротких рядах и смешении панельных групп, возвращая машинно-читаемые коды ошибок/предупреждений и рекомендации. Сервис пока не подключён автоматически к legacy-экрану MMM; его следует вызывать до расчёта регрессии. Тесты и сборка не запускались в текущем окружении из-за отсутствия установленных зависимостей.

### Итерация 45 — контроль качества OOS

Экран временной валидации теперь показывает диагностику агрегированного месячного ряда и скрывает сравнение моделей при критических ошибках периода или значений. Предупреждения о пропущенных месяцах не заполняются автоматически. Это UI-level guard, а не блокировка самого обучения: строгую проверку до запуска моделей необходимо интегрировать в OOS executor.

### Итерация 46 — OOS-окно

Контроль временного ряда на экране OOS теперь сверяет наблюдаемые месяцы с ожидаемым списком `VAL.testM`. Пропущенные месяцы holdout и периоды вне тестового окна считаются критическими ошибками и блокируют интерпретацию сравнения моделей. См. `docs/REFACTORING_STATUS.md`.

### Panel time-series validation (phase 47)

`src/application/services/panelTimeSeriesValidationService.ts` validates monthly data separately by a stable group key, so missing periods in one brand/region series cannot be hidden by another series. See `docs/PANEL_TIME_SERIES_VALIDATION_PHASE47.md` for the current integration boundary and limitations.

### Panel time-series validation (phase 47)

`src/application/services/panelTimeSeriesValidationService.ts` validates monthly data separately by a stable group key, so missing periods in one brand/region series cannot be hidden by another series. See `docs/PANEL_TIME_SERIES_VALIDATION_PHASE47.md` for the current integration boundary and limitations.

### Итерация 48 — панельная проверка в OOS UI

Экран OOS теперь использует `validatePanelTimeSeries`, если результат содержит идентификаторы брендов. Проверка выполняется отдельно по каждой серии «бренд × месяц» и сопоставляет каждый бренд с ожидаемым `VAL.testM`; пропуск месяца у отдельного бренда не маскируется наличием этого месяца у других брендов. При критических ошибках сравнение моделей блокируется. Если идентификаторы серий отсутствуют, используется прежняя проверка агрегированного ряда.

Ограничение: текущий OOS-движок формирует панель по бренду и месяцу; регионы и аптечные сети в этой проверке не разделяются, если их нет в `VAL.preds`. Из-за фильтра исходных строк по положительным продажам отсутствие бренд-месяца требует бизнес-проверки: оно может означать как неполные данные, так и отсутствие записи/продаж. Тесты и production-сборка в этом окружении не подтверждены.

### Iteration 57 — Temporal MMM comparison (beta)

`/workspace#mmm-compare` accepts an exported `TemporalDatasetResult` JSON and compares OLS and temporally tuned Ridge on identical held-out observations. The outer OOS period is not used in Ridge hyperparameter selection. This beta page is **not yet connected to the active IndexedDB design-matrix pipeline**; JSON is a deliberate explicit boundary. Feature/lag selection must still be nested within CV. See `temporalModelComparisonService.ts` and its tests.

### Iteration 58 — MMM from active IndexedDB snapshot
`/workspace#mmm-compare` now accepts a project ID and can load the transaction-consistent active five-source snapshot, align sources, build lag-aware panels, and split train/OOS by calendar month. Missing signals are not silently zero-imputed. The JSON import path remains available. This is a beta bridge, not a production-ready panel causal estimator; the default lag is zero, and market denominators need explicit addressable-market selection before use.

### Iteration 59 — automated lag and adstock selection

The MMM comparison page includes **Подобрать лаги и adstock (CV)**. It performs joint
expanding-window CV on pre-OOS months for three independently parameterized drivers:
TV TRP (brand), weighted visits (brand/region), and estimated promo bonus
(brand/region/chain). Each uses a calendar lag and geometric adstock decay.
The default bounded grid uses lags [0,1], decays [0,0.5], Ridge lambdas from the UI.
A fixed intersection of eligible training observations is used across candidates.
Missing history is not imputed as zero; early rows without complete carryover
history are excluded. OOS is reserved for final model evaluation. This is a
bounded first-pass grid search, not a guarantee of global optimum; adstock decay
is not a causal effect estimate. The optimizer is synchronous and can take time
on large browser datasets. All driver transformations are applied before the
train/test split using only present and past months.

#### Итерация 60
Добавлен изолированный сервис Hill saturation (`src/application/services/marketingSaturationService.ts`) и unit-тесты. Это подготовка к будущей интеграции в train-only CV; автоматический подбор Hill и Web Worker пока не подключены.

Phase 61: the MMM comparison screen supports sequential train-only CV optimization of lag/adstock/Ridge followed by driver-specific Hill saturation (EC50/slope). It is not a globally joint optimizer. Large calculations still execute on the UI thread.

### Iteration 62 — background MMM optimization
The temporal MMM comparison page runs carryover and Hill CV in a module Web Worker (`src/workers/marketingOptimization.worker.ts`) after the IndexedDB snapshot has been read. The page displays coarse phase-based progress (not per-candidate completion) and offers cancellation by terminating the worker. The external OOS window remains excluded from parameter search. The ordinary comparison button remains synchronous. Full test/build verification requires installed dependencies.

### Iteration 63 — candidate-level progress
Carryover and Hill optimizers now report completed/total CV evaluations to the Web Worker, which forwards throttled carryover progress and Hill progress to the MMM comparison screen. Percentage is weighted by optimization stage (55% carryover, 35% Hill, 10% matrix), not elapsed time. Parameter stability across rolling windows remains pending. Full build/tests not confirmed.

Phase 64: `assessMarketingParameterStability` performs train-only expanding-history sensitivity checks for lag/adstock parameters. It is not yet wired to the MMM UI; Hill stability is not covered.

### Итерация 65
Добавлена проверка устойчивости Hill EC50 и slope по расширяющимся обучающим окнам.
Запускается отдельной кнопкой на экране сравнения MMM в Web Worker, с прогрессом и отменой.
Критерии устойчивости эвристические; успешная сборка и запуск тестов требуют установки зависимостей.

### Iteration 66 — stability of business outputs

Added `marketingBusinessStabilityService.ts` and tests. It compares **already computed** driver counterfactual revenue estimates across model training windows, checks sign consistency and relative ranges, and reports ROI only where explicit investment RUB is supplied. It does not generate counterfactuals, refit models, or connect to the UI yet. These are descriptive association-based diagnostics, not causal attribution. Do not use estimated promo bonuses as independently confirmed expenditure without reconciliation.

### Итерация 67 — модельные контрфактические эффекты

`marketingCounterfactualService.ts` рассчитывает разницу прогнозов с воздействием и без одного выбранного драйвера на одной и той же тестовой выборке, без переобучения. Учитывается масштабирование по train-параметрам; подразумевается, что входные факторы уже прошли лагирование, Adstock и Hill. При ненулевой истории adstock контрфактическую траекторию необходимо пересчитать от исходного воздействия: простое обнуление готового признака — только условная диагностика. ROI не рассчитывается без подтверждённых расходов. Модуль пока не подключён к UI/автоматическому переобучению окон.

Phase 68: `quasiExperimentalLiftService` adds a standalone observational Difference-in-Differences lift estimate for cities/regions without visits or chains without promo as potential controls. This is not randomized A/B; treatment assignment, pre-trends and confounders require separate checks. Not yet wired into the UI.

### Итерация 69 — подбор контролей для Causal Lift

Добавлен `src/application/services/causalControlMatchingService.ts`: подбор контрольных единиц без повторного использования по уровню продаж и предтренду, исключительно по месяцам до воздействия. **Контракт промо:** отсутствие строки в полной выгрузке промо означает подтверждённое нулевое промо, а не пропуск. Отсутствующие строки продаж никогда не заменяются нулём. Требуется минимум 3 месяца до воздействия (по умолчанию 4); есть диагностические предупреждения и тесты. Подбор остаётся наблюдательным и не доказывает причинность. Сервис пока не подключён к UI или расчёту DiD; последующая интеграция должна учитывать единицы «сеть × регион × бренд × SKU» и календарь начала воздействия.


## Итерация 70: нулевые наблюдения и Causal Lift

Бизнес-контракт: отсутствие записи о продажах, визитах или промо означает ноль **внутри известного охвата выгрузки**. Для `matchCausalControls` добавлены `calendar` и `eligibleUnits`; пропущенные месяцы/единицы восстанавливаются как нули, а записи вне заявленного охвата отклоняются. Для `estimateDifferenceInDifferences` добавлены те же параметры; полностью отсутствующая единица без явного назначения группы отклоняется, поскольку её статус воздействия невозможно вывести из отсутствия продаж. Это наблюдательная оценка, не рандомизированный A/B-тест. Наличие нулевых визитов не исключает территорию из контроля.

Текущий этап не включает автоматическую кластерно-робастную неопределённость, проверку параллельных трендов или интеграцию экрана.

### Итерация 71: единая семантика нулей для sales / visits / promo

Добавлен `src/application/services/completeExposurePanelService.ts`: детерминированное
формирование полной панели по **явно заданным** `eligibleUnits` и `calendar`.
Отсутствующие записи о продажах, визитах и промо внутри этого охвата трактуются
как фактические нули; отсутствующие поля в частично заполненных строках — тоже.
Сервис проверяет дубликаты, границы охвата, значения и максимальный размер панели.
Перед вызовом источники необходимо агрегировать к общей единице наблюдения.
Это самостоятельный сервис с тестами, **пока не встроенный в импорт, MMM и UI**.

### Итерация 72: сквозная оценка matched DiD

`src/application/services/causalLiftPipelineService.ts` объединяет полную панель, pre-treatment matching и DiD по парам для визитов или промо. Результат: средний месячный uplift на обработанную единицу, относительный uplift, помесячный разрыв предтрендов и воспроизводимый pair-cluster bootstrap percentile CI (если >=2 пар). Не рандомизированный эксперимент; matching не учитывает все возможные конфаундеры. Нули интерпретируются внутри явно заданного охвата. Сервис пока не подключён к UI и автоматическому импорту; необходимы агрегация источников к единице анализа и проверка одновременных воздействий.

### Phase 73 — Causal Lift workspace
- Route `/workspace#causal-lift`: load a scoped study JSON (`eligibleUnits`, `calendar`, `rows`), choose promo/visits and units/rubles, run matched DiD, inspect estimated lift, pair-bootstrap interval, matched controls, pretrend diagnostics, and group time series.
- The page **does not yet load raw active IndexedDB facts automatically**: sales/promo/visits have incompatible grains and require explicit scope and defensible aggregation to avoid duplicating visits or promo. MMM comparison/calibration is not yet implemented.
- The analysis is observational, not a randomized A/B experiment. Bootstrap intervals are approximate and ignore matching uncertainty and spatial dependence. Processing currently occurs on the main thread; large studies should use a worker in a future phase.

### Iteration 74 — active snapshot to Causal Lift

The Causal Lift page now loads a transaction-consistent published IndexedDB snapshot, filters by brand and builds one of two separate study grains: chain × brand for promo and region × brand for medical visits. Sales are aggregated across SKU at the chosen grain; promo bonus is computed once per chain/SKU/month (using actual accrued amount when provided); visits are summed across cities but never duplicated by chain or SKU. Explicit eligible units are anchored in sales history and missing unit-month records are completed as true zeros. The user still chooses a common treatment start. **Caveat:** accrued bonus is a function of sales, so treatment classification using its positive amount can be endogenous; a treatment-indicator/rate-based design is needed before making strong causal claims. Automated build and tests were not run in this environment.

### Phase 75 — факт промо и неодновременные старты
- В исследовании по сетям воздействие `promoActive=1` определяется **наличием записи промо**, даже если фактический бонус равен нулю. `promoBonusRub` сохраняется отдельно как зависимая от продаж величина инвестиций; для идентификации воздействия её использовать не рекомендуется.
- В matched DiD введён консервативный режим `requireStartMonthExposure`: поздние запуски после выбранного общего месяца исключаются из анализа, а не ошибочно включаются в единую группу воздействия. Полноценный staggered DiD (когортные ATT) ещё не реализован.
- Отсутствие строк продаж, визитов и промо означает ноль **внутри установленного охвата**.
- Ограничение: исследование агрегирует промо до уровня сети/бренда; если промо затрагивает только часть SKU, индикатор означает наличие любого промо в сети/бренде. Возможны интерференция, смещение отбора и другие параллельные воздействия.

### Итерация 76 — staggered cohort-time DiD

Добавлен `src/application/services/staggeredCausalLiftService.ts` и тесты.
Оценка ATT(g,t) по первому месяцу промо или визитов с использованием только
никогда не подвергавшихся воздействию либо ещё не подвергавшихся воздействию
контролей на дату t. Используется базовый месяц g−1, поэтому первая когорта
без предыстории не оценивается. Эффекты агрегируются по времени после запуска
с весами по числу единиц в когорте. Отсутствующие записи внутри объявленного
охвата трактуются как нули. Это **не** полноценный Callaway–Sant'Anna estimator:
нет ковариатной корректировки, matching, кластерных интервалов, формального
event-study pretrend и корректировки на динамическое выключение воздействия.
Сервис пока не подключён к UI и IndexedDB.

### Итерация 77: диагностический event-study

Добавлен `src/application/services/staggeredEventStudyService.ts`: динамика когортного DiD по относительному месяцу запуска, placebo-leads (опорный месяц `g-1` исключён), воспроизводимые 95% percentile bootstrap-интервалы с повторной выборкой единиц и предупреждения о предпосылках. `pretrendPassed` намеренно равен `null`: без масштабо-инвариантного критерия и корректной кластерной дисперсии нельзя объявлять предтренды прошедшими проверку. Это **диагностический сервис**, пока не подключён к экрану Causal Lift и не является реализацией Callaway–Sant'Anna. Bootstrap не учитывает пространственные spillovers и неопределённость выбора контрольных групп. Приложение не следует считать полностью проверенным без запуска тестов и сборки.

### Итерация 78 — Event Study в Causal Lift

Страница `/workspace#causal-lift` теперь содержит отдельный запуск staggered Event Study по факту промо или визитам, параметры окна до/после первого воздействия, график точечных оценок ATT с приближёнными 95% bootstrap-интервалами, таблицу результатов по event-time и предупреждения о предтрендах. Расчёт использует подготовленный JSON либо данные активного проекта после их загрузки. Текущая реализация выполняется в основном потоке и не является полноценным doubly-robust DiD; совместный тест предтрендов и кластерная пространственная коррекция отсутствуют.

### Phase 79 — Causal Lift / MMM reconciliation contract

Added `src/application/services/causalMmmReconciliationService.ts` with explicit comparable-effect contracts and unit tests. It refuses comparisons unless driver, outcome unit, population key, period boundaries and unit-month count match. It reports absolute and relative differences, sign disagreements and whether the MMM point estimate lies within the **approximate** Causal Lift interval. This is **not** an inferential test of agreement, automatic calibration, or causal identification. For promo, the driver is `promoActive` (campaign presence), not `promoBonusRub` (endogenous realized spend). The new service is not yet connected to the UI or automatic estimand alignment. Tests/build have not been executed in this environment.


### Итерация 80 — строгая сверка охвата MMM / Causal Lift

Добавлен `causalMmmPopulationAlignmentService.ts` с обязательным явным набором единиц, полным календарём и проверкой совпадения ключей `unitId × month`. Суммируются только заранее рассчитанные инкрементальные эффекты на одинаковой шкале. Отсутствующие **оценки эффекта** не заполняются нулём (в отличие от отсутствующих фактических продаж, визитов и промо внутри известного охвата). Запрещены дубликаты, строки вне охвата, неполные месяцы, нечисловые эффекты и слишком большие панели. CI передаётся только в шкале агрегированного эффекта. Добавлены шесть тестов.

Ограничение: модуль является проверяемым адаптером для подготовленных unit-month эффектов; существующие MMM и Causal Lift ещё не производят автоматически совместимые unit-month эффекты. В UI не подключён. Сверка метаданных не обеспечивает равенство estimand и не оправдывает автоматическую калибровку.

### Итерация 81 — мост когортного ATT и MMM
Добавлен `src/application/services/causalMmmAttBridgeService.ts` и unit-тесты. Сервис преобразует ATT(g,t) в суммарную оценку по **фактически обработанным** единицам-месяцам и сопоставляет её с предоставленными оценками MMM для тех же ключей. Не добавляет фиктивные нули для контрольных единиц и отклоняет неполный/избыточный MMM-охват. Когортный ATT одинаково распределяется между единицами соответствующей когорты только для целей агрегирования; индивидуальные эффекты не идентифицированы. Это API-слой для подготовленных unit-month MMM эффектов: автоматическая генерация MMM-эффектов, UI и калибровка пока не подключены.

### Iteration 82 — MMM full-trajectory counterfactuals

`src/application/services/marketingTrajectoryCounterfactualService.ts` computes driver-specific
monthly panel predictions using fixed fitted coefficients. It zeroes the **entire raw historical
exposure** of the selected driver and recalculates lag, adstock and Hill transformations,
retaining other exposures and optional train-only feature scaling. This service is not yet wired
to the UI or ATT reconciliation pipeline. Missing prehistory is not silently imputed; eligible
rows can be excluded by carryover continuity requirements. No causal identification is claimed.

### Итерация 83: траектории MMM → ATT

Добавлен `src/application/services/causalMmmTrajectoryBridgeService.ts`. Сервис пересчитывает полную историю лагов, Adstock и Hill для контрфактического отключения драйвера и сопоставляет помесячные эффекты MMM только с идентифицируемыми обработанными unit-month из Staggered DiD. Требует явной функции сопоставления MMM-панелей с единицами Causal Lift; неоднозначное many-to-one сопоставление отклоняется вместо скрытой агрегации. Поддерживается только выручка в рублях, поскольку текущая MMM обучена на выручке. Сервис пока не подключён к UI; оценка не является автоматической причинной калибровкой. Для промо факт проведения и сумма начисленного бонуса представляют разные определения воздействия.


### Итерация 84 — экран согласованности MMM и Causal Lift
Добавлен `/workspace#causal-mmm`: импорт сопоставимых агрегированных оценок JSON, проверка охвата и интервенции через `causalMmmReconciliationService`, таблица расхождений и предупреждений. Автоматическое получение оценок из обученных моделей и Causal Lift пока не подключено; калибровка не выполняется.

### Итерация 85 — локальный реестр результатов

Добавлен IndexedDB `analysisRegistry` (версия схемы 7), сохраняющий сравнимые агрегированные оценки MMM/Causal Lift с projectId, datasetVersion, algorithmVersion, определением воздействия, временем расчёта и охватом. На странице `#causal-mmm` исправлен отсутствовавший в исходной версии 84 компонент и реализован ручной импорт оценок JSON, просмотр реестра и сопоставление только результатов одной версии данных и определения воздействия. Сервис не считает автоматически актуальность по активной версии, не сохраняет результаты расчётных модулей автоматически и не подтверждает причинную идентификацию. Для реальной автоматизации потребуется подключить производителей результатов к реестру.

### Iteration 86 — auto-save matched Causal Lift
- After matched DiD on a versioned active dataset, the Causal Lift page automatically writes an auditable `causal` record to IndexedDB `analysisRegistry`.
- Export aggregates the per-treated-unit-per-month lift and its bootstrap CI to a total over the matched treated units and post months; `populationKey` records the exact sorted unit/month universe.
- JSON imports, promo-bonus intensity and Event Study are not auto-saved. MMM estimates are not auto-saved because comparable unit-month causal counterfactual totals are not yet wired.
- Reconciliation UI shows and compares only records matching the active published dataset version. It never automatically calibrates MMM.
- Unit tests and production build have not been run in this environment.

### Итерация 87 — безопасный экспорт MMM в реестр

Добавлен `mmmRegistryExportService.ts` для преобразования **уже рассчитанных** помесячных MMM-контрфактических эффектов в запись `analysisRegistry`, строго на охвате ранее сохранённого matched DiD. Проверяется полное декартово множество участвовавших единиц и post-месяцев, запрещены пропуски, дубликаты и нечисловые эффекты. Эквивалентность определения воздействия требует явного подтверждения (`exposureDefinitionVerified`), а интервалы causal-оценки не копируются на MMM. Добавлены пять тестовых сценариев.

**Не реализовано:** автоматическое вычисление MMM-эффектов из активной модели, автоматический вызов экспорта после обучения и сохранение в IndexedDB из MMM UI. Сервис является подготовительным безопасным адаптером, не автоматической калибровкой.

### Итерация 88 — экспорт помесячных MMM-эффектов через UI
Страница `MMM × Causal Lift` принимает массив `{unitId, period, incremental}` из рассчитанного MMM-контрфакта, привязывает его к выбранной сохранённой matched-DiD оценке и сохраняет в IndexedDB. Проверяются активная версия, точный декартов охват участвовавших единиц и месяцев, отсутствие пропусков/дубликатов, конечность эффектов и явное подтверждение эквивалентности сценариев. Прямое автоматическое вычисление MMM из обученной модели и автоматическая агрегация из `TrajectoryEffect` пока не подключены; пользователь должен подготовить корректные единицы измерения.

### Итерация 89 — агрегация MMM к единицам Causal Lift
Добавлен `mmmCausalUnitAggregationService.ts`: суммирование прогнозных эффектов по непересекающимся панелям продаж для явного идентификатора causal-единицы, точная проверка unit-month охвата, защита от дублирования и пропусков, поддержка sparse ATT(g,t) и настоящих нулевых эффектов. Требуется явное подтверждение непересечения исходных продаж; функция не выполняет причинную калибровку и пока не вызывается автоматически из UI. Добавлено 6 unit-тестов; без установленных зависимостей их запуск не подтверждён.

### Phase 90 — MMM → matched DiD registry orchestration

`mmmCausalRegistryPipelineService.ts` composes the existing full-history trajectory counterfactual,
explicit non-overlapping sales-panel aggregation, exact matched-DiD unit-month scope,
registry conversion, and metadata compatibility checks. `prepareMmmCausalRegistryResult` is pure;
`savePreparedMmmCausalRegistryResult` writes only after all validations pass.
It requires explicit confirmations of disjoint sales panels and intervention comparability.
**Not wired to MMM training UI yet.** This pipeline is a reusable integration entry point,
not a claim of causal identification or a substitute for diagnostics. Build/tests require dependencies.

### Phase 91 — treatment-onset counterfactual
- `calculateMarketingTrajectoryCounterfactuals` accepts `interventionStart` and preserves observed exposures before that month, including lagged adstock into the intervention window.
- The registry pipeline now requires an explicit `interventionStartPeriod` instead of silently comparing a never-treated MMM history with a post-treatment matched DiD.
- This is a common-onset scenario only. Staggered cohorts must be evaluated separately with cohort-specific onset; no causal equivalence is assumed.
- Added regression tests for pre-treatment carryover preservation and invalid onset.

### Итерация 92 — когортные контрфактические сценарии MMM

`mmmStaggeredCohortPipelineService.ts` рассчитывает отдельный контрфактический сценарий для каждой когорты ATT(g,t), начиная отключение драйвера в её месяце первого воздействия, сохраняя более раннюю историю adstock. Результаты агрегируются только по обработанным единицам-месяцам данной когорты и сравниваются через `compareStaggeredAttWithMmm`. При общем воздействии на единицы разных когорт расчёт блокируется. Сервис пока не подключён к UI; тестирование и сборка требуют установки зависимостей.

### Phase 93 — ATT(g,t) quality diagnostics

Added `staggeredAttQualityGateService.ts`: conservative per-cohort-time diagnostics using declared complete exposure panels, minimum treated/control counts, preperiod requirements, one-step placebo pretrend check, and deterministic unit-cluster bootstrap confidence intervals. `calibrationEligible` is a *screening flag only*, not proof of causality. No automatic calibration or UI integration. Added four Vitest test cases. No claims of executed tests or production build.

### Iteration 94 — joint staggered Event Study diagnostics

Added `staggeredEventStudyDiagnosticsService.ts` with multiple pre-treatment placebo leads, post-treatment dynamics, unit-history cluster bootstrap, pointwise confidence intervals, and a shared-resample max-absolute lead statistic with simultaneous lead bands and a descriptive joint pretrend p-value. The reference month `-1` is omitted. Missing event times are explicitly reported, never imputed as zero. A non-rejected pretrend test is not evidence of parallel trends; cohort assignment and control selection are fixed during resampling. Four unit tests were added. This service is not yet wired into the UI or calibration gate.

### Phase 95 — Event Study quality diagnostics in UI
- The Causal Lift page now runs joint clustered-bootstrap Event Study diagnostics alongside the existing chart and displays pretrend status, p-value, missing event-time periods and calibration triage.

### Event Study support limitation
- Event Study treated/control counts are reported separately for each event time. Because staggered cohorts can reuse overlapping not-yet-treated controls, the current estimator does not identify a defensible universal independent effective sample size. Reliability diagnostics therefore expose `independentSupport: unknown` with an explicit basis and never sum per-time counts into an ESS. Matched DiD reports its without-replacement pair count separately. These diagnostics remain observational and do not establish causal identification.
- Statistical detection is explicitly separate from methodological suitability; automatic MMM calibration remains disabled until interference, exposure equivalence and control selection have been independently checked.
- Added `eventStudyCalibrationGateService` and three tests. These diagnostics are not persisted to IndexedDB yet.


### Phase 96 — Event Study diagnostics persistence
Added IndexedDB v8 `eventStudyDiagnostics` store with versioned diagnostic report, study scope, parameters and conservative calibration gate. The Causal Lift page persists results only for a verified active dataset snapshot; MMM × Causal Lift shows diagnostics for the active version. Historical diagnostics are retained but hidden from active comparison. No automatic MMM calibration is enabled.

### Итерация 97 — аудит надёжности IndexedDB

- Чтение Event Study теперь дожидается завершения readonly-транзакции, а не только успешного запроса.
- Добавлен `listCurrentEventStudyDiagnostics(projectId, datasetVersion)` с использованием существующего составного индекса для исключения устаревших диагностик из сравнений.
- Валидация запрещает неупорядоченный календарь и пустые идентификаторы единиц; добавлены два unit-теста.
- Проверка TypeScript запущена, но остановилась на отсутствующем пакете `vite/client` (`TS2688`). Установка зависимостей `npm install` превысила тайм-аут. Unit-тесты и production-сборка НЕ подтверждены.
- Следующий шаг: в окружении с доступным npm выполнить `npm ci`/`npm install`, `npm run lint`, `npm test`, `npm run build` и браузерный тест миграции IndexedDB 7→8.

### Итерация 98 — актуальность диагностики и защита реестра

- Страница MMM × Causal Lift читает диагностики Event Study через составной индекс `projectId_datasetVersion`, а не загружает всю историю с последующей фильтрацией.
- Обновление страницы читает активную версию и данные последовательно, очищает устаревшее состояние при переключении проекта и сбрасывает результаты при ошибке чтения.
- Ручная запись результата запрещена, если указанная версия отличается от активной опубликованной версии.
- Для обновления IndexedDB дополнительно очищается кеш подключения при abort миграционной транзакции.

Ограничение: зависимости в данном окружении не установлены; проверка сборки и браузерная миграция остаются необходимыми.

### Iteration 99 — IndexedDB migration integration checks

- Added `database.integration.test.ts` using `fake-indexeddb`: migration from a seeded v7 database to v8, preservation of legacy data, creation of the compound index, strict project/version isolation, and concurrent opening.
- Added `closePharmaDatabase()` for safe explicit connection release and improved handling of aborted upgrades and unexpected database closes.
- Added `fake-indexeddb` as a development dependency. Run `npm install && npm test && npm run lint && npm run build` in an environment with npm registry access. These commands must pass before deployment; archive validation alone is insufficient.

## Итерация 100 — аудит технической стабильности

- Исправлена гонка в `openPharmaDatabase`: если заблокированное обновление схемы позднее успешно открыло БД, осиротевшее соединение теперь немедленно закрывается, чтобы не блокировать последующие обновления.
- Проверен сценарий миграции в исходниках и наличие интеграционных тестов; браузерный запуск миграции остаётся необходимым.
- Попытка `npm install` в окружении выполнения не завершилась в пределах времени ожидания. Поэтому TypeScript, Vitest и Vite build **не подтверждены**. Не используйте этот архив как аттестованную production-сборку.


### Итерация 101 — защита от гонок IndexedDB

Исправлена гонка между устаревшими `open()`-запросами и новым подключением: обработчики
`error`, `abort`, `versionchange`, `close` теперь очищают кеш только для собственного
поколения подключения. Поздно завершившийся устаревший запрос закрывается.
Добавлены интеграционные регрессионные тесты на повторное открытие и запоздалый
`versionchange`. Запуск тестов и production-сборки не подтверждён: npm registry
недоступен из рабочего окружения (`EAI_AGAIN`).
