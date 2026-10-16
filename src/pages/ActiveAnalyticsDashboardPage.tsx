import { useCallback, useEffect, useState } from 'react';
import { ActiveDatasetDashboardQueryService } from '../application/services/activeDatasetDashboardQueryService';
import type { DatasetAnalyticsSummary } from '../application/services/activeDatasetAnalyticsService';
import './active-analytics-dashboard.css';

const query = new ActiveDatasetDashboardQueryService();
const fmtNumber = (value: number|null) => value===null?'Недоступно':new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value);
const fmtMoney = (value: number|null) => value===null?'Недоступно':new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value);

const SOURCE_LABELS: Record<keyof DatasetAnalyticsSummary['sourceRows'], string> = {
  salesFacts: 'Продажи аптек', marketFacts: 'Рыночные данные', promoFacts: 'Промо', tvFacts: 'TV TRP', visitFacts: 'Визиты медпредставителей',
};
const AVAILABILITY_KEYS={salesFacts:'sales',marketFacts:'market',promoFacts:'promo',tvFacts:'tv',visitFacts:'visits'} as const;

export default function ActiveAnalyticsDashboardPage({ projectId }: { projectId: string }) {
  const [summary, setSummary] = useState<DatasetAnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const reload = useCallback(() => setRefresh(n => n + 1), []);

  useEffect(() => {
    let current = true;
    setLoading(true); setError(null);
    query.execute(projectId).then(value => { if (current) setSummary(value); })
      .catch(reason => { if (current) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [projectId, refresh]);

  return <main className="pm-page pm-analytics" aria-labelledby="pm-analytics-title">
    <header className="pm-page-header pm-analytics-header">
      <div><p className="pm-eyebrow">PHARMAMIX LAB / ACTIVE DATASET</p><h1 id="pm-analytics-title">Коммерческая аналитика</h1><p>Сводные показатели из согласованного снимка пяти источников.</p></div>
      <button type="button" className="pm-button" onClick={reload} disabled={loading}>{loading ? 'Загрузка…' : 'Обновить'}</button>
    </header>
    {loading && <div className="pm-state" role="status">Загружаем активный набор данных…</div>}
    {!loading && error && <section className="pm-state pm-state-error" role="alert"><strong>Не удалось загрузить аналитику</strong><p>{error}</p><button className="pm-button" onClick={reload}>Повторить</button></section>}
    {!loading && summary && <>
      <div className="pm-analytics-meta"><span className="pm-data-mode">Активная версия</span><span>Проект: <strong>{summary.projectId}</strong></span><span>Версия: <strong>{summary.datasetVersion ?? 'не назначена'}</strong></span></div>
      <section className="pm-analytics-kpis" aria-label="Ключевые показатели">
        <article className="pm-analytics-kpi"><span>Выручка аптечных продаж</span><strong>{fmtMoney(summary.salesRevenueRub)}</strong><small>{fmtNumber(summary.salesUnits)} шт.</small></article>
        <article className="pm-analytics-kpi"><span>Адресный рынок</span><strong>{fmtMoney(summary.marketRevenueRub)}</strong><small>{fmtNumber(summary.marketUnits)} шт.</small></article>
        <article className="pm-analytics-kpi"><span>Оценка промобонуса</span><strong>{summary.accruedBonusEstimateRub===null?'Недоступно':fmtMoney(summary.accruedBonusEstimateRub)}</strong><small>{summary.metricCoverage.promo?.status==='partial'?`Частичный итог: ${summary.metricCoverage.promo.coveredPeriods.join(', ')}`:summary.accruedBonusEstimateRub===null?'Источник Promo не предоставлен':'Расчётная оценка, не подтверждение фактического начисления'}</small></article>
        <article className="pm-analytics-kpi"><span>TV TRP</span><strong>{fmtNumber(summary.tvTrp)}</strong><small>Сумма строк TRP, не охват аудитории</small></article>
        <article className="pm-analytics-kpi"><span>Взвешенные визиты</span><strong>{fmtNumber(summary.weightedVisits)}</strong><small>Сумма по загруженным строкам</small></article>
      </section>
      <section className="pm-panel pm-analytics-panel"><div className="pm-panel-heading"><div><h2>Полнота источников</h2><p>Количество строк в одном согласованном снимке</p></div></div>
        <div className="pm-source-list">{(Object.keys(SOURCE_LABELS) as Array<keyof typeof SOURCE_LABELS>).map(key => {const availability=summary.sourceAvailability?.[AVAILABILITY_KEYS[key]];return <div className="pm-source-row" key={key}><span>{SOURCE_LABELS[key]}</span><strong>{fmtNumber(summary.sourceRows[key])}</strong><span className={availability?.status==='LOADED' ? 'pm-source-status is-loaded' : 'pm-source-status'}>{availability?.status??'UNVERIFIED'}{availability?.coverage?` · ${availability.coverage.startPeriod}–${availability.coverage.endPeriod}`:''}</span></div>;})}</div>
      </section>
      {(summary.sourceWarnings.length > 0) && <section className="pm-panel pm-analytics-panel"><div className="pm-panel-heading"><div><h2>Предупреждения качества данных</h2><p>Проверьте источники перед интерпретацией результатов</p></div></div><ul className="pm-analytics-warnings">{summary.sourceWarnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></section>}
      <p className="pm-analytics-footnote">Промобонус оценивается как ставка бонуса × сопоставленная выручка по периоду, сети, бренду и SKU. Для управленческих выводов проверьте расчёт с фактически начисленными суммами.</p>
    </>}
  </main>;
}
