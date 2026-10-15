import './overview-page.css';
import { useCallback, useEffect, useState } from 'react';
import { OverviewQueryService, type OverviewViewData } from '../application/services/overviewQueryService';

const queryService = new OverviewQueryService();
const DEFAULT_PROJECT = 'default';

function money(value: number | null | undefined): string {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value ?? 0);
}
function number(value: number | null | undefined): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value ?? 0);
}

/** New isolated Overview page; data access and aggregation stay in application services. */
export default function OverviewPage({ projectId = DEFAULT_PROJECT }: { projectId?: string }) {
  const [data, setData] = useState<OverviewViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const reload = useCallback(() => setRefresh(value => value + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    queryService.execute(projectId)
      .then(result => { if (active) setData(result); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId, refresh]);

  return <main className="pm-page" aria-labelledby="pm-overview-title">
    <header className="pm-page-header">
      <div><p className="pm-eyebrow">PHARMAMIX LAB / ANALYTICS</p><h1 id="pm-overview-title">Обзор продаж</h1><p>Показатели загружаются из сохранённого агрегата, а не пересчитываются в компоненте.</p></div>
      <button type="button" className="pm-button" onClick={reload} disabled={loading}>{loading ? 'Загрузка…' : 'Обновить'}</button>
    </header>
    {loading && <div className="pm-state" role="status">Загружаем агрегаты проекта…</div>}
    {!loading && error && <section className="pm-state pm-state-error" role="alert"><strong>Данные обзора недоступны</strong><p>{error}</p><p>Проверьте, что импорт продаж завершён и нормализованный набор опубликован для проекта «{projectId}».</p><button className="pm-button" onClick={reload}>Повторить</button></section>}
    {!loading && !error && data && <>
      <section className="pm-kpi-grid" aria-label="Ключевые показатели">
        <article className="pm-kpi"><span>Выручка</span><strong>{money(data.aggregate.metrics.revenueRub)}</strong><small>Рубли</small></article>
        <article className="pm-kpi"><span>Продажи, шт.</span><strong>{number(data.aggregate.metrics.units)}</strong><small>Единицы</small></article>
        <article className="pm-kpi"><span>Бренды</span><strong>{number(data.aggregate.metrics.brands)}</strong><small>В выбранном наборе</small></article>
        <article className="pm-kpi"><span>Месяцы</span><strong>{number(data.aggregate.metrics.periods)}</strong><small>Периоды с данными</small></article>
      </section>
      <section className="pm-panel"><div className="pm-panel-heading"><div><h2>Продажи по месяцам</h2><p>Выручка и количество единиц по нормализованным фактам</p></div><span className="pm-status">Агрегат {data.aggregate.status === 'ready' ? 'актуален' : 'устарел'}</span><span className={data.legacyData ? "pm-data-mode pm-data-mode-legacy" : "pm-data-mode"}>{data.legacyData ? "Legacy-данные" : "Активная версия"}</span></div>
        {data.aggregate.series?.byPeriod && Array.isArray(data.aggregate.series.byPeriod) ? <div className="pm-table-scroll"><table className="pm-table"><thead><tr><th>Месяц</th><th>Бренд</th><th>Продажи, шт.</th><th>Выручка</th></tr></thead><tbody>{(data.aggregate.series.byPeriod as Array<{period:string;units:number;revenueRub:number}>).map((row) => <tr key={row.period}><td>{row.period}</td><td>Все бренды</td><td>{number(row.units)}</td><td>{money(row.revenueRub)}</td></tr>)}</tbody></table></div> : <p className="pm-empty">В сохранённом агрегате нет детализации по месяцам.</p>}
        <footer className="pm-footnote">Источник: {number(data.sourceRows)} нормализованных строк · версия данных: {data.aggregate.datasetVersion} · алгоритм: {data.aggregate.algorithmVersion}</footer>
      </section>
    </>}
  </main>;
}
