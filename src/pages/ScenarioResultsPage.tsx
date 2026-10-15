import { useCallback, useEffect, useState } from 'react';
import { CurrentScenarioResultService, type ScenarioResultWithFreshness } from '../application/services/currentScenarioResultService';
import './model-runs-freshness.css';

const service = new CurrentScenarioResultService();
const STATUS: Record<ScenarioResultWithFreshness['freshness'], { label: string; className: string }> = {
  fresh: { label: 'Актуален', className: 'is-fresh' },
  stale: { label: 'Устарел', className: 'is-stale' },
  legacy: { label: 'Без версии', className: 'is-legacy' },
  unverifiable: { label: 'Не проверен', className: 'is-unknown' },
};
const dateLabel = (value?: string) => {
  if (!value) return 'Дата не указана';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};
const textValue = (value: unknown, fallback = '—') => typeof value === 'string' && value.trim() ? value : fallback;

export default function ScenarioResultsPage({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<ScenarioResultWithFreshness[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const reload = useCallback(() => setRefresh(n => n + 1), []);

  useEffect(() => {
    let current = true;
    setLoading(true); setError(null);
    service.listForProject(projectId).then(value => { if (current) setItems(value); })
      .catch(reason => { if (current) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [projectId, refresh]);

  const counts = items.reduce((result, item) => { result[item.freshness] += 1; return result; }, { fresh: 0, stale: 0, legacy: 0, unverifiable: 0 });
  return <main className="pm-page pm-model-freshness" aria-labelledby="pm-scenario-results-title">
    <header className="pm-page-header">
      <div><p className="pm-eyebrow">PHARMAMIX LAB / SCENARIO GOVERNANCE</p><h1 id="pm-scenario-results-title">Сценарии и актуальность</h1><p>История сохранённых сценариев с проверкой версии исходных данных.</p></div>
      <button type="button" className="pm-button" onClick={reload} disabled={loading}>{loading ? 'Загрузка…' : 'Обновить'}</button>
    </header>
    {loading && <div className="pm-state" role="status">Загружаем историю сценариев…</div>}
    {!loading && error && <section className="pm-state pm-state-error" role="alert"><strong>Не удалось загрузить историю сценариев</strong><p>{error}</p><button className="pm-button" onClick={reload}>Повторить</button></section>}
    {!loading && !error && <>
      <section className="pm-freshness-summary" aria-label="Сводка актуальности сценариев">
        <article><strong>{items.length}</strong><span>Всего сценариев</span></article>
        <article><strong>{counts.fresh}</strong><span>Актуальны</span></article>
        <article><strong>{counts.stale}</strong><span>Устарели</span></article>
        <article><strong>{counts.legacy + counts.unverifiable}</strong><span>Нельзя подтвердить</span></article>
      </section>
      {items.length === 0 ? <section className="pm-state"><strong>Сохранённых сценариев пока нет</strong><p>Результаты появятся здесь после подключения сценарных расчётов к новому сервису сохранения. Экран не запускает сценарии и не пересчитывает результаты.</p></section> : <section className="pm-panel pm-freshness-panel"><div className="pm-panel-heading"><div><h2>История сценариев</h2><p>Статус рассчитан относительно активной версии набора данных проекта.</p></div></div>
        <div className="pm-freshness-list">{items.map(item => <article className="pm-freshness-item" key={item.result.id}>
          <div className="pm-freshness-item-head"><div><h3>{textValue(item.result.scenarioId, 'Сценарий без названия')}</h3><p>{dateLabel(item.result.createdAt)} · ID: {item.result.id}</p></div><span className={`pm-freshness-badge ${STATUS[item.freshness].className}`}>{STATUS[item.freshness].label}</span></div>
          <div className="pm-freshness-details"><span>Версия расчёта: <strong>{textValue(item.result.datasetVersion)}</strong></span><span>Проект: <strong>{textValue(item.result.projectId)}</strong></span><span>Алгоритм: <strong>{textValue(item.result.algorithmVersion)}</strong></span></div>
          <p className="pm-freshness-reason">{item.reason}</p>
        </article>)}</div>
      </section>}
      <p className="pm-freshness-disclaimer">Экран показывает статус версии, но не запускает повторный расчёт. Результаты без версии данных нельзя считать подтверждённо актуальными.</p>
    </>}
  </main>;
}
