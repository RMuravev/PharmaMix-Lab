# Импорт TV-рекламы и визитов медицинских представителей

## TV-реклама
Минимальные поля: `period` (год-месяц), `brand` (бренд), `trp`. TRP должен быть конечным числом не меньше нуля. Нормализатор принимает русские и английские названия колонок и числа с десятичной запятой.

## Визиты медицинских представителей
Минимальные поля: `period`, `region`, `brand`, `weightedVisits`. `city` необязателен. Количество взвешенных визитов должно быть конечным числом не меньше нуля.

## Контракты
- `normalizeTvRows(rows, projectId)` → `TvNormalizationResult`
- `normalizeVisitRows(rows, projectId)` → `VisitNormalizationResult`
- `ChannelExposureNormalizationService.commitTv(...)`
- `ChannelExposureNormalizationService.commitVisits(...)`

Оба commit-метода заменяют факты только в указанном проекте, публикуют версию источника в `datasets` и помечают готовые агрегаты проекта как `stale` при изменении fingerprint. Если ни одной корректной строки нет, commit не выполняется и прежние факты сохраняются.

## Ограничения
Fingerprint — быстрый отпечаток для обнаружения изменений, не криптографическая гарантия. Перед production-релизом нужно выполнить полную установку зависимостей, `npm test`, `npm run lint`, `npm run build` и браузерные интеграционные тесты.
