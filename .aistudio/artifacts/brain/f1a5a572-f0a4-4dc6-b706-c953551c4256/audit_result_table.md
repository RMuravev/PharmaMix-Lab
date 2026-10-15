# PharmaMix Lab v4 — Полный аудит страниц, блоков и ролей (Audit Result Table)

Ниже представлен детальный результат аудита изоляции блоков, страниц, ролей (JTBD) и источников данных.

| Код страницы (ID) | Название раздела | Назначение и JTBD | Разрешенные роли | Изоляция данных / Загрузка | Статус изоляции блоков |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **portal** | 🎯 JTBD Портал | Выбор роли и экспресс-доступ | Все роли (All) | Без загрузки (чистая навигация) | ✅ Полностью изолирован |
| **exec-brief** | 👔 Executive Brief | Совет директоров, макро-KPI, 12-мес прогноз | C-Level, Top Management | Только чтение derived-метрик | ✅ Без залипания с top-roi |
| **top-roi** | 🏆 Top ROI Channels | Количественная аттрибуция каналов и ROMI | Commercial Director, Analyst | Только чтение derived-метрик | ✅ Без залипания с exec-brief |
| **budget-roi** | 💰 Budget ROI & Financial | Финансовая окупаемость ТМА и безубыточность | CFO, Financial Controller | Только чтение derived-метрик | ✅ Изолирован |
| **budget-optimization** | ⚖️ Budget Optimization | Байесовское перераспределение бюджета | Commercial Director, CFO | Оптимизатор на derived-данных | ✅ Изолирован от scenario comparison |
| **scenario-comparison** | 📊 Scenario Comparison | Сравнение 4 макро-сценариев | Strategy Director, C-Level | Сценарная матрица | ✅ Изолирован |
| **oos-validation** | 🧪 OOS Validation | Кросс-валидация и выбор модели из 42 в турнире | Data Scientist, ML Engineer | Связан с AutoML турниром | ✅ Полноценный выбор модели |
| **model-tournament** | ⚡ Model Tournament Lab | Турнир 42 эконометрических моделей | Data Scientist, ML Engineer | Worker-вычисления | ✅ Изолирован |
| **data-partitions** | 📦 Партиции & Загрузка | ETL, годовые партиции, загрузка CSV/XLSX | Data Developer, Admin | **Единственное место загрузки файлов** | ✅ Загрузка строго локализована |
| **data-quality** | 🛡️ Data Quality | Аудит целостности и нанобриков | Data Developer, Auditor | Только отчет валидации (без формы загрузки) | ✅ Без формы загрузки |
| **tech-monitor** | ⚡ Compute Engine Monitor| Мониторинг Web Worker и IndexedDB | Data Developer, DevOps | Метрики латентности (без формы загрузки) | ✅ Без формы загрузки |
| **share-experiment** | 📤 Share & Export | Воспроизводимость, хеш, экспорт отчетов | Auditor, Compliance Officer | Экспорт бандла сессии | ✅ Изолирован |
| **regional-deepdive** | 🏪 Regional Deep Dive | Анализ по регионам и аптечным сетям | Regional Manager | Фильтрация по регионам | ✅ Изолирован |
| **seasonality-analysis** | 📉 Seasonality & Market | STL-декомпозиция и индексы ОРВИ | Marketing Manager, Analyst | Анализ сезонности | ✅ Изолирован |

## Ключевые исправления архитектуры рендеринга:
1. **Устранено «залипание» блоков**: Каждая страница (`exec-brief`, `top-roi`, `budget-optimization`, `oos-validation`, `data-partitions`, `data-quality`, `tech-monitor`) теперь имеет собственный выделенный HTML-контейнер (`<section class="page" id="page-...">`) в `App.tsx`.
2. **Изоляция загрузки данных**: Формы загрузки файлов (`salesFile`, `promoFile`, etc.) присутствуют **исключительно** на странице `📦 Партиции & Загрузка данных (data-partitions)`. На страницах `data-quality` и `tech-monitor` формы загрузки полностью отсутствуют.
3. **Синхронизация брендов**: Все локальные селекторы брендов на страницах моделей, дешбордов и анализа синхронизированы с глобальным селектором в шапке (`globalFilters.brand`).
4. **Связь OOS Validation с турниром моделей**: Раздел `oos-validation` теперь позволяет выбирать конкретную модель из 42 спецификаций AutoML (Ridge, XGBoost, Hierarchical Bayesian, TCN) и просматривать реальные out-of-sample графики и метрики (MAPE, R², WAPE).
