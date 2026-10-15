import { listCurrentEventStudyDiagnostics, type PersistedEventStudyDiagnostics } from '../infrastructure/indexeddb/eventStudyDiagnosticsRepository';
import { useEffect, useState } from 'react';
import { ActiveDatasetSnapshotRepository } from '../infrastructure/indexeddb/activeDatasetSnapshotRepository';
import { reconcileCausalAndMmm, type ComparableEffect } from '../application/services/causalMmmReconciliationService';
import { mmmEffectsToMatchedRegistryRecord } from '../application/services/mmmRegistryExportService';
import type { UnitMonthEffect } from '../application/services/causalMmmPopulationAlignmentService';
import { compatibleRegistryPair, listAnalysisResults, saveAnalysisResult, type AnalysisRegistryRecord } from '../infrastructure/indexeddb/analysisRegistryRepository';

export default function CausalMmmReconciliationPage({ projectId }: { projectId: string }) {
  const [diagnostics, setDiagnostics] = useState<PersistedEventStudyDiagnostics[]>([]);
  const [records, setRecords] = useState<AnalysisRegistryRecord[]>([]);
  const [activeVersion, setActiveVersion] = useState<string | null>(null);
  const [version, setVersion] = useState('');
  const [definition, setDefinition] = useState('');
  const [raw, setRaw] = useState('');
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [mmmRows, setMmmRows] = useState('');
  const [verified, setVerified] = useState(false);
  const [saveInfo, setSaveInfo] = useState('');
  const refresh = async () => {
    try {
      const snapshot = await new ActiveDatasetSnapshotRepository().getForProject(projectId);
      const currentVersion = snapshot.datasetVersion;
      const [r, d] = await Promise.all([
        listAnalysisResults(projectId),
        currentVersion ? listCurrentEventStudyDiagnostics(projectId, currentVersion) : Promise.resolve([]),
      ]);
      setActiveVersion(currentVersion);
      setRecords(r);
      setDiagnostics(d);
      setError('');
    } catch (e) {
      setActiveVersion(null);
      setRecords([]);
      setDiagnostics([]);
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => {
    // Project changes invalidate the previous project's data immediately.
    setActiveVersion(null);
    setRecords([]);
    setDiagnostics([]);
    void refresh();
  }, [projectId]);
  async function save() {
    try {
      const effect = JSON.parse(raw) as ComparableEffect;
      if (!activeVersion || version.trim() !== activeVersion || !definition.trim() || !['mmm', 'causal'].includes(effect.source)) throw new Error('Укажите версию данных, определение воздействия и корректный JSON эффекта.');
      const record: AnalysisRegistryRecord = { id: crypto.randomUUID(), projectId, datasetVersion: version.trim(), kind: effect.source, createdAt: new Date().toISOString(), algorithmVersion: 'manual-import-v1', definition: definition.trim(), effect };
      await saveAnalysisResult(record); setRaw(''); setError(''); await refresh();
    } catch (e) { setError(String(e)); }
  }
  async function exportMmmForCausal() {
    setError(''); setSaveInfo('');
    try {
      if (!activeVersion) throw new Error('Нет опубликованной версии данных.');
      const causal = records.find(r => r.id === selected && r.kind === 'causal' && r.datasetVersion === activeVersion);
      if (!causal) throw new Error('Выберите сохранённую causal-оценку активной версии.');
      const parsed: unknown = JSON.parse(mmmRows);
      if (!Array.isArray(parsed) || !parsed.every(r => r && typeof r === 'object' && typeof r.unitId === 'string' && typeof r.period === 'string' && typeof r.incremental === 'number'))
        throw new Error('Ожидается массив {unitId, period, incremental} с числовыми эффектами MMM.');
      const record = mmmEffectsToMatchedRegistryRecord({ causalRecord:causal, mmmUnitMonths:parsed as UnitMonthEffect[],
        id:crypto.randomUUID(), createdAt:new Date().toISOString(), algorithmVersion:'trajectory-mmm-matched-export-v1', exposureDefinitionVerified:verified });
      await saveAnalysisResult(record); await refresh(); setMmmRows(''); setVerified(false);
      setSaveInfo('Сопоставимая оценка MMM сохранена в реестре активной версии.');
    } catch(e) {setError(e instanceof Error ? e.message : String(e));}
  }
  const currentRecords = records.filter(r => activeVersion !== null && r.datasetVersion === activeVersion);
  const chosen = currentRecords.find(r => r.id === selected);
  const matches = chosen ? currentRecords.filter(r => compatibleRegistryPair(chosen, r)) : [];
  return <main style={{ padding: 24 }}>
    <h1>MMM × Causal Lift · реестр результатов</h1>
    <p>Локальный реестр IndexedDB. Сравнение разрешено только для одной версии данных, определения воздействия, периода и охвата. Matched DiD из активного проекта сохраняется автоматически; помесячные эффекты MMM можно сохранить для выбранной causal-оценки после проверки идентичности охвата. Старые версии данных исключены из сравнения.</p>
    <label>Версия исходных данных <input value={version} onChange={e => setVersion(e.target.value)} placeholder="dataset-version" /></label>{' '}
    <label>Определение воздействия <input value={definition} onChange={e => setDefinition(e.target.value)} placeholder="promo-on/off или visits-on/off" /></label>
    <p><textarea aria-label="JSON оценки эффекта" rows={7} style={{ width: '100%' }} value={raw} onChange={e => setRaw(e.target.value)} placeholder='{"source":"mmm","driver":"promoActive","outcome":"salesRub","periodStart":"2026-01","periodEnd":"2026-06","populationKey":"matched-cohort","incrementalTotal":1000,"unitMonths":12}' /></p>
    <button disabled={!activeVersion || version.trim() !== activeVersion} onClick={() => void save()}>Сохранить оценку в реестр</button>{' '}<button onClick={() => void refresh()}>Обновить</button>
    {error && <p role="alert">{error}</p>}
    <section className="pm-panel" style={{padding:16,marginTop:16}}><h2>Сохранить помесячные эффекты MMM для matched DiD</h2>
      <p>Выберите ниже causal-оценку, затем вставьте JSON-массив эффектов MMM. Единицы и месяцы должны совпадать точно; пропуски, дубликаты и лишние наблюдения отклоняются. Это экспорт рассчитанных эффектов, а не обучение MMM.</p>
      <textarea aria-label="Помесячные эффекты MMM" rows={5} style={{width:'100%'}} value={mmmRows} onChange={e=>setMmmRows(e.target.value)} placeholder='[{"unitId":"chain-A","period":"2026-01","incremental":1000}]'/>
      <label style={{display:'block',margin:'10px 0'}}><input type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)}/> Подтверждаю одинаковое определение воздействия, единицу наблюдения и сценарий контрфакта в MMM и DiD</label>
      <button className="pm-button" disabled={!verified || !mmmRows.trim() || !records.some(r=>r.id===selected && r.kind==='causal' && r.datasetVersion===activeVersion)} onClick={()=>void exportMmmForCausal()}>Сохранить MMM рядом с выбранной causal-оценкой</button>
      {saveInfo && <p role="status">{saveInfo}</p>}
    </section>
    <section className="pm-panel" style={{padding:16,marginTop:16}}>
      <h2>Диагностика Event Study · активная версия</h2>
      <p>Диагностика хранится отдельно от итоговых оценок эффекта. Она не подтверждает причинную идентификацию и не разрешает автоматическую калибровку MMM.</p>
      <div style={{overflowX:'auto'}}><table><thead><tr><th>Бренд / драйвер</th><th>Дата</th><th>Предтренды</th><th>Совместное p-value</th><th>Статистика</th><th>Калибровка</th></tr></thead><tbody>
        {diagnostics.filter(d=>d.datasetVersion===activeVersion).map(d=><tr key={d.id}><td>{d.brand} · {d.driver}</td><td>{d.createdAt.slice(0,10)}</td><td>{d.report.pretrendStatus}</td><td>{d.report.jointPretrendPValue?.toFixed(3) ?? '—'}</td><td>{d.gate.statisticalStatus}</td><td>Заблокирована</td></tr>)}
      </tbody></table></div>
      {!diagnostics.some(d=>d.datasetVersion===activeVersion) && <p>Для активной версии сохранённой диагностики нет.</p>}
    </section>
    <h2>Оценки активной версии ({currentRecords.length} из {records.length})</h2><p role="status">Активная версия: {activeVersion ?? 'нет опубликованной версии'}. Результаты других версий не участвуют в сравнении.</p>
    <select aria-label="Выбрать результат" value={selected} onChange={e => setSelected(e.target.value)}><option value="">Выберите результат</option>{currentRecords.map(r => <option key={r.id} value={r.id}>{r.kind.toUpperCase()} · {r.datasetVersion} · {r.effect.driver} · {r.createdAt}</option>)}</select>
    {chosen && <section><h3>Совместимые результаты: {matches.length}</h3>{matches.length === 0 && <p>Совместимая оценка другого метода не найдена. Результаты с иной версией данных не сравниваются.</p>}{matches.map(other => {
      try {
        const mmm = chosen.kind === 'mmm' ? chosen.effect : other.effect;
        const causal = chosen.kind === 'causal' ? chosen.effect : other.effect;
        const result = reconcileCausalAndMmm(mmm, causal);
        return <article key={other.id}><p>MMM: {result.mmmTotal.toLocaleString('ru-RU')} · Causal Lift: {result.causalTotal.toLocaleString('ru-RU')} · Разница: {result.difference.toLocaleString('ru-RU')} ({result.differencePctOfCausal?.toFixed(1) ?? 'н/д'}%)</p><ul>{result.warnings.map(w => <li key={w}>{w}</li>)}</ul></article>;
      } catch (e) { return <p key={other.id} role="alert">Ошибка сопоставления: {String(e)}</p>; }
    })}</section>}
  </main>;
}
