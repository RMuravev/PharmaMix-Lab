import { useEffect, useRef, useState } from 'react';
import { ActiveDatasetSnapshotRepository } from '../infrastructure/indexeddb/activeDatasetSnapshotRepository';
import { alignPanelSources } from '../application/services/panelSourceAlignmentService';
import type { CarryoverCandidate } from '../application/services/marketingCarryoverOptimizationService';
import type { HillStabilityReport } from '../application/services/marketingHillStabilityService';
import type { HillCvResult } from '../application/services/marketingHillCvService';
import { prepareActiveSnapshotMmm } from '../application/services/activeSnapshotTemporalDatasetService';
import { assertExpectedDatasetVersion } from '../application/services/modelRunPersistenceService';
import { isCurrentWorkerRun } from '../application/services/workerRunGuard';
import { compareTemporalModels, type TemporalModelComparison } from '../application/services/temporalModelComparisonService';
import type { TemporalDatasetResult } from '../application/services/temporalModelDatasetService';
import { diagnoseMmmDataset, type MmmDiagnosticsReport } from '../application/services/mmmDiagnosticsService';
import { rollingMmmStability, type MmmRollingCvReport } from '../application/services/mmmRollingCvService';

const fmt = (value: number | null) => value === null || !Number.isFinite(value) ? '—' : value.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
const monthsBetween = (start: string, end: string) => { const out: string[] = []; let [y,m] = start.split('-').map(Number); const [ey,em] = end.split('-').map(Number); while (y < ey || (y === ey && m <= em)) { out.push(`${y}-${String(m).padStart(2,'0')}`); m++; if (m === 13) { y++; m = 1; } } return out; };
export default function TemporalMmmComparisonPage({ projectId }: { projectId: string }) {
  const [data, setData] = useState<TemporalDatasetResult | null>(null);
  const [result, setResult] = useState<TemporalModelComparison | null>(null);
  const [error, setError] = useState('');
  const [testStart, setTestStart] = useState('2025-07');
  const [testEnd, setTestEnd] = useState('2025-12');
  const [snapshotInfo, setSnapshotInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const workerRef = useRef<Worker | null>(null);
  const runTokenRef = useRef(0);
  useEffect(() => { setData(null); setDiagnostics(null); setError(''); setDeclaredCalendar(false); return () => { runTokenRef.current += 1; workerRef.current?.terminate(); workerRef.current = null; }; }, [projectId]);
  function cancelOptimization() { runTokenRef.current += 1; workerRef.current?.terminate(); workerRef.current = null; setLoading(false); setProgress('Расчёт отменён.'); }
  const [stability, setStability] = useState<HillStabilityReport | null>(null);
  const [hillResult, setHillResult] = useState<HillCvResult | null>(null);
  const [optimized, setOptimized] = useState<CarryoverCandidate | null>(null);
  const [diagnostics, setDiagnostics] = useState<MmmDiagnosticsReport | null>(null);
  const [declaredCalendar, setDeclaredCalendar] = useState(false);
  const [rolling, setRolling] = useState<MmmRollingCvReport | null>(null);
  const [lambdas, setLambdas] = useState('0.01, 0.1, 1, 10, 100');
  useEffect(() => { if (!data) { setDiagnostics(null); setRolling(null); return; } const periods = [...data.train, ...data.test].map(r => r.period).sort(); const first = periods[0]; setDiagnostics(diagnoseMmmDataset(data, declaredCalendar && first ? monthsBetween(first, monthsBetween(first, testStart).slice(-2)[0] || first) : undefined, declaredCalendar ? monthsBetween(testStart, testEnd) : undefined)); setRolling(rollingMmmStability(data)); }, [data, testStart, testEnd, declaredCalendar]);
  async function load(file?: File) {
    setResult(null); setError(''); setData(null); setDiagnostics(null); setRolling(null);
    if (!file) return;
    try {
      const raw: unknown = JSON.parse(await file.text());
      if (!raw || typeof raw !== 'object') throw new Error('Ожидается JSON-объект подготовленной выборки.');
      const candidate = raw as Partial<TemporalDatasetResult>;
      if (!Array.isArray(candidate.train) || !Array.isArray(candidate.test) || !Array.isArray(candidate.featureNames) || !Array.isArray(candidate.errors) || !Array.isArray(candidate.warnings)) throw new Error('JSON должен содержать train, test, featureNames, errors и warnings.');
      setData(candidate as TemporalDatasetResult);
      setDeclaredCalendar(false);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  async function loadActive() {
    setError(''); setResult(null); setData(null); setDiagnostics(null); setRolling(null); setSnapshotInfo(''); setOptimized(null); setHillResult(null); setLoading(true);
    try {
      const snapshot = await new ActiveDatasetSnapshotRepository().getForProject(projectId);
      const prepared = prepareActiveSnapshotMmm(snapshot, { testStart, testEnd });
      if (prepared.errors.length) throw new Error(prepared.errors.join(' | '));
      setData(prepared.dataset);
      // Active snapshot currently exposes no explicit source/panel scope metadata;
      // never infer the calendar start from observed rows.
      setDeclaredCalendar(false);
      setSnapshotInfo(`Версия: ${prepared.datasetVersion} · Панелей: ${prepared.panelCount} · Несопоставленных промо: ${prepared.unmatchedPromo}. ${prepared.warnings.join(' ')}`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }
  async function optimizeActive(action: 'optimize' | 'stability' = 'optimize') {
    setError(''); if(action === 'optimize') { setResult(null); setData(null); setOptimized(null); setHillResult(null); } else setStability(null); setLoading(true);
    try {
      const snapshot = await new ActiveDatasetSnapshotRepository().getForProject(projectId);
      if (snapshot.legacy || !snapshot.datasetVersion) throw new Error('Нужна опубликованная версия данных.');
      const aligned = alignPanelSources({sales:snapshot.salesFacts,promo:snapshot.promoFacts,tv:snapshot.tvFacts,visits:snapshot.visitFacts,market:snapshot.marketFacts});
      if (aligned.errors.length) throw new Error(aligned.errors.join(' | '));
      const grid = lambdas.split(',').map(v=>Number(v.trim()));
      if (lambdas.split(',').some(v=>!v.trim())) throw new Error('Пустое значение lambda.');
      if (workerRef.current) throw new Error('Оптимизация уже выполняется.');
      const worker = new Worker(new URL('../workers/marketingOptimization.worker.ts', import.meta.url), { type: 'module' });
      const runToken = ++runTokenRef.current;
      workerRef.current = worker;
      setProgress('Подготовка поиска…');
      worker.onmessage = async (event: MessageEvent) => {
        if (!isCurrentWorkerRun(workerRef.current, worker, runTokenRef.current, runToken)) return;
        const msg = event.data;
        if (msg.type === 'progress') { setProgress(`${msg.percent}% · ${msg.phase}${typeof msg.completed === "number" && typeof msg.total === "number" ? ` (${msg.completed}/${msg.total})` : ""}`); return; }
        if (msg.type === 'error') {
          if (!isCurrentWorkerRun(workerRef.current, worker, runTokenRef.current, runToken)) return;
          runTokenRef.current += 1;
          worker.terminate(); workerRef.current = null; setLoading(false); setProgress('');
          setError(msg.message);
          return;
        }
        try {
          const current = await new ActiveDatasetSnapshotRepository().getForProject(projectId);
          if (!current.datasetVersion) throw new Error('Активная версия данных исчезла во время расчёта.');
          assertExpectedDatasetVersion(snapshot.datasetVersion ?? undefined, current.datasetVersion);
          // The component may have unmounted, the project may have changed, or a
          // newer worker may have started while the IndexedDB freshness check awaited.
          if (!isCurrentWorkerRun(workerRef.current, worker, runTokenRef.current, runToken)) return;
        } catch (error) {
          if (!isCurrentWorkerRun(workerRef.current, worker, runTokenRef.current, runToken)) return;
          worker.terminate(); workerRef.current = null; setLoading(false);
          setError(error instanceof Error ? error.message : String(error));
          setProgress('Расчёт отклонён как устаревший.');
          return;
        }
        if (!isCurrentWorkerRun(workerRef.current, worker, runTokenRef.current, runToken)) return;
        worker.terminate(); workerRef.current = null; setLoading(false);
        if (msg.type === 'stability-done') { setStability(msg.stability); setProgress('Проверка устойчивости завершена.'); return; }
        if (msg.type === 'done') {
          setData(msg.dataset); setOptimized(msg.search.best); setHillResult(msg.hill);
          setSnapshotInfo(`Версия: ${snapshot.datasetVersion}. Оптимизировано на train: ${msg.search.evaluated} конфигураций, CV WAPE ${fmt(msg.search.best.cvWapePct)}%. ${aligned.warnings.join(' ')}`);
          setProgress('Оптимизация завершена.');
        }
      };
      worker.onerror = (event) => {
        if (!isCurrentWorkerRun(workerRef.current, worker, runTokenRef.current, runToken)) return;
        worker.terminate(); workerRef.current = null; setLoading(false); setProgress('');
        setError(`Ошибка фонового расчёта: ${event.message || 'неизвестная ошибка'}`);
      };
      worker.postMessage({ action, panels: aligned.panels, testStart, testEnd, lambdas: grid });
    } catch(e) {setError(e instanceof Error ? e.message : String(e));}
    finally { if (!workerRef.current) setLoading(false); }
  }
  function run() {
    if (!data) return;
    setError(''); setResult(null);
    try {
      const grid = lambdas.split(',').map(v => Number(v.trim()));
      if (lambdas.split(',').some(v => !v.trim())) throw new Error('Пустое значение lambda.');
      setResult(compareTemporalModels(data, grid));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  return <main className="pm-page" aria-labelledby="temporal-mmm-title">
    <header className="pm-page-header"><div><p className="pm-eyebrow">PHARMAMIX LAB / MMM</p><h1 id="temporal-mmm-title">OLS и Ridge · временная валидация</h1><p>Сравнение на едином отложенном периоде. Подбор Ridge проводится только внутри train.</p></div></header>
    <section className="pm-panel" style={{padding:24,marginBottom:20}}><h2>Подготовленная выборка</h2><p>Можно автоматически собрать выборку из активной версии проекта или загрузить JSON результата <code>prepareTemporalModelDataset</code> (train, test, featureNames, trainMean, trainStd, errors, warnings). Для автоматической подготовки используются все пять источников IndexedDB; отсутствие Promo и Medical Rep Visits внутри панели означает нулевое воздействие.</p>
      <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center',marginBottom:16}}>
        <label>Начало OOS <input type="month" value={testStart} onChange={e=>setTestStart(e.target.value)}/></label>
        <label>Конец OOS <input type="month" value={testEnd} onChange={e=>setTestEnd(e.target.value)}/></label>
        <button className="pm-button" disabled={loading} onClick={()=>void loadActive()}>{loading ? 'Загрузка…' : 'Подготовить из активного проекта'}</button>
        <button className="pm-button" disabled={loading} onClick={()=>void optimizeActive()}>Подобрать лаги, adstock и Hill (CV)</button>
        <button className="pm-button" disabled={loading} onClick={()=>void optimizeActive('stability')}>Проверить устойчивость Hill</button>
        {loading && workerRef.current && <button type="button" onClick={cancelOptimization}>Отменить расчёт</button>}
      </div>
      {progress && <p role="status" aria-live="polite">{progress}</p>}
      {snapshotInfo && <p role="status">{snapshotInfo}</p>}
      {optimized && <p role="status"><strong>Подобранные драйверы:</strong> {(['tvTrp','weightedVisits','bonusEstimateRub'] as const).map(k=>`${k}: лаг ${optimized.settings[k].lag}, decay ${optimized.settings[k].decay}`).join(' · ')}; Ridge λ {optimized.lambda}. Подбор выполнен только на train, внешний OOS не использовался для выбора.</p>}
      {hillResult && <p role="status"><strong>Hill (train-only CV):</strong> {(['tvTrp','weightedVisits','bonusEstimateRub'] as const).map(k=>`${k}: EC50 ${fmt(hillResult.settings[k].halfSaturation)}, slope ${hillResult.settings[k].slope}`).join(' · ')}. CV WAPE {fmt(hillResult.cvWapePct)}%, оценок {hillResult.evaluations}. Последовательный подбор, глобальный оптимум не гарантирован.</p>}
      {stability && <section aria-label="Устойчивость Hill"><h3>Устойчивость Hill по обучающим окнам</h3><p>Успешных окон: {stability.windows.length}. Внешний OOS не использовался.</p><table><thead><tr><th>Драйвер</th><th>EC50 max/min</th><th>Разброс slope</th><th>Эвристическая устойчивость</th></tr></thead><tbody>{stability.drivers.map(d=><tr key={d.driver}><td>{d.driver}</td><td>{fmt(d.ec50Ratio)}</td><td>{fmt(d.slopeRange)}</td><td>{d.stable?'Да':'Нет / недостаточно данных'}</td></tr>)}</tbody></table>{stability.warnings.map((w,i)=><p key={i} role="status">{w}</p>)}</section>}
      <label>JSON-файл <input type="file" accept=".json,application/json" onChange={e => void load(e.target.files?.[0])}/></label>
      {data && <p role="status">Train: {data.train.length} · Test: {data.test.length} · Факторов: {data.featureNames.length}</p>}
      {diagnostics && <section aria-label="Диагностика MMM" style={{marginTop:16}}><h3>Диагностика временной выборки</h3><p>{diagnostics.valid ? 'Базовые проверки пройдены' : 'Есть блокирующие проблемы выборки'}. Покрытие: {diagnostics.coverageStatus === 'known' ? `Train ${fmt(diagnostics.trainCoveragePct)}% · Test ${fmt(diagnostics.testCoveragePct)}%` : 'unknown — expected calendar не объявлен'} · Пересечение месяцев: {diagnostics.overlapPeriods.length || 'нет'}.</p><p>Стабильность среднего test/train: {fmt(diagnostics.trainTestMeanRatio)}{diagnostics.trainTestMeanRatio === null ? '' : '×'}</p><table><thead><tr><th>Фактор</th><th>VIF</th><th>Статус</th></tr></thead><tbody>{Object.entries(diagnostics.vif).map(([name,value])=><tr key={name}><td>{name}</td><td>{fmt(value)}</td><td>{!Number.isFinite(value) || value > 10 ? 'Критично' : value > 5 ? 'Риск' : 'OK'}</td></tr>)}</tbody></table>{[...diagnostics.leakage,...diagnostics.warnings,...diagnostics.sanity].map((w,i)=><p key={i} role="status">{w}</p>)}<details><summary>Ограничения</summary><ul>{diagnostics.limitations.map(x=><li key={x}>{x}</li>)}</ul></details></section>}
      {rolling && <section aria-label="Rolling stability" style={{marginTop:16}}><h3>Expanding-window stability</h3><p>Folds: {rolling.folds.length}. Это leakage-safe диагностический proxy; модель на каждом fold не переобучается.</p>{rolling.warnings.map(w=><p role="status" key={w}>{w}</p>)}<table><thead><tr><th>Train до</th><th>Test</th><th>Train N</th><th>Test N</th><th>Среднее test/train</th></tr></thead><tbody>{rolling.folds.slice(-12).map(f=><tr key={f.testPeriod}><td>{f.trainEnd}</td><td>{f.testPeriod}</td><td>{f.trainRows}</td><td>{f.testRows}</td><td>{fmt(f.meanRatio)}</td></tr>)}</tbody></table></section>}
      <p><label>Сетка lambda <input style={{marginLeft:12,minWidth:260}} value={lambdas} onChange={e=>setLambdas(e.target.value)}/></label></p>
      <button className="pm-button" disabled={!data} onClick={run}>Обучить и сравнить</button>
    </section>
    {error && <section className="pm-state pm-state-error" role="alert">{error}</section>}
    {result && <section className="pm-panel" style={{padding:24}}><h2>OOS: сравнение моделей</h2><p>Выбранная Ridge λ: <strong>{result.ridge.bestLambda}</strong></p>
      <div style={{overflowX:'auto'}}><table style={{width:'100%',textAlign:'left'}}><thead><tr><th>Модель</th><th>WAPE, %</th><th>RMSE, ₽</th><th>MAE, ₽</th><th>MAPE, %</th><th>R²</th></tr></thead><tbody>{[result.ols,result.ridge.finalFit].filter((v):v is NonNullable<typeof v>=>v!==null).map(f=><tr key={f.model}><td>{f.model.toUpperCase()}</td><td>{fmt(f.diagnostics.wapePct)}</td><td>{fmt(f.diagnostics.rmse)}</td><td>{fmt(f.diagnostics.mae)}</td><td>{fmt(f.diagnostics.mapePct)}</td><td>{fmt(f.diagnostics.rSquared)}</td></tr>)}</tbody></table></div>
      <p>Порядок по WAPE: {result.ranking.map(x=>x.model.toUpperCase()).join(' → ')}</p>
      <h3>Внутренняя CV Ridge</h3><div style={{overflowX:'auto'}}><table style={{width:'100%',textAlign:'left'}}><thead><tr><th>λ</th><th>CV WAPE, %</th><th>CV RMSE, ₽</th><th>Статус</th></tr></thead><tbody>{result.ridge.candidates.map(c=><tr key={c.lambda}><td>{c.lambda}</td><td>{fmt(c.pooledWapePct)}</td><td>{fmt(c.pooledRmse)}</td><td>{c.failed || 'OK'}</td></tr>)}</tbody></table></div>
      <ul>{result.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul>
    </section>}
  </main>;
}
