import { saveEventStudyDiagnostics } from '../infrastructure/indexeddb/eventStudyDiagnosticsRepository';
import { useEffect, useMemo, useState } from 'react';
import { saveAnalysisResult } from '../infrastructure/indexeddb/analysisRegistryRepository';
import { matchedLiftToRegistryRecord } from '../application/services/causalRegistryExportService';
import { ActiveDatasetSnapshotRepository } from '../infrastructure/indexeddb/activeDatasetSnapshotRepository';
import { buildActiveCausalStudy, type CausalStudyGrain } from '../application/services/activeSnapshotCausalStudyService';
import { estimateMatchedCausalLift, type ExposureDriver, type MatchedLiftResult } from '../application/services/causalLiftPipelineService';
import { estimateStaggeredEventStudy, type EventStudyDiagnostics } from '../application/services/staggeredEventStudyService';
import { diagnoseStaggeredEventStudy, type JointEventStudyReport } from '../application/services/staggeredEventStudyDiagnosticsService';
import { assessEventStudyForCalibration } from '../application/services/eventStudyCalibrationGateService';
import { buildCompleteExposurePanel, type ExposurePanelInput } from '../application/services/completeExposurePanelService';
import { summarizeCausalReliability } from '../application/services/causalReliabilitySummaryService';

