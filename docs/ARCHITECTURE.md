# PharmaMix Lab — целевая архитектура

## Принципы

- **Модульный монолит в браузере:** React + TypeScript + Vite; backend не входит в текущий контур.
- **Разделение слоёв:** `pages/app` отображают и маршрутизируют; `application` оркестрирует сценарии; `domain` содержит чистые правила и расчёты; `infrastructure` отвечает за IndexedDB, Web Workers и файлы; `shared` предоставляет дизайн-систему и универсальные UI-примитивы.
- **Страницы изолированы:** страница не обращается к IndexedDB напрямую, не импортирует другую страницу и не запускает тяжёлые расчёты в компоненте. Она получает подготовленные данные через application/query service.
- **Сохранённые результаты:** факты, агрегаты, параметры и результаты моделирования имеют версии. Ключ кэша включает версию данных, алгоритма, параметров и фильтров.
- **Безопасная публикация:** не заменять последний успешный результат до успешного завершения и проверки нового расчёта.

## Целевая структура

```text
src/
  app/                         # bootstrap, router, providers, error boundaries
  pages/                       # изолированные страницы приложения
  application/
    contracts/                 # интерфейсы репозиториев и DTO
    queries/                   # чтение подготовленных данных для страниц
    services/                  # импорт, агрегаты, расчёты, инвалидация
  domain/                      # чистые правила, модели и алгоритмы
  infrastructure/
    indexeddb/                 # schema, migrations, repositories, transactions
    workers/                   # worker protocol, client, cancellation
    import-export/             # файловый ввод/вывод
    logging/                   # диагностические события
  shared/
    design-system/             # токены и темы графиков/таблиц
    ui/                        # повторно используемые компоненты
    formatting/                # форматирование метрик
  workers/                     # точки входа Web Worker и диспетчер задач
  modules/                     # legacy-модули; удаляются после переноса и проверки
  ui/                          # legacy UI; переносится поэтапно
```

## Направление зависимостей

`pages → application → domain` и `application → infrastructure через контракты`. `domain` не импортирует React, DOM или IndexedDB. `shared/ui` не содержит бизнес-логики. Workers получают сериализуемые DTO и возвращают типизированный ответ.

## Ограничение многопользовательского режима

IndexedDB изолирован профилем браузера и устройством. В браузерной версии без backend несколько людей не имеют общей базы и общей синхронизации: каждый использует локальную рабочую область и импорт/экспорт файлов. Совместная работа между устройствами, централизованная авторизация и контроль доступа требуют отдельного серверного слоя.

## Application query boundary
Page components should call `OverviewQueryService.execute(projectId)` and render its `OverviewViewData`. They must not open IndexedDB transactions or sum sales in React components. The query expects normalized `salesFacts` and a published `datasets` row with `sourceType = "sales"`; until legacy import normalization is connected, the existing page remains on its compatibility path.
