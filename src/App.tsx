/**
 * PharmaMix Lab v3.1 — Фармацевтическая MMM & Промо-аналитика
 * Главный компонент интерфейса со всеми разделами, AutoML бренд-турниром и презентацией.
 */
import { useEffect } from 'react';
import { initPharmaMixApp } from './pharma_engine';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { NotificationCenter } from './ui/NotificationCenter';

const LoadingOverlay = () => (
  <div id="global-loading" style={{
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(255, 255, 255, 0.7)',
    backdropFilter: 'blur(4px)',
    display: 'none',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10000,
    transition: 'opacity 0.3s'
  }}>
    <div className="spinner" style={{
      width: '48px',
      height: '48px',
      border: '4px solid #e2e8f0',
      borderTop: '4px solid #2563eb',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite',
      marginBottom: '16px'
    }}></div>
    <div style={{ fontWeight: 600, color: '#1e293b' }}>Выполняются расчеты...</div>
    <style>{`
      @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    `}</style>
  </div>
);

export default function App() {
  useEffect(() => {
    try {
      const cleanup = initPharmaMixApp();
      return cleanup;
    } catch (error: any) {
      console.error('Initialization failed:', error);
    }
  }, []);

  return (
    <ErrorBoundary>
      <NotificationCenter />
      <LoadingOverlay />
      <div className="app">
      {/* Боковая панель навигации (Jobs-to-be-Done v4) */}
      <aside className="side">
        <div className="brand">
          <div className="logo" style={{ background: 'linear-gradient(135deg, #2563eb, #7c3aed)' }}>P</div>
          <div>
            <strong>PharmaMix Lab</strong>
            <small>v4 JTBD Platform</small>
          </div>
        </div>

        {/* Активный ролевой профиль */}
        <div id="activeRoleBadge" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 12px', margin: '10px 12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span id="activeRoleIcon" style={{ fontSize: '18px' }}>✦</span>
          <div>
            <div id="activeRoleTime" style={{ fontSize: '10px', color: '#64748b' }}>⏱️ 2-5 мин</div>
            <select id="headerRoleSelect" style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', border: 'none', background: 'transparent', cursor: 'pointer', maxWidth: '160px' }}>
                <option value="all">✦ Все разделы (Полный доступ)</option>
                <option value="analytics">📊 Marketing Analytics Lead</option>
                <option value="regional">🏪 Regional Sales Manager</option>
                <option value="cmo">💼 CMO</option>
                <option value="ds">🤖 Data Scientist</option>
                <option value="cfo">💰 CFO</option>
                <option value="board">👔 Board / C-Level</option>
                <option value="developer">🛠️ Analytics Engineer</option>
              </select>
            </div>
          </div>
        </div>

        <nav className="nav" id="nav">
          {/* 1. БЫСТРЫЕ ОТЧЕТЫ (30 сек - 2 мин) */}
          <div className="nav-group">
            <span className="nav-group-label">🚀 БЫСТРЫЕ ОТЧЕТЫ (30 сек – 2 мин)</span>
            <button data-page="exec-brief" className="active">👔 Executive Brief</button>
            <button data-page="top-roi">📈 Top ROI Channels</button>
            <button data-page="budget-roi">💰 Budget ROI Report</button>
          </div>

          {/* 2. УГЛУБЛЕННЫЙ АНАЛИЗ (5 - 15 мин) */}
          <div className="nav-group">
            <span className="nav-group-label">🔍 УГЛУБЛЕННЫЙ АНАЛИЗ (5 – 15 мин)</span>
            <button data-page="regional-deepdive">🏪 Regional Deep Dive</button>
            <button data-page="seasonality-analysis">📉 Seasonality Analysis</button>
            <button data-page="causal-tests">🛡️ Causal Inference Tests</button>
          </div>

          {/* 3. ПЛАНИРОВАНИЕ (10 - 30 мин) */}
          <div className="nav-group">
            <span className="nav-group-label">⚙️ ПЛАНИРОВАНИЕ (10 – 30 мин)</span>
            <button data-page="whatif-scenarios">🎯 What-If Scenarios</button>
            <button data-page="budget-optimization">⚖️ Budget Optimization</button>
            <button data-page="scenario-comparison">📊 Scenario Comparison</button>
          </div>

          {/* 4. ЭКСПЕРИМЕНТИРОВАНИЕ (5 - 10 мин) */}
          <div className="nav-group">
            <span className="nav-group-label">🤖 ЭКСПЕРИМЕНТЫ (5 – 10 мин)</span>
            <button data-page="model-tournament">⚡ Model Tournament (42)</button>
            <button data-page="oos-validation">🧪 OOS Validation</button>
            <button data-page="share-experiment">📤 Share & Export</button>
          </div>

          {/* 5. ДАННЫЕ & ТЕХНИЧЕСКИЙ HUB (Аналитик-разработчик) */}
          <div className="nav-group">
            <span className="nav-group-label">🛠️ ДАННЫЕ & ТЕХНИЧЕСКИЙ HUB</span>
            <button data-page="data-partitions">📦 Партиции & Загрузка</button>
            <button data-page="data-quality">🛡️ Data Quality & Nanobricks</button>
            <button data-page="tech-monitor">⚡ Compute Engine Monitor</button>
            <button data-page="tech-logs">🐛 System Error Logs</button>
          </div>
        </nav>

        <div className="side-footer" style={{ marginTop: 'auto', padding: '10px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span className="pill" id="dataStatus" style={{ fontSize: '11px' }}>Демо-данные</span>
          </div>
          <div id="modelTournamentStatusBadge" style={{ background: '#dcfce7', color: '#16a34a', fontWeight: 700, fontSize: '11px', padding: '4px 8px', borderRadius: '6px', display: 'inline-block' }}>
            ⚡ Статус моделей: 42/42 (100%) [Готово]
          </div>
          <div className="side-note" style={{ fontSize: '11px', lineHeight: 1.4, color: '#64748b', padding: 0, background: 'transparent', border: 'none' }}>
            PharmaMix Lab v4: JTBD-навигация для 7 ролей, Causal DiD с доверительными интервалами 95% и технический Hub данных.
          </div>
        </div>
      </aside>

      {/* Основной контент */}
      <div className="main-wrapper">
        <div className="top" style={{ position: 'sticky', top: 0, zIndex: 100, background: '#ffffff', borderBottom: '1px solid #e2e8f0', padding: '12px 20px', margin: '0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 id="topTitle" style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#0f172a' }}>🎯 JTBD Портал выбора роли & экспресс-задач</h1>
            <p id="topSubtitle" style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
              Фармацевтический маркетинг · инкрементальные продажи · эконометрика · Causal DiD
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* Глобальная панель фильтрации: Бренд · Регион */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', background: '#f8fafc', padding: '4px 10px', borderRadius: '10px', border: '1px solid #cbd5e1' }}>
              {/* Селектор Бренда */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>🏷️ Бренд:</span>
                <select id="globalBrandSelect" style={{ padding: '4px 8px', fontSize: '12px', fontWeight: 600, border: '1px solid #94a3b8', borderRadius: '6px', background: '#fff', color: '#0f172a', cursor: 'pointer', maxWidth: '140px' }}>
                  <option value="">Все бренды</option>
                </select>
              </div>

              {/* Селектор Региона */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>🌍 Регион:</span>
                <select id="globalRegionSelect" style={{ padding: '4px 8px', fontSize: '12px', fontWeight: 600, border: '1px solid #94a3b8', borderRadius: '6px', background: '#fff', color: '#0f172a', cursor: 'pointer', maxWidth: '140px' }}>
                  <option value="">Все регионы</option>
                </select>
              </div>

              {/* Кнопка сброса фильтров */}
              <button id="btnResetGlobalFilters" className="btn btn-sm btn-sub" style={{ padding: '3px 8px', fontSize: '11px', display: 'none', background: '#e2e8f0', color: '#0f172a' }} title="Сбросить все глобальные фильтры">
                ✖ Сброс
              </button>
            </div>

            <button id="btnStartTour" className="btn btn-sm" style={{ background: '#0891b2', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }} title="Запустить интерактивную справку">
              ❔ Тур
            </button>
          </div>
        </div>
        <main>
          {/* 0. JTBD Портал выбора роли и экспресс-задач (Default Landing) */}
          <section className="page active" id="page-portal">
            <div id="portalSectionRoot"></div>
          </section>

        {/* 1. Обзор / Top ROI Channels */}
        <section className="page" id="page-overview">
          <div className="page-head">
            <div>
              <h2>Обзор бизнеса</h2>
              <p>Метрики обновляются синхронно при загрузке файлов или смене параметров.</p>
            </div>
            <button className="secondary" id="resetDemo">Вернуть демоданные</button>
          </div>
          <div className="grid four" id="kpis"></div>

          {/* Интерактивный график Contribution Decomposition */}
          <div className="card" style={{ marginTop: '16px' }}>
            <h3>Декомпозиция Вкладов Каналов Продвижения (Contribution Decomposition)</h3>
            <p className="sub">Помесячный вклад базовых продаж, ТВ-рекламы, ТМА-промо, CRM-визитов медпредов и активности конкурентов</p>
            <div className="chart-container" style={{ position: 'relative', height: '260px', maxHeight: '260px', width: '100%', overflow: 'hidden' }}>
              <canvas id="ovContribDecompCanvas"></canvas>
            </div>
            <div className="legend" style={{ marginTop: '8px' }}>
              <span><i className="dot" style={{ background: '#3b82f6' }}></i>Базовые продажи</span>
              <span><i className="dot" style={{ background: '#10b981' }}></i>ТВ-Реклама (TRP)</span>
              <span><i className="dot" style={{ background: '#f59e0b' }}></i>Трейд-Маркетинг (ТМА)</span>
              <span><i className="dot" style={{ background: '#8b5cf6' }}></i>Визиты CRM</span>
              <span><i className="dot" style={{ background: '#ec4899' }}></i>Конкуренты / Рынок</span>
            </div>
          </div>

          <div className="grid two" style={{ marginTop: '16px' }}>
            <div className="card">
              <h3>Продажи по месяцам</h3>
              <p className="sub">Факт и подгонка регрессии in-sample</p>
              <div className="chart-container" style={{ position: 'relative', height: '240px', maxHeight: '240px', width: '100%', overflow: 'hidden' }}>
                <canvas id="salesChart"></canvas>
              </div>
              <div className="legend">
                <span><i className="dot" style={{ background: '#2854e6' }}></i>Факт</span>
                <span><i className="dot" style={{ background: '#0d9488' }}></i>Регрессия</span>
              </div>
            </div>
            <div className="card">
              <h3>Покрытие данных</h3>
              <p className="sub">Количество строк в каждом источнике и диапазон месяцев</p>
              <div id="coverage"></div>
              <div id="ovChecks" className="callout" style={{ marginTop: '12px', marginBottom: 0 }}></div>
            </div>
          </div>
          <div className="card" style={{ marginTop: '16px' }}>
            <h3>Сводные показатели по брендам</h3>
            <div className="table-wrap"><table id="tblOverview"></table></div>
          </div>
          <div id="ovInsightsBox" className="callout good" style={{ marginTop: '16px' }}></div>
        </section>



        {/* Раздел: AutoML & Бренды */}
        <section className="page" id="page-automl">
          <div id="pdfExportArea">
            <div className="page-head">
              <div>
                <h2>⚡ AutoML Бренд-Турнир & Эластичность ТМА</h2>
                <p>Автоматизированный прогон 42 эконометрических, ML и нейросетевых моделей по каждому бренду отдельно с межбрендовым сравнением и SHAP-анализом.</p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button id="runAutoMLBtn">▶ Запустить AutoML (42 модели)</button>
                <button id="exportPdfExecBtn" className="secondary" style={{ background: '#1e293b', color: '#fff' }}>📄 Executive PDF (1-2 стр.)</button>
                <button id="exportPdfFullBtn" className="secondary" style={{ background: '#0f172a', color: '#fff' }}>📑 Полный PDF-Отчет</button>
                <button id="exportExcelBtn" className="secondary">📥 Скачать в Excel (.xlsx)</button>
              </div>
            </div>

            <div className="card" style={{ marginBottom: '16px', background: '#f8fafc' }}>
              <div className="filters">
                <div className="field">
                  <label htmlFor="automlBrandSelect">Выберите бренд для детального анализа</label>
                  <select id="automlBrandSelect">
                    <option value="">Все бренды (Сводный портфель)</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="automlMarginInput">Валовая маржа (Gross Margin, %)</label>
                  <input id="automlMarginInput" type="number" defaultValue="48" step="1" min="10" max="95" />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <span className="pill" id="automlStatusBadge" style={{ background: '#dcfce7', color: '#166534', padding: '8px 14px', fontSize: '13px' }}>
                    ✓ AutoML 42 Модели Активен
                  </span>
                </div>
              </div>
            </div>

            {/* KPI Брендового AutoML */}
            <div className="grid four" id="automlKpis" style={{ marginBottom: '16px' }}></div>

            <div className="grid two" style={{ marginBottom: '16px' }}>
              {/* Водопад Waterfall */}
              <div className="card">
                <h3>Waterfall Декомпозиция Продаж</h3>
                <p className="sub">Вклад органика, ТВ-рекламы, ТМА-бонусов, CRM-визитов и цен в итоговые продажи</p>
                <div className="chart-container" style={{ position: 'relative', height: '240px', maxHeight: '240px', width: '100%', overflow: 'hidden' }}>
                  <canvas id="automlWaterfallCanvas"></canvas>
                </div>
              </div>

              {/* Кривая Эластичности и Оптимальный Бонус */}
              <div className="card">
                <h3>Кривая Эластичности Спроса & Оптимальная Скидка</h3>
                <p className="sub">Максимизация чистой маржинальной прибыли с учетом насыщения и риска каннибализации</p>
                <div className="chart-container" style={{ position: 'relative', height: '230px', maxHeight: '230px', width: '100%', overflow: 'hidden' }}>
                  <canvas id="automlElasticityCanvas"></canvas>
                </div>
                <div id="automlElasticityInfo" className="callout" style={{ marginTop: '8px', fontSize: '12px' }}></div>
              </div>
            </div>

            {/* SHAP-Анализ факторов */}
            <div className="card" style={{ marginBottom: '16px' }}>
              <h3>🔬 SHAP-Анализ & Интерпретация Моделей (Shapley Additive Explanations)</h3>
              <p className="sub">Объективная оценка вклада каждого маркетингового фактора в прогноз продаж для бренда</p>

              <div className="grid two" style={{ marginTop: '12px' }}>
                <div>
                  <h4 style={{ fontSize: '13px', marginBottom: '8px', color: '#334155' }}>SHAP Summary Bar Chart (Средний абсолютный вклад)</h4>
                  <div className="chart-container" style={{ position: 'relative', height: '210px', maxHeight: '210px', width: '100%', overflow: 'hidden' }}>
                    <canvas id="shapSummaryBarCanvas"></canvas>
                  </div>
                </div>
                <div>
                  <h4 style={{ fontSize: '13px', marginBottom: '8px', color: '#334155' }}>SHAP Beeswarm Plot (Плотность & Направление влияния)</h4>
                  <div className="chart-container" style={{ position: 'relative', height: '210px', maxHeight: '210px', width: '100%', overflow: 'hidden' }}>
                    <canvas id="shapBeeswarmCanvas"></canvas>
                  </div>
                </div>
                <div className="card">
                  <h4 style={{ fontSize: '13px', marginBottom: '8px', color: '#334155' }}>Анализ Остатков (Residual Analysis)</h4>
                  <div className="chart-container" style={{ position: 'relative', height: '210px', maxHeight: '210px', width: '100%', overflow: 'hidden' }}>
                    <canvas id="automlResidualCanvas"></canvas>
                  </div>
                </div>
              </div>
            </div>

            {/* Межбрендовая сравнительная таблица */}
            <div className="card" style={{ marginBottom: '16px' }}>
              <h3>Межбрендовое Сравнение Эффективности & Лучшие Модели</h3>
              <p className="sub">Сравнительный анализ показателей, выбранных моделей и Adstock полураспада по всей линейке</p>
              <div className="table-wrap"><table id="automlBrandComparisonTable"></table></div>
            </div>

            {/* Турнир моделей выбранного бренда */}
            <div className="card" style={{ marginBottom: '16px' }}>
              <h3 id="automlLeaderboardTitle">Турнир 42 Моделей AutoML (Все бренды)</h3>
              <p className="sub">Сравнение 14 эконометрических спецификаций, 14 ML-моделей и 14 нейросетей TCN/LSTM/Transformer по MAPE, R² и экономической валидности</p>
              <div className="table-wrap"><table id="automlLeaderboardTable"></table></div>
            </div>

            {/* Срезы ТМА по механикам и аптечным сетям */}
            <div className="grid two" style={{ marginBottom: '16px' }}>
              <div className="card">
                <h3>Эффективность ТМА по Механикам Акций</h3>
                <div className="table-wrap"><table id="automlMechanicsTable"></table></div>
              </div>
              <div className="card">
                <h3>Эффективность ТМА по Аптечным Сетям</h3>
                <div className="table-wrap"><table id="automlChainsTable"></table></div>
              </div>
            </div>

            {/* Что-Если Симулятор & Аллокатор бюджета */}
            <div className="card">
              <h3>🎛️ Что-Если Симулятор & Мульти-Брендовый Оптимизатор Бюджета</h3>
              <p className="sub">Моделирование изменения продаж при перераспределении бюджетов каналов продвижения</p>

              <div className="formgrid" style={{ marginTop: '12px', marginBottom: '14px' }}>
                <div className="field">
                  <label htmlFor="simTrpSlider">Изменение бюджета ТВ-рекламы (TRP): <b id="simTrpVal">0%</b></label>
                  <input id="simTrpSlider" type="range" min="-50" max="100" defaultValue="0" step="5" />
                </div>
                <div className="field">
                  <label htmlFor="simBonusSlider">Изменение промо-фонда ТМА (Бонусы): <b id="simBonusVal">0%</b></label>
                  <input id="simBonusSlider" type="range" min="-50" max="100" defaultValue="0" step="5" />
                </div>
                <div className="field">
                  <label htmlFor="simVisitsSlider">Изменение визитов медпредов (CRM): <b id="simVisitsVal">0%</b></label>
                  <input id="simVisitsSlider" type="range" min="-50" max="100" defaultValue="0" step="5" />
                </div>
              </div>

              <div id="simResultsBox" className="result-grid" style={{ marginTop: '12px' }}></div>
            </div>
            <div id="automlInsightsBox" className="callout good" style={{ marginTop: '16px' }}></div>
          </div>
        </section>

        {/* 4.5 Сравнение сценариев */}
        <section className="page" id="page-scenario"></section>

        {/* 2. Дашборды */}
        <section className="page" id="page-dash">
          <div className="page-head">
            <div>
              <h2>Сводные дашборды</h2>
              <p>Продажи, рыночная доля, бонусы, инкрементальная выручка и финансовый ROI.</p>
            </div>
          </div>
          <div className="card">
            <div className="filters">
              <div className="field"><label htmlFor="dBrand">Бренд</label><select id="dBrand"></select></div>
              <div className="field"><label htmlFor="dRegion">Регион</label><select id="dRegion"></select></div>
              <div className="field"><label htmlFor="dFrom">Месяц с</label><select id="dFrom"></select></div>
              <div className="field"><label htmlFor="dTo">Месяц по</label><select id="dTo"></select></div>
            </div>
            <div className="small" id="dashAssump"></div>
          </div>
          <div className="grid four" id="dashKpis" style={{ marginTop: '16px' }}></div>
          <div className="grid two" style={{ marginTop: '16px' }}>
            <div className="card">
              <h3>Продажи, ₽</h3>
              <div className="chart-container" style={{ position: 'relative', height: '230px', maxHeight: '230px', width: '100%', overflow: 'hidden' }}>
                <canvas id="dashSales"></canvas>
              </div>
              <div className="legend" id="dashSalesLg"></div>
            </div>
            <div className="card">
              <h3>Доля рынка</h3>
              <div className="chart-container" style={{ position: 'relative', height: '230px', maxHeight: '230px', width: '100%', overflow: 'hidden' }}>
                <canvas id="dashShare"></canvas>
              </div>
              <div className="legend" id="dashShareLg"></div>
            </div>
            <div className="card">
              <h3>Бонусы и инкрементальная выручка, ₽</h3>
              <div className="chart-container" style={{ position: 'relative', height: '230px', maxHeight: '230px', width: '100%', overflow: 'hidden' }}>
                <canvas id="dashBonus"></canvas>
              </div>
            </div>
            <div className="card">
              <h3>ROI по месяцам</h3>
              <div className="chart-container" style={{ position: 'relative', height: '230px', maxHeight: '230px', width: '100%', overflow: 'hidden' }}>
                <canvas id="dashRoi"></canvas>
              </div>
            </div>
          </div>
          <div className="card" style={{ marginTop: '16px' }}>
            <h3>Показатели по брендам</h3>
            <div className="table-wrap"><table id="dashTable"></table></div>
          </div>
          <div className="card" style={{ marginTop: '16px' }}>
            <h3>Проверка корректности агрегирования</h3>
            <div id="dashChecks"></div>
          </div>
          <div id="dashInsightsBox" className="callout good" style={{ marginTop: '16px' }}></div>
        </section>

        {/* 3. Рынок */}
        <section className="page" id="page-market">
          <div className="page-head">
            <div>
              <h2>Рыночные данные & Конкуренты</h2>
              <p>Адресный рынок, доля наших брендов и динамика конкурентов.</p>
            </div>
          </div>
          <div className="card">
            <div className="filters">
              <div className="field"><label htmlFor="mkMarket">Адресный рынок</label><select id="mkMarket"></select></div>
              <div className="field"><label htmlFor="mkRegion">Регион</label><select id="mkRegion"></select></div>
              <div className="field"><label htmlFor="mkMetric">Метрика</label><select id="mkMetric"><option value="rub">Рубли</option><option value="units">Штуки</option></select></div>
              <div className="field"><label htmlFor="mkWin">Окно сравнения</label><select id="mkWin"><option value="3">Последние 3 мес.</option><option value="6" defaultValue="6">Последние 6 мес.</option><option value="12">Последние 12 мес.</option></select></div>
            </div>
            <div id="mkAssump" className="small" style={{ marginTop: '6px' }}></div>
          </div>
          <div className="grid four" id="mkKpis" style={{ marginTop: '16px' }}></div>
          <div className="grid two" style={{ marginTop: '16px' }}>
            <div className="card">
              <h3>Динамика доли рынка брендов, %</h3>
              <div className="chart-container" style={{ position: 'relative', height: '240px', maxHeight: '240px', width: '100%', overflow: 'hidden' }}>
                <canvas id="mkChartShare"></canvas>
              </div>
              <div className="legend" id="mkShareLg"></div>
            </div>
            <div className="card">
              <h3>Индекс цен к рынку (100 = среднее)</h3>
              <div className="chart-container" style={{ position: 'relative', height: '240px', maxHeight: '240px', width: '100%', overflow: 'hidden' }}>
                <canvas id="mkChartPrice"></canvas>
              </div>
              <div className="legend" id="mkPriceLg"></div>
            </div>
          </div>
          <div className="card" style={{ marginTop: '16px' }}>
            <h3>Конкурентная панель по брендам</h3>
            <div className="table-wrap"><table id="mkTable"></table></div>
          </div>
          <div className="card" style={{ marginTop: '16px' }}>
            <h3>Региональный разрез рынка (Federal Subjects)</h3>
            <p className="sub">Анализ вклада регионов в общий объем выбранного рынка и темпы роста</p>
            <div className="table-wrap"><table id="mkRegTable"></table></div>
          </div>
          <div id="mkInsightsBox" className="callout good" style={{ marginTop: '16px' }}></div>
        </section>

        {/* 4. Промо */}
        <section className="page" id="page-promo">
          <div className="page-head">
            <div>
              <h2>🏪 Трейд-Маркетинг & Аптечные Сети</h2>
              <p>Анализ выплат сетям, инкрементального uplift и ROI промо-активностей.</p>
            </div>
          </div>
          <div className="card">
            <div className="filters">
              <div className="field"><label htmlFor="prBrand">Бренд</label><select id="prBrand"></select></div>
              <div className="field"><label htmlFor="prChain">Аптечная сеть</label><select id="prChain"></select></div>
              <div className="field"><label htmlFor="prMech">Механика акции</label><select id="prMech"></select></div>
            </div>
          </div>
          <div className="grid four" id="prKpis" style={{ marginTop: '16px' }}></div>
          <div id="prReconciliation" className="callout" style={{ marginTop: '16px' }}></div>
          <div className="grid two" style={{ marginTop: '16px' }}>
            <div className="card">
              <h3>Сравнение ROAS & Инкремента по Аптечным Сетям</h3>
              <div className="chart-container" style={{ position: 'relative', height: '240px', maxHeight: '240px', width: '100%', overflow: 'hidden', marginBottom: '12px' }}>
                <canvas id="prChainsCanvas"></canvas>
              </div>
              <div className="table-wrap"><table id="prTblChains"></table></div>
            </div>
            <div className="card">
              <h3>Сравнение Uplift % & Прибыли по Механикам Акций</h3>
              <div className="chart-container" style={{ position: 'relative', height: '240px', maxHeight: '240px', width: '100%', overflow: 'hidden', marginBottom: '12px' }}>
                <canvas id="prMechsCanvas"></canvas>
              </div>
              <div className="table-wrap"><table id="prTblMechs"></table></div>
            </div>
          </div>
          <div className="card" style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0 }}>Реестр зарегистрированных промо-соглашений</h3>
                <p className="sub" style={{ margin: '2px 0 0' }}>Детализированный учет промо-акций, расчет uplift и финансового результата</p>
              </div>
              <div id="prRegSummaryBadges" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}></div>
            </div>

            {/* Фильтры и быстрый поиск по реестру */}
            <div className="filters" style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '12px', gap: '10px', alignItems: 'flex-end' }}>
              <div className="field" style={{ flex: '2', minWidth: '200px' }}>
                <label htmlFor="prRegSearch" style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>🔍 Поиск по реестру</label>
                <input id="prRegSearch" type="text" placeholder="SKU, бренд, сеть или механика..." style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
              </div>
              <div className="field" style={{ flex: '1', minWidth: '150px' }}>
                <label htmlFor="prRegRoiFilter" style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>Фильтр окупаемости</label>
                <select id="prRegRoiFilter" style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                  <option value="all">Все промо-акции</option>
                  <option value="profitable">✓ Только прибыльные (ROI &gt; 0)</option>
                  <option value="unprofitable">⚠️ Только убыточные (ROI &le; 0)</option>
                  <option value="highRoas">⚡ Высокий ROAS (&ge; 2.0)</option>
                </select>
              </div>
              <div className="field" style={{ flex: '1', minWidth: '150px' }}>
                <label htmlFor="prRegSort" style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>Сортировка</label>
                <select id="prRegSort" style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                  <option value="dateDesc">Месяц (Сначала новые)</option>
                  <option value="drDesc">Δ Выручки (По убыванию)</option>
                  <option value="profitDesc">Прибыль (По убыванию)</option>
                  <option value="roiDesc">ROI (Рентабельность ↓)</option>
                  <option value="bonusDesc">Бонус сети (По убыванию)</option>
                  <option value="upliftDesc">Uplift % (По убыванию)</option>
                </select>
              </div>
              <div className="field" style={{ width: '80px', flex: '0 0 80px' }}>
                <label htmlFor="prRegPageSize" style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>На стр.</label>
                <select id="prRegPageSize" style={{ padding: '6px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
              </div>
            </div>

            <div className="table-wrap"><table id="prTable"></table></div>

            {/* Пагинатор */}
            <div id="prPaginationBar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <div id="prRegCountInfo" style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}></div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <button id="btnPrPrevPage" className="btn btn-sm btn-sub" style={{ padding: '4px 10px', fontSize: '12px' }}>⬅ Назад</button>
                <span id="prCurrentPageNum" style={{ padding: '4px 8px', fontSize: '12px', fontWeight: 700, color: '#1e293b' }}>Стр. 1</span>
                <button id="btnPrNextPage" className="btn btn-sm btn-sub" style={{ padding: '4px 10px', fontSize: '12px' }}>Вперед ➡</button>
              </div>
            </div>
          </div>
          <div id="prInsightsBox" className="callout good" style={{ marginTop: '16px' }}></div>
        </section>

        {/* 5. Модели */}
        <section className="page" id="page-models">
          <div className="page-head">
            <div>
              <h2>Эконометрическое моделирование (MMM)</h2>
              <p>Оценка медиа-эффектов, Adstock полураспада и эластичности продаж.</p>
            </div>
          </div>
          <div className="card">
            <div className="filters">
              <div className="field"><label htmlFor="mdBrand">Бренд</label><select id="mdBrand"></select></div>
              <div className="field"><label htmlFor="mdAdstock">Adstock λ (затухание)</label><input id="mdAdstock" type="number" step="0.05" min="0" max="0.9" defaultValue="0.4" /></div>
              <div className="field"><label htmlFor="mdHill">Hill K (насыщение)</label><input id="mdHill" type="number" step="50" min="50" max="1000" defaultValue="300" /></div>
            </div>
          </div>
          <div className="grid four" id="mdKpis" style={{ marginTop: '16px' }}></div>
          <div className="grid two" style={{ marginTop: '16px' }}>
            <div className="card">
              <h3>Декомпозиция прироста продаж</h3>
              <div className="chart-container" style={{ position: 'relative', height: '240px', maxHeight: '240px', width: '100%', overflow: 'hidden' }}>
                <canvas id="mdChartDecomp"></canvas>
              </div>
              <div className="legend" id="mdDecompLg"></div>
            </div>
            <div className="card">
              <h3>Кривая насыщения ТВ-рекламы (Hill Function)</h3>
              <div className="chart-container" style={{ position: 'relative', height: '240px', maxHeight: '240px', width: '100%', overflow: 'hidden' }}>
                <canvas id="mdChartHill"></canvas>
              </div>
            </div>
          </div>
          <div id="mdInsightsBox" className="callout good" style={{ marginTop: '16px' }}></div>
        </section>

        {/* 6. ML-Центр */}
        <section className="page" id="page-mlcenter">
          <div className="page-head">
            <div>
              <h2>✦ ML-Центр 3.1 & Causal Inference</h2>
              <p>Иерархическая байесовская регрессия, поиск оптимального лага, TCN нейросеть и Geo A/B каузальный анализ.</p>
            </div>
          </div>

          <div className="card" style={{ marginBottom: '16px', width: '100%' }}>
            <h3>1. Иерархическая регрессия (Hierarchical Bayesian)</h3>
            <p className="sub">Совместное моделирование бренд-портфеля с перекрестным сглаживанием параметров</p>
            <button id="run-ml-hier" style={{ marginTop: '8px' }}>Запустить иерархическую регрессию</button>
            <div id="ml-hier-out" className="callout" style={{ marginTop: '10px', fontSize: '12px' }}>Ожидает запуска...</div>
          </div>

          <div className="card" style={{ marginBottom: '16px', width: '100%' }}>
            <h3>2. Поиск лага рекламы (Grid Search Delay)</h3>
            <p className="sub">Перебор задержек отклика потребителей (0-4 месяца) по коэффициенту R²</p>
            <button id="run-ml-lag" style={{ marginTop: '8px' }}>Запустить сетку лагов</button>
            <div id="ml-lag-out" className="callout" style={{ marginTop: '10px', fontSize: '12px' }}>Ожидает запуска...</div>
          </div>

          <div className="card" style={{ marginBottom: '16px', width: '100%' }}>
            <h3>3. Temporal Convolutional Network (Causal TCN)</h3>
            <p className="sub">Нейросетевое выявление нелинейных временных зависимостей без утечки будущего</p>
            <button id="run-ml-tcn" style={{ marginTop: '8px' }}>Обучить TCN нейросеть</button>
            <div id="ml-tcn-out" className="callout" style={{ marginTop: '10px', fontSize: '12px' }}>Ожидает обучения...</div>
          </div>

          <div className="card" style={{ marginBottom: '16px', width: '100%' }}>
            <h3>Инфо: Методология квази-экспериментов</h3>
            <p className="sub">Синтетический контроль и Difference-in-Differences (DiD)</p>
            <p style={{ fontSize: '12px', color: '#475569', lineHeight: 1.5, marginTop: '6px' }}>
              Метод строит синтетический аналог тестового региона из пула доноров (синтетический контроль) и оценивает чистый инкрементальный эффект с робастными кластерными стандартными ошибками (CRSE) и 95% доверительным интервалом.
            </p>
          </div>

          <div className="card" style={{ marginBottom: '16px', width: '100%' }}>
            <h3>4. Causal Inference Geo A/B Experiment (DiD)</h3>
            <p className="sub">Оценка чистого каузального эффекта маркетинговой кампании методом Synthetic Control / DiD</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", marginTop: "10px", marginBottom: "12px" }}>
              <div className="field">
                <label htmlFor="geoab-factor" style={{ fontSize: "11px", fontWeight: 600 }}>Фактор воздействия</label>
                <select id="geoab-factor" style={{ fontSize: "12px" }}>
                  <option value="visits">Визиты медпредставителей</option>
                  <option value="bonus">Трейд-промо (Бонусы %)</option>
                  <option value="both">Комплекс (Визиты + Промо)</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="geoab-split" style={{ fontSize: "11px", fontWeight: 600 }}>Старт кампании (сплит)</label>
                <select id="geoab-split" style={{ fontSize: "12px" }}></select>
              </div>
              <div className="field">
                <label htmlFor="geoab-region" style={{ fontSize: "11px", fontWeight: 600 }}>Региональный датасет</label>
                <select id="geoab-region" style={{ fontSize: "12px" }}>
                  <option value="">Все регионы (Сводный)</option>
                </select>
              </div>
            </div>
            <button id="run-ml-geo" className="btn btn-sm" style={{ background: "#2563eb", color: "#fff", marginTop: "4px" }}>Запустить Causal DiD Тест</button>
            <div id="ml-geo-out" className="callout" style={{ marginTop: "10px", fontSize: "12px" }}>Ожидает эксперимента...</div>
          </div>

          <div className="card" style={{ marginBottom: '16px', width: '100%' }}>
            <h3>График Результатов Causal DiD Эксперимента</h3>
            <div className="chart-container" style={{ position: 'relative', height: '260px', maxHeight: '260px', width: '100%', overflow: 'hidden' }}>
              <canvas id="mlGeoCanvas"></canvas>
            </div>
            <div className="legend" style={{ marginTop: '8px' }}>
              <span><i className="dot" style={{ background: '#2854e6' }}></i>Тестовый регион (Fact)</span>
              <span><i className="dot" style={{ background: '#0d9488' }}></i>Синтетический контроль</span>
              <span><i className="dot" style={{ background: '#f59e0b' }}></i>Контрфактуал (Без ТВ)</span>
            </div>
          </div>
          <div id="mlInsightsBox" className="callout good" style={{ marginTop: '16px' }}></div>
        </section>

        {/* 7. Данные */}
        <section className="page" id="page-data">
          <div className="page-head">
            <div>
              <h2>Загрузка & Синхронизация данных</h2>
              <p>Загружайте ваши XLSX/CSV файлы, импортируйте ТВ-рекламу (TRP), визиты медпредов, ТМА и внешний мониторинг заболеваемости.</p>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button id="loadFiles" className="btn" style={{ background: '#2563eb', color: '#fff' }}>✓ Применить данные</button>
              <button id="resetDemo" className="btn" style={{ background: '#0284c7', color: '#fff' }} onClick={() => (window as any).__pmRestoreDemoData ? (window as any).__pmRestoreDemoData() : null}>🔄 Восстановить демо-партиции (2023–2025)</button>
            </div>
          </div>

          {/* Режим импорта */}
          <div className="card" style={{ marginBottom: '16px', background: '#f8fafc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <b style={{ fontSize: '13px', color: '#1e293b' }}>Режим слияния загружаемых файлов (Data Ingestion Strategy):</b>
              </div>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
                  <input type="radio" name="uploadMode" id="modeAppend" defaultChecked />
                  <span><b>Append / Upsert:</b> Дополнять и обновлять существующие месяцы</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
                  <input type="radio" name="uploadMode" id="modeOverwrite" />
                  <span><b>Overwrite:</b> Полное перетирание текущих данных в памяти</span>
                </label>
              </div>
            </div>
          </div>

          {/* Сетка загрузки 5 ключевых источников */}
          <div className="grid two" style={{ marginBottom: '16px' }}>
            {/* 1. Продажи */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3>1. Данные Продаж (Outflow / Sales)</h3>
                  <p className="sub">Аптечные выбытия по SKU, месяцам, городам и сетям</p>
                </div>
                <span className="pill" id="salesStatus" style={{ background: '#dbeafe', color: '#1e40af' }}>0 строк</span>
              </div>
              <div style={{ marginTop: '12px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="file" id="salesFile" accept=".csv,.xlsx,.txt" style={{ flex: 1 }} />
                <button id="dlTplSales" className="btn btn-sm btn-sub" title="Скачать шаблон CSV">💾 Шаблон CSV</button>
              </div>
            </div>

            {/* 2. Промо ТМА */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3>2. Трейд-Маркетинг & ТМА (Promo / Bonuses)</h3>
                  <p className="sub">Зарегистрированные промо-акции, ставки бонусов и сети</p>
                </div>
                <span className="pill" id="promoStatus" style={{ background: '#fef3c7', color: '#92400e' }}>0 строк</span>
              </div>
              <div style={{ marginTop: '12px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="file" id="promoFile" accept=".csv,.xlsx,.txt" style={{ flex: 1 }} />
                <button id="dlTplPromo" className="btn btn-sm btn-sub" title="Скачать шаблон CSV">💾 Шаблон CSV</button>
              </div>
            </div>

            {/* 3. ТВ Реклама */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3>3. ТВ-Реклама & Медиа-Давление (TV / TRP)</h3>
                  <p className="sub">Набранные суммарные рейтинги TRP по брендам и месяцам</p>
                </div>
                <span className="pill" id="tvStatus" style={{ background: '#e0e7ff', color: '#3730a3' }}>0 строк</span>
              </div>
              <div style={{ marginTop: '12px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="file" id="tvFile" accept=".csv,.xlsx,.txt" style={{ flex: 1 }} />
                <button id="dlTplTV" className="btn btn-sm btn-sub" title="Скачать шаблон CSV">💾 Шаблон CSV</button>
              </div>
            </div>

            {/* 4. Визиты CRM */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3>4. Визиты Медпредставителей (CRM Visits)</h3>
                  <p className="sub">Подтвержденные визиты к врачам и аптекам в разрезе нанобриков</p>
                </div>
                <span className="pill" id="visitsStatus" style={{ background: '#ccfbf1', color: '#115e59' }}>0 строк</span>
              </div>
              <div style={{ marginTop: '12px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="file" id="visitsFile" accept=".csv,.xlsx,.txt" style={{ flex: 1 }} />
                <button id="dlTplVisits" className="btn btn-sm btn-sub" title="Скачать шаблон CSV">💾 Шаблон CSV</button>
              </div>
            </div>
          </div>

          {/* 5. Рынок и Конкуренты + Внешняя Заболеваемость */}
          <div className="grid two" style={{ marginBottom: '16px' }}>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3>5. Рыночные Данные & Конкуренты (Market)</h3>
                  <p className="sub">Адресный рынок, продажи конкурентов и рыночные ценники</p>
                </div>
                <span className="pill" id="marketStatus" style={{ background: '#fae8ff', color: '#86198f' }}>0 строк</span>
              </div>
              <div style={{ marginTop: '12px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="file" id="marketFile" accept=".csv,.xlsx,.txt" style={{ flex: 1 }} />
                <button id="dlTplMarket" className="btn btn-sm btn-sub" title="Скачать шаблон CSV">💾 Шаблон CSV</button>
              </div>
            </div>

            {/* Интеграция данных заболеваемости */}
            <div className="card" style={{ borderLeft: '4px solid #0284c7' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3>6. Мониторинг Заболеваемости & Сезонные Индексы</h3>
                  <p className="sub">Эпидемиологические бюллетени ОРВИ/Гриппа и Поллиноза (интеграция)</p>
                </div>
                <span className="pill" style={{ background: '#e0f2fe', color: '#0369a1' }}>Внешний источник</span>
              </div>
              <div style={{ marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button id="btnFetchFluSpb" className="btn btn-sm" style={{ background: '#0284c7', color: '#fff' }}>🌐 НИИ Гриппа (influenza.spb.ru)</button>
                <label htmlFor="illnessCsvInput" className="btn btn-sm" style={{ background: '#475569', color: '#fff', cursor: 'pointer' }}>
                  📄 Загрузить CSV
                </label>
                <input type="file" id="illnessCsvInput" accept=".csv,.txt" style={{ display: 'none' }} />
                <button id="btnDownloadIllnessTemplate" className="btn btn-sm btn-sub">💾 Шаблон Заболеваемости</button>
              </div>
            </div>
          </div>

          {/* Сообщение об импорте */}
          <div id="importMessage" className="callout" style={{ marginTop: '12px' }}></div>

          {/* Встроенная БД (IndexedDB) & Сжатые дампы */}
          <div className="card" style={{ marginTop: '16px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ color: '#166534' }}>📦 Легкая БД в Браузере (IndexedDB) & Сжатые Дампы (.pharma_dump)</h3>
                <p className="sub">Оптимизация для миллионов строк: хранение без перегрузки RAM и сохранение в сжатый файл</p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button id="btnSaveDump" className="btn btn-sm" style={{ background: '#16a34a', color: '#fff' }}>💾 Скачать сжатый дамп БД</button>
                <label className="btn btn-sm" style={{ background: '#0284c7', color: '#fff', cursor: 'pointer', margin: 0 }}>
                  📂 Загрузить дамп БД
                  <input type="file" id="importDumpFile" accept=".pharma_dump,.json,.txt" style={{ display: 'none' }} />
                </label>

              </div>
            </div>
            <div id="dbStatsInfo" style={{ marginTop: '12px', fontSize: '13px', color: '#14532d', fontWeight: 550 }}>
              Статус: БД активна (IndexedDB чанкирование). В памяти готово к обработке миллионов строк.
            </div>
          </div>

          {/* Журнал загруженных партиций */}
          <div id="partitionLogArea"></div>

          {/* Предпросмотр всех загруженных датасетов */}
          <div className="card" style={{ marginTop: '16px' }}>
            <h3>Предпросмотр Данных в Памяти Платформы</h3>
            <p className="sub">Первые 15 записей каждого загруженного массива данных</p>

            <div style={{ display: 'flex', gap: '8px', margin: '12px 0 16px', flexWrap: 'wrap' }}>
              <button className="btn btn-sm" style={{ background: '#1e293b', color: '#fff' }} onClick={() => {
                document.querySelectorAll('.data-prev-tab').forEach(t => (t as HTMLElement).style.display = 'none');
                const el = document.getElementById('prev-sales'); if (el) el.style.display = 'block';
              }}>1. Продажи</button>
              <button className="btn btn-sm" style={{ background: '#1e293b', color: '#fff' }} onClick={() => {
                document.querySelectorAll('.data-prev-tab').forEach(t => (t as HTMLElement).style.display = 'none');
                const el = document.getElementById('prev-promo'); if (el) el.style.display = 'block';
              }}>2. Промо ТМА</button>
              <button className="btn btn-sm" style={{ background: '#1e293b', color: '#fff' }} onClick={() => {
                document.querySelectorAll('.data-prev-tab').forEach(t => (t as HTMLElement).style.display = 'none');
                const el = document.getElementById('prev-tv'); if (el) el.style.display = 'block';
              }}>3. ТВ (TRP)</button>
              <button className="btn btn-sm" style={{ background: '#1e293b', color: '#fff' }} onClick={() => {
                document.querySelectorAll('.data-prev-tab').forEach(t => (t as HTMLElement).style.display = 'none');
                const el = document.getElementById('prev-visits'); if (el) el.style.display = 'block';
              }}>4. CRM Визиты</button>
              <button className="btn btn-sm" style={{ background: '#1e293b', color: '#fff' }} onClick={() => {
                document.querySelectorAll('.data-prev-tab').forEach(t => (t as HTMLElement).style.display = 'none');
                const el = document.getElementById('prev-market'); if (el) el.style.display = 'block';
              }}>5. Рынок</button>
            </div>

            <div id="prev-sales" className="data-prev-tab" style={{ display: 'block' }}>
              <h4 style={{ fontSize: '13px', marginBottom: '6px' }}>Таблица Выбытий Продаж (`salesTable`)</h4>
              <div id="salesTableContainer"></div>
            </div>

            <div id="prev-promo" className="data-prev-tab" style={{ display: 'none' }}>
              <h4 style={{ fontSize: '13px', marginBottom: '6px' }}>Таблица Промо-Соглашений (`promoTable`)</h4>
              <div id="promoTableContainer"></div>
            </div>

            <div id="prev-tv" className="data-prev-tab" style={{ display: 'none' }}>
              <h4 style={{ fontSize: '13px', marginBottom: '6px' }}>Таблица ТВ-Рекламы (`tvTable`)</h4>
              <div id="tvTableContainer"></div>
            </div>

            <div id="prev-visits" className="data-prev-tab" style={{ display: 'none' }}>
              <h4 style={{ fontSize: '13px', marginBottom: '6px' }}>Таблица Визитов Медпредов (`visitsTable`)</h4>
              <div id="visitsTableContainer"></div>
            </div>

            <div id="prev-market" className="data-prev-tab" style={{ display: 'none' }}>
              <h4 style={{ fontSize: '13px', marginBottom: '6px' }}>Таблица Рыночного Контекста (`marketTable`)</h4>
              <div id="marketTableContainer"></div>
            </div>
          </div>

          {/* Технический Hub аналитика-разработчика (Worker, IndexedDB, Data Quality) */}
          <div id="dataDevHubArea" style={{ marginTop: '24px' }}></div>
        </section>

        {/* Dedicated Strategic & Technical Sections */}
        <section className="page" id="page-top-roi"></section>
        <section className="page" id="page-exec-brief"></section>
        <section className="page" id="page-regional-deepdive"></section>
        <section className="page" id="page-whatif-scenarios"></section>
        <section className="page" id="page-budget-optimization"></section>
        <section className="page" id="page-scenario-comparison"></section>
        <section className="page" id="page-model-tournament"></section>
        <section className="page" id="page-oos-validation"></section>
        <section className="page" id="page-share-experiment"></section>
        <section className="page" id="page-data-partitions"></section>
        <section className="page" id="page-data-quality"></section>
        <section className="page" id="page-tech-monitor"></section>
        <section className="page" id="page-tech-logs"></section>
        <section className="page" id="page-seasonality-analysis">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', marginTop: '20px' }}>
            <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', background: '#fff', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div>
                <h2>📉 Seasonality Analysis (Рынок, Сезонность & Заболеваемость)</h2>
                <p>STL-декомпозиция спроса, корреляция с индексами Грипп + ОРВИ и сезонная чувствительность промо-акций</p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <select id="seasBrandSelect" style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff' }}></select>
                <select id="illnessRegionSelect" style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff' }}></select>
                <select id="illnessMetricSelect" style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff' }}>
                  <option value="all">Все факторы (Грипп + ОРВИ)</option>
                  <option value="arvi">Только ОРВИ</option>
                  <option value="flu">Только Грипп</option>
                </select>
              </div>
            </div>
            <div id="error-DataPrep" style={{ display: 'none' }}></div>
            <div id="seasKpis" style={{ marginBottom: '16px' }}></div>
            <div id="error-KPIs" style={{ display: 'none' }}></div>
            <div id="illnessStatusBox" style={{ marginBottom: '16px', display: 'none' }}></div>
            <div id="error-StatusBox" style={{ display: 'none' }}></div>
            <div className="grid two" style={{ marginBottom: '16px' }}>
              <div className="card">
                <h3>📈 STL Декомпозиция спроса (Тренд, Сезонность, Остаток)</h3>
                <div id="error-STLChart" style={{ display: 'none' }}></div>
                <div className="chart-container" style={{ position: 'relative', height: '240px', maxHeight: '240px', width: '100%', overflow: 'hidden' }}><canvas id="stlCanvas"></canvas></div>
              </div>
              <div className="card">
                <h3>🦠 Корреляция с заболеваемостью (Грипп + ОРВИ)</h3>
                <div id="error-IllnessChart" style={{ display: 'none' }}></div>
                <div className="chart-container" style={{ position: 'relative', height: '240px', maxHeight: '240px', width: '100%', overflow: 'hidden' }}><canvas id="illnessCanvas"></canvas></div>
              </div>
            </div>
            <div className="grid two" style={{ marginBottom: '16px' }}>
              <div className="card">
                <h3>🎯 Сезонная эластичность промо-скидок</h3>
                <div id="error-PromoChart" style={{ display: 'none' }}></div>
                <div className="chart-container" style={{ position: 'relative', height: '240px', maxHeight: '240px', width: '100%', overflow: 'hidden' }}><canvas id="promoSeasonalCanvas"></canvas></div>
              </div>
              <div className="card">
                <h3>💡 Рыночные инсайты & Эпидемический прогноз (Грипп + ОРВИ)</h3>
                <div id="error-Insights" style={{ display: 'none' }}></div>
                <div id="seasInsightsBox" style={{ fontSize: '13px', lineHeight: '1.6', color: '#334155', padding: '8px' }}></div>
              </div>
            </div>
            <div className="card">
              <h3>📊 Детальная таблица сезонных коэффициентов</h3>
              <div id="error-Table" style={{ display: 'none' }}></div>
              <div className="table-wrap" style={{ marginTop: '8px' }} id="seasTable"></div>
            </div>
          </div>
        </section>
        <section className="page" id="page-budget-roi"></section>

        {/* 11. Роли & JTBD */}
        <section className="page" id="page-roles">
          <div id="rolesJtbdSectionRoot"></div>
        </section>
        </main>
      </div>

      {/* Модальное окно Drill-Down */}
      <div id="drilldownModalRoot" style={{ display: 'none' }}></div>

      {/* Оверлей полноэкранной презентации Pitch Deck */}
      <div id="pitchDeckRoot" style={{ display: 'none' }}></div>

      {/* Диалог редактора аннотаций */}
      <div id="annotationModalRoot" style={{ display: 'none' }}></div>
    </div>
    </ErrorBoundary>
  );
}