interface StudyFile { eligibleUnits: string[]; calendar: string[]; rows: ExposurePanelInput[] }
const format = (v: number | null) => v === null || !Number.isFinite(v) ? '—' : v.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
function parseStudy(raw: unknown): StudyFile {
  if (!raw || typeof raw !== 'object') throw new Error('Ожидается JSON-объект исследования.');
  const data = raw as Partial<StudyFile>;
  if (!Array.isArray(data.eligibleUnits) || !Array.isArray(data.calendar) || !Array.isArray(data.rows)) throw new Error('Требуются eligibleUnits, calendar и rows.');
  if (data.rows.some(row => !row || typeof row.unitId !== 'string' || typeof row.period !== 'string')) throw new Error('Некорректная запись rows.');
  buildCompleteExposurePanel(data.rows, { eligibleUnits: data.eligibleUnits, calendar: data.calendar });
  return data as StudyFile;
}
export default function CausalLiftPage({ projectId }: { projectId: string }) {
  const [brand, setBrand] = useState('');
  const [grain, setGrain] = useState<CausalStudyGrain>('promo-chain-brand');
  const [sourceInfo, setSourceInfo] = useState('');
  const [activeVersion, setActiveVersion] = useState<string | null>(null);
  const [verifiedActiveVersion, setVerifiedActiveVersion] = useState<string | null>(null);
  const [saveInfo, setSaveInfo] = useState('');
  const [study, setStudy] = useState<StudyFile | null>(null);
  const [driver, setDriver] = useState<ExposureDriver>('promoActive');
  const [outcome, setOutcome] = useState<'salesRub' | 'salesUnits'>('salesRub');
  const [start, setStart] = useState('');
  const [result, setResult] = useState<MatchedLiftResult | null>(null);
  const [eventStudy, setEventStudy] = useState<EventStudyDiagnostics | null>(null);
  const [jointDiagnostics, setJointDiagnostics] = useState<JointEventStudyReport | null>(null);
  const [preMonths, setPreMonths] = useState(3);
  const [postMonths, setPostMonths] = useState(6);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!study || !activeVersion) { setVerifiedActiveVersion(null); return () => { cancelled = true; }; }
    setVerifiedActiveVersion(null);
    void new ActiveDatasetSnapshotRepository().getForProject(projectId).then(snapshot => {
      if (!cancelled) setVerifiedActiveVersion(snapshot.legacy ? null : (snapshot.datasetVersion ?? null));
    }).catch(() => { if (!cancelled) setVerifiedActiveVersion(null); });
    return () => { cancelled = true; };
  }, [projectId, study, activeVersion]);
  const chartRows = useMemo(() => {
    if (!study || !result) return [];
    const panel = buildCompleteExposurePanel(study.rows, study);
    const index = new Map(panel.rows.map(row => [JSON.stringify([row.unitId, row.period]), row]));
    return study.calendar.slice().sort().map(period => {
      const mean = (side: 'treatedUnit' | 'controlUnit') => result.pairs.reduce((sum, pair) => sum + (index.get(JSON.stringify([pair[side], period]))?.[outcome] ?? 0), 0) / result.pairs.length;
      return { period, treated: mean('treatedUnit'), control: mean('controlUnit') };
    });
  }, [study, result, outcome]);
  const max = Math.max(1, ...chartRows.flatMap(r => [r.treated, r.control]));
  const x = (i: number) => 54 + i * (640 / Math.max(1, chartRows.length - 1));
  const y = (v: number) => 220 - v / max * 190;
  const line = (field: 'treated' | 'control') => chartRows.map((r, i) => `${i ? 'L' : 'M'}${x(i)},${y(r[field])}`).join(' ');
  async function upload(file?: File) {
    setResult(null); setEventStudy(null); setJointDiagnostics(null); setStudy(null); setError(''); setActiveVersion(null); setSaveInfo('');
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('Максимальный размер JSON — 20 МБ.');
      const parsed = parseStudy(JSON.parse(await file.text()));
      setStudy(parsed); setStart(parsed.calendar.slice().sort()[Math.floor(parsed.calendar.length * 2 / 3)] ?? '');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  async function loadActive() {
    setBusy(true); setError(''); setResult(null); setEventStudy(null); setJointDiagnostics(null); setStudy(null); setSourceInfo(''); setActiveVersion(null); setSaveInfo('');
    try {
      const snapshot = await new ActiveDatasetSnapshotRepository().getForProject(projectId);
      const prepared = buildActiveCausalStudy(snapshot, grain, brand);
      const next: StudyFile = {eligibleUnits:prepared.eligibleUnits,calendar:prepared.calendar,rows:prepared.rows};
      setStudy(next); setDriver(prepared.driver); setActiveVersion(prepared.datasetVersion);
      setStart(prepared.calendar[Math.floor(prepared.calendar.length * 2 / 3)] ?? '');
      setSourceInfo(`Версия: ${prepared.datasetVersion}. ${prepared.warnings.join(' ')}`);
    } catch(e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  function run() {
    if (!study) return;
    setBusy(true); setError(''); setResult(null);
    // Defer to paint the busy indicator; computation is currently on the UI thread.
    requestAnimationFrame(() => setTimeout(() => {
      try {
        const calculated = estimateMatchedCausalLift(study.rows, { ...study, treatmentStart: start, driver, outcome, bootstrapIterations: 499 });
        setResult(calculated); setSaveInfo('');
        if (activeVersion && brand.trim() && driver !== 'promoBonusRub') {
          const record = matchedLiftToRegistryRecord({result:calculated,projectId,datasetVersion:activeVersion,treatmentStart:start,brand:brand.trim(),grain,id:crypto.randomUUID(),createdAt:new Date().toISOString()});
          void saveAnalysisResult(record).then(() => setSaveInfo('Оценка matched DiD автоматически сохранена в реестр.')).catch(e => setSaveInfo(`Оценка рассчитана, но сохранить в реестр не удалось: ${String(e)}`));
        } else setSaveInfo('Оценка не сохранена автоматически: нужен активный версионированный проект, бренд и бинарное воздействие.');
      }
      catch (e) { setError(e instanceof Error ? e.message : String(e)); }
      finally { setBusy(false); }
    }, 0));
  }
  function runEventStudy() {
    if (!study) return;
    if (driver === 'promoBonusRub') { setError('Event Study поддерживает факт промо или визиты, но не сумму бонуса.'); return; }
    setBusy(true); setError(''); setEventStudy(null); setJointDiagnostics(null); setSaveInfo('');
    requestAnimationFrame(() => setTimeout(() => {
      try {
        const opts = { ...study, driver, outcome, preMonths, postMonths, bootstrapIterations: 400 };
        setEventStudy(estimateStaggeredEventStudy(study.rows, { ...opts, bootstrapIterations: 199 }));
        const diagnostics = diagnoseStaggeredEventStudy(study.rows, opts);
        setJointDiagnostics(diagnostics);
        if (activeVersion && brand.trim()) {
          void new ActiveDatasetSnapshotRepository().getForProject(projectId).then(snapshot => {
            if (snapshot.datasetVersion !== activeVersion) throw new Error('Версия данных изменилась после подготовки исследования.');
            return saveEventStudyDiagnostics({
              id:crypto.randomUUID(), projectId, datasetVersion:activeVersion, createdAt:new Date().toISOString(),
              algorithmVersion:'event-study-diagnostics-v1', brand:brand.trim(), grain, driver, outcome,
              preMonths, postMonths, eligibleUnits:[...study.eligibleUnits], calendar:[...study.calendar],
              report:diagnostics, gate:assessEventStudyForCalibration(diagnostics),
            });
          }).then(() => setSaveInfo('Диагностика Event Study сохранена в IndexedDB.'))
            .catch(e => setSaveInfo(`Диагностика рассчитана, но не сохранена: ${String(e)}`));
        } else setSaveInfo('Диагностика не сохранена: требуется активная версия данных и бренд.');
      }
      catch (e) { setError(e instanceof Error ? e.message : String(e)); }
      finally { setBusy(false); }
    }, 0));
  }
  const gate = jointDiagnostics ? assessEventStudyForCalibration(jointDiagnostics) : null;
  const eventPoints = jointDiagnostics?.points ?? eventStudy?.points ?? [];
  const bounds = eventPoints.flatMap(p => [p.att, p.ciLow, p.ciHigh]).filter((v): v is number => v !== null && Number.isFinite(v));
  const eventMin = Math.min(0, ...bounds), eventMax = Math.max(0, ...bounds);
  const reliability = study ? summarizeCausalReliability({eligibleUnits:study.eligibleUnits,calendar:study.calendar,observedRows:study.rows.length,matched:result,event:jointDiagnostics,datasetVersion:activeVersion??undefined,activeDatasetVersion:verifiedActiveVersion??undefined}) : null;
  const eventY = (v: number) => 225 - (v - eventMin) / (eventMax - eventMin || 1) * 180;
  const eventX = (i: number) => 65 + i * (620 / Math.max(1, eventPoints.length - 1));
  return <main className="pm-page"><header className="pm-page-header"><div><p className="pm-eyebrow">PHARMAMIX LAB / CAUSAL LIFT</p><h1>Квазиэкспериментальная оценка uplift</h1><p>Подбор сопоставимого контроля и Difference-in-Differences. Не рандомизированный A/B-тест.</p></div></header>
    <section className="pm-panel" style={{padding:24,marginBottom:20}}><h2>Исследование</h2>
      <p>Автоматическая подготовка из опубликованной версии IndexedDB. Для промо единица наблюдения — сеть × бренд, для визитов — регион × бренд; воздействия не размножаются по SKU или аптечным сетям.</p>
      <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center',marginBottom:14}}>
        <label>Бренд <input value={brand} onChange={e=>setBrand(e.target.value)} placeholder="Название бренда" /></label>
        <label>Исследование <select value={grain} onChange={e=>setGrain(e.target.value as CausalStudyGrain)}><option value="promo-chain-brand">Промо по сетям</option><option value="visits-region-brand">Визиты по регионам</option></select></label>
        <button className="pm-button" disabled={busy || !brand.trim()} onClick={()=>void loadActive()}>Подготовить из активного проекта</button>
      </div>
      {sourceInfo && <p role="status">{sourceInfo}</p>}
      <p>Загрузите JSON с полями <code>eligibleUnits</code> (массив идентификаторов), <code>calendar</code> (месяцы YYYY-MM) и <code>rows</code> (unitId, period, salesRub, salesUnits, weightedVisits, promoBonusRub, promoActive). Отсутствующие строки и поля внутри указанного охвата трактуются как нули.</p>
      <label>JSON исследования <input type="file" accept=".json,application/json" onChange={e => void upload(e.target.files?.[0])}/></label>
      {study && <p role="status">Единиц: {study.eligibleUnits.length}; месяцев: {study.calendar.length}; исходных строк: {study.rows.length}.</p>}
      {reliability && <section className="pm-panel" aria-label="Causal reliability summary" style={{padding:16,marginTop:12}}><h3>Causal reliability summary: {reliability.status}</h3><p>Coverage: {reliability.coverage.units} units × {reliability.coverage.months} months ({reliability.coverage.cells} cells); event-study per-time bounds: {reliability.sampleDiagnostics.eventStudyByTime.map(x=>`${x.eventMonth}:${x.treatedUnits}/${x.controlUnitsMin}`).join(', ')||'—'}; matched pairs: {reliability.sampleDiagnostics.matchedPairs}. Dataset: {reliability.freshness?.datasetVersion ?? 'uploaded / unverifiable'}.</p><ul>{reliability.warnings.map(w=><li key={w}>{w}</li>)}</ul><details><summary>Assumptions and limitations</summary><ul>{[...reliability.assumptions,...reliability.limitations].map(x=><li key={x}>{x}</li>)}</ul></details></section>}
      <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center',marginTop:16}}>
        <label>Драйвер <select value={driver} onChange={e=>{setDriver(e.target.value as ExposureDriver);setResult(null);}}><option value="promoActive">Факт промо</option><option value="promoBonusRub">Начисленный бонус (не рекомендуется)</option><option value="weightedVisits">Визиты</option></select></label>
        <label>Продажи <select value={outcome} onChange={e=>{setOutcome(e.target.value as 'salesRub'|'salesUnits');setResult(null);}}><option value="salesRub">Рубли</option><option value="salesUnits">Штуки</option></select></label>
        <label>Старт воздействия <input type="month" value={start} onChange={e=>{setStart(e.target.value);setResult(null);}}/></label>
        <button className="pm-button" disabled={!study || busy} onClick={run}>{busy ? 'Расчёт…' : 'Оценить uplift'}</button>
        <label>Месяцев до <input type="number" min="1" max="24" value={preMonths} onChange={e=>setPreMonths(Number(e.target.value))} style={{width:70}}/></label>
        <label>Месяцев после <input type="number" min="0" max="24" value={postMonths} onChange={e=>setPostMonths(Number(e.target.value))} style={{width:70}}/></label>
        <button className="pm-button" disabled={!study || busy || driver === 'promoBonusRub'} onClick={runEventStudy}>Рассчитать Event Study</button>
      </div>
    </section>
    {saveInfo && <p role="status">{saveInfo}</p>}
    {error && <section className="pm-state pm-state-error" role="alert">{error}</section>}
    {eventStudy && <section className="pm-panel" style={{padding:24,marginBottom:20}}><h2>Event Study — динамика эффекта</h2>
      <p>Время относительно первого воздействия: −1 — базовый месяц (не оценивается). Оценки до запуска — placebo-проверки, а не доказательство параллельных трендов.</p>
      {jointDiagnostics && gate && <div className="pm-panel" style={{padding:16,marginBottom:16}}>
        <h3>Диагностика пригодности для калибровки</h3>
        <p><strong>Предтренды:</strong> {jointDiagnostics.pretrendStatus === 'rejected' ? 'отклонены' : jointDiagnostics.pretrendStatus === 'not-rejected' ? 'не отклонены (не доказаны)' : 'недостаточно данных'}; <strong>совместное p-value:</strong> {format(jointDiagnostics.jointPretrendPValue)}.</p>
        <p><strong>Статистическая диагностика:</strong> {gate.statisticalStatus === 'detected' ? 'хотя бы один post-период с интервалом вне нуля' : gate.statisticalStatus === 'not-detected' ? 'интервалы включают ноль' : 'неопределённость не оценена'}.</p>
        <p><strong>Автоматическая калибровка MMM:</strong> заблокирована до независимой методологической проверки.</p>
        <ul>{gate.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
        {jointDiagnostics.missingEventTimes.length > 0 && <p>Недоступные месяцы относительно старта: {jointDiagnostics.missingEventTimes.join(', ')}.</p>}
      </div>}
      <p><strong>Максимальный абсолютный placebo-эффект:</strong> {format(eventStudy.pretrendMaxAbsolute)}. <strong>Bootstrap:</strong> {eventStudy.bootstrapIterations} повторов.</p>
      {eventPoints.length > 0 && <div style={{overflowX:'auto'}}><svg viewBox="0 0 740 275" role="img" aria-label="Event Study: эффекты по месяцам относительно начала воздействия и 95-процентные bootstrap-интервалы" style={{width:'100%',maxWidth:900}}>
        <line x1="55" y1={eventY(0)} x2="710" y2={eventY(0)} stroke="currentColor" strokeDasharray="5 5" opacity="0.6"/>
        {eventPoints.map((p,i)=><g key={p.eventMonth}>
          {p.ciLow!==null && p.ciHigh!==null && <><line x1={eventX(i)} x2={eventX(i)} y1={eventY(p.ciLow)} y2={eventY(p.ciHigh)} stroke="#64748b" strokeWidth="2"/><line x1={eventX(i)-5} x2={eventX(i)+5} y1={eventY(p.ciLow)} y2={eventY(p.ciLow)} stroke="#64748b"/><line x1={eventX(i)-5} x2={eventX(i)+5} y1={eventY(p.ciHigh)} y2={eventY(p.ciHigh)} stroke="#64748b"/></>}
          <circle cx={eventX(i)} cy={eventY(p.att)} r="5" fill={p.eventMonth<0?'#f97316':'#2563eb'}/><text x={eventX(i)} y="252" fontSize="12" textAnchor="middle" fill="currentColor">{p.eventMonth>0?'+':''}{p.eventMonth}</text>
        </g>)}<text x="55" y="17" fontSize="12" fill="currentColor">Эффект: {format(eventMin)} … {format(eventMax)}</text><text x="55" y="269" fontSize="11" fill="currentColor">Оранжевый — до воздействия; синий — после; линии — bootstrap CI</text>
      </svg></div>}
      <div style={{overflowX:'auto'}}><table><thead><tr><th>Месяц от запуска</th><th>ATT</th><th>95% CI</th><th>Единиц воздействия</th><th>Когорт</th></tr></thead><tbody>{eventPoints.map(p=><tr key={p.eventMonth}><td>{p.eventMonth>0?'+':''}{p.eventMonth}</td><td>{format(p.att)}</td><td>{format(p.ciLow)} … {format(p.ciHigh)}</td><td>{p.treatedUnits}</td><td>{p.cohorts}</td></tr>)}</tbody></table></div>
      <h3>Предупреждения и допущения</h3><ul>{eventStudy.warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul>
      <p>Интервалы приближённые: не учитывают пространственную корреляцию и неопределённость подбора контроля. Совместная диагностика предтрендов не доказывает параллельность трендов.</p>
    </section>}
    {result && <section className="pm-panel" style={{padding:24}}><h2>Результаты matched DiD</h2>
      <div style={{display:'flex',gap:24,flexWrap:'wrap'}}><p><strong>Lift / месяц / единицу:</strong> {format(result.liftPerUnitMonth)}</p><p><strong>Относительный lift:</strong> {format(result.relativeLiftPct)}%</p><p><strong>95% bootstrap CI:</strong> {result.ci95 ? `${format(result.ci95[0])} … ${format(result.ci95[1])}` : 'недоступен'}</p><p><strong>Пар:</strong> {result.pairs.length}</p></div>
      <h3>Динамика подобранных групп</h3><div style={{overflowX:'auto'}}><svg viewBox="0 0 740 275" role="img" aria-label="Средние продажи по месяцам: группа воздействия и контроль" style={{width:'100%',maxWidth:900}}><line x1="54" y1="220" x2="705" y2="220" stroke="currentColor" opacity="0.4"/><line x1="54" y1="30" x2="54" y2="220" stroke="currentColor" opacity="0.4"/><path d={line('treated')} fill="none" stroke="#2563eb" strokeWidth="3"/><path d={line('control')} fill="none" stroke="#f97316" strokeWidth="3"/>{chartRows.map((r,i)=><g key={r.period}><text x={x(i)} y="242" fontSize="11" textAnchor="middle" fill="currentColor">{r.period.slice(5)}</text><circle cx={x(i)} cy={y(r.treated)} r="3" fill="#2563eb"/><circle cx={x(i)} cy={y(r.control)} r="3" fill="#f97316"/></g>)}<text x="55" y="18" fontSize="12" fill="currentColor">Максимум: {format(max)}</text><text x="54" y="263" fontSize="12" fill="#2563eb">● Воздействие</text><text x="200" y="263" fontSize="12" fill="#f97316">● Контроль</text></svg></div>
      <p>Максимальный разрыв предтрендов: {format(result.preTrendMaxAbsGap)}. Периодов до / после: {result.prePeriods.length} / {result.postPeriods.length}.</p>
      <h3>Подобранные пары</h3><div style={{overflowX:'auto'}}><table><thead><tr><th>Воздействие</th><th>Контроль</th><th>Расстояние</th><th>Разрыв предтренда</th></tr></thead><tbody>{result.pairs.map(p=><tr key={p.treatedUnit}><td>{p.treatedUnit}</td><td>{p.controlUnit}</td><td>{format(p.distance)}</td><td>{format(p.preTrendGap)}</td></tr>)}</tbody></table></div>
      <h3>Ограничения</h3><ul>{result.warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul><p>Сопоставление с MMM пока не реализовано. Интервалы являются приближёнными; причинная интерпретация требует дополнительных предпосылок.</p>
    </section>}
  </main>;
}
