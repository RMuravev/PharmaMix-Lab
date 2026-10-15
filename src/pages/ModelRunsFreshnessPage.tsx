import { useCallback, useEffect, useState } from 'react';
import { ModelRunFreshnessService, type ModelRunWithFreshness } from '../application/services/modelRunFreshnessService';
import './model-runs-freshness.css';

const service = new ModelRunFreshnessService();
const STATUS: Record<ModelRunWithFreshness['freshness'], { label: string; className: string }> = {
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

export default function ModelRunsFreshnessPage({ projectId }: { projectId: string }) {
  const [runs, setRuns] = useState<ModelRunWithFreshness[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const reload = useCallback(() => setRefresh(n => n + 1), []);

  useEffect(() => {
    let current = true;
    setLoading(true); setError(null);
    service.listForProject(projectId).then(value => { if (current) setRuns(value); })
      .catch(reason => { if (current) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [projectId, refresh]);

  const counts = runs.reduce((result, item) => { result[item.freshness] += 1; return result; }, { fresh: 0, stale: 0, legacy: 0, unverifiable: 0 });
  return <main className="pm-page pm-model-freshness" aria-labelledby="pm-model-freshness-title">
    <header className="pm-page-header">
      <div><p className="pm-eyebrow">PHARMAMIX LAB / MODEL GOVERNANCE</p><h1 id="pm-model-freshness-title">Модели и актуальность результатов</h1><p>Проверка версии исходных данных для сохранённых запусков моделей.</p></div>
      <button type="button" className="pm-button" onClick={reload} disabled={loading}>{loading ? 'Загрузка…' : 'Обновить'}</button>
    </header>
    {loading && <div className="pm-state" role="status">Загружаем историю расчётов…</div>}
    {!loading && error && <section className="pm-state pm-state-error" role="alert"><strong>Не удалось загрузить историю моделей</strong><p>{error}</p><button className="pm-button" onClick={reload}>Повторить</button></section>}
    {!loading && !error && <>
      <section className="pm-freshness-summary" aria-label="Сводка актуальности">
        <article><strong>{runs.length}</strong><span>Всего запусков</span></article>
        <article><strong>{counts.fresh}</strong><span>Актуальны</span></article>
        <article><strong>{counts.stale}</strong><span>Устарели</span></article>
        <article><strong>{counts.legacy + counts.unverifiable}</strong><span>Нельзя подтвердить</span></article>
      </section>
      {runs.length === 0 ? <section className="pm-state"><strong>Сохранённых запусков пока нет</strong><p>Когда расчёты моделей будут сохраняться в modelRuns, они появятся здесь. Этот экран не запускает модели и не пересчитывает результаты.</p></section> : <section className="pm-panel pm-freshness-panel"><div className="pm-panel-heading"><div><h2>История запусков</h2><p>Статус рассчитывается относительно активной версии данных проекта.</p></div></div>
        <div className="pm-freshness-list">{runs.map(item => <article className="pm-freshness-item" key={item.run.id}>
          <div className="pm-freshness-item-head"><div><h3>{textValue(item.run.modelType, 'Модель без типа')}</h3><p>{dateLabel(item.run.createdAt)} · ID: {item.run.id}</p></div><span className={`pm-freshness-badge ${STATUS[item.freshness].className}`}>{STATUS[item.freshness].label}</span></div>
          <div className="pm-freshness-details"><span>Версия расчёта: <strong>{textValue(item.run.datasetVersion)}</strong></span><span>Статус запуска: <strong>{textValue(item.run.status)}</strong></span><span>Сохранено результатов: <strong>{item.results.length}</strong></span></div>
          <p className="pm-freshness-reason">{item.reason}</p>
          {item.results.some(result => result.datasetVersion && item.run.datasetVersion && result.datasetVersion !== item.run.datasetVersion) && <p className="pm-freshness-warning">Внимание: версия одного или нескольких результатов отличается от версии запуска.</p>}
        </article>)}</div>
      </section>}
      <p className="pm-freshness-disclaimer">Статус помогает обнаружить потенциально устаревшие результаты, но пока не блокирует их отображение в старых экранах. Запуски без сохранённой версии не считаются актуальными автоматически.</p>
    </>}
  </main>;
}
