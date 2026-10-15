import { useMemo, useState } from 'react';
import { UnifiedImportService, type ImportSourceType } from '../application/services/unifiedImportService';
import { parseCsv } from './SalesImportPage';
import './versioned-snapshot-import.css';

type CsvRow = Record<string, string>;
type SourceName = ImportSourceType;
const SOURCES: Array<{ id: SourceName; title: string; hint: string }> = [
  { id: 'sales', title: 'Продажи аптек', hint: 'Период, регион/город, сеть, бренд, SKU, продажи в штуках и рублях.' },
  { id: 'market', title: 'Рыночные данные', hint: 'Период, адресный рынок, бренд, SKU, регион, продажи в штуках и рублях.' },
  { id: 'promo', title: 'Промо', hint: 'Период, сеть, бренд, SKU, % фактически начисленного бонуса и механика промо.' },
  { id: 'tv', title: 'ТВ-реклама', hint: 'Период, бренд и TRP.' },
  { id: 'visits', title: 'Визиты медицинских представителей', hint: 'Период, регион/город, бренд и взвешенное количество визитов.' },
];
const EMPTY_ROWS = (): Record<SourceName, CsvRow[]> => ({ sales: [], market: [], promo: [], tv: [], visits: [] });
const service = new UnifiedImportService();

export default function VersionedSnapshotImportPage({ projectId = 'default' }: { projectId?: string }) {
  const [rowsBySource, setRowsBySource] = useState(EMPTY_ROWS);
  const [files, setFiles] = useState<Partial<Record<SourceName, string>>>({});
  const [emptySources, setEmptySources] = useState<SourceName[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [allowSkippedRows, setAllowSkippedRows] = useState(false);
  const [preview, setPreview] = useState<ReturnType<typeof service.previewSnapshot> | null>(null);
  const [published, setPublished] = useState<{ datasetVersion: string; totalAcceptedRows: number; totalSkippedRows: number } | null>(null);
  const ready = SOURCES.every(source => emptySources.includes(source.id) || rowsBySource[source.id].length > 0);
  const totalRows = useMemo(() => SOURCES.reduce((sum, source) => sum + rowsBySource[source.id].length, 0), [rowsBySource]);

  async function selectFile(source: SourceName, file?: File) {
    setError(''); setPreview(null); setPublished(null);
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) { setError(`${file.name}: поддерживается CSV UTF-8.`); return; }
    try {
      const parsed = parseCsv(await file.text());
      setRowsBySource(previous => ({ ...previous, [source]: parsed }));
      setFiles(previous => ({ ...previous, [source]: file.name }));
      setEmptySources(previous => previous.filter(value => value !== source));
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }

  function markEmpty(source: SourceName, checked: boolean) {
    setRowsBySource(previous => ({ ...previous, [source]: [] }));
    setFiles(previous => { const next = { ...previous }; delete next[source]; return next; });
    setEmptySources(previous => checked ? [...new Set([...previous, source])] : previous.filter(value => value !== source));
    setPreview(null); setPublished(null); setError('');
  }

  function buildInput() {
    return { projectId, sources: { sales: rowsBySource.sales, market: rowsBySource.market, promo: rowsBySource.promo, tv: rowsBySource.tv, visits: rowsBySource.visits } };
  }

  function previewSnapshot() {
    setError(''); setPublished(null);
    try {
      if (!ready) throw new Error('Загрузите CSV для каждого источника или явно отметьте источник как намеренно пустой.');
      const result = service.previewSnapshot(buildInput());
      setPreview(result);
      if (result.totalAcceptedRows === 0) setError('В снимке нет корректных строк. Публикация недоступна.');
    } catch (reason) { setPreview(null); setError(reason instanceof Error ? reason.message : String(reason)); }
  }

  async function publishSnapshot() {
    setBusy(true); setError('');
    try {
      if (!ready) throw new Error('Не все источники представлены.');
      const result = await service.importSnapshot({ ...buildInput(), allowSkippedRows });
      setPublished({ datasetVersion: result.datasetVersion, totalAcceptedRows: result.totalAcceptedRows, totalSkippedRows: result.totalSkippedRows });
      setPreview(null);
    } catch (reason) {
      const value = reason as Error & { report?: ReturnType<typeof service.previewSnapshot> };
      if (value.report) setPreview(value.report);
      setError(value.message || String(reason));
    } finally { setBusy(false); }
  }

  return <main className="pm-snapshot-page">
    <header className="pm-snapshot-header"><div><p className="pm-snapshot-eyebrow">PHARMAMIX LAB / VERSIONED DATA</p><h1>Публикация полного набора данных</h1><p>Все пять источников сначала проверяются отдельно, затем публикуются как единая версия проекта.</p></div><span>Проект: {projectId}</span></header>
    <section className="pm-snapshot-warning"><strong>Важно</strong><p>Этот сценарий заменяет активный снимок проекта целиком. Для источника без данных отметьте «Намеренно пустой». Если хотите сохранить текущие данные источника, включите их в новый CSV: частичный снимок не объединяется автоматически со старой версией.</p></section>
    <section className="pm-snapshot-sources"><h2>1. Подготовьте пять источников</h2>{SOURCES.map(source => <article className="pm-snapshot-source" key={source.id}><div className="pm-snapshot-source-heading"><strong>{source.title}</strong><label><input type="checkbox" checked={emptySources.includes(source.id)} onChange={event => markEmpty(source.id, event.target.checked)} /> Намеренно пустой</label></div><p>{source.hint}</p>{!emptySources.includes(source.id) && <label className="pm-snapshot-file">Выбрать CSV<input type="file" accept=".csv,text/csv" onChange={event => void selectFile(source.id, event.currentTarget.files?.[0])} /></label>}{files[source.id] && <span className="pm-snapshot-file-name">{files[source.id]} · {rowsBySource[source.id].length.toLocaleString('ru-RU')} строк</span>}{emptySources.includes(source.id) && <span className="pm-snapshot-empty">Источник будет опубликован без строк</span>}</article>)}</section>
    {error && <section className="pm-snapshot-error" role="alert">{error}</section>}
    <section className="pm-snapshot-actions"><p>Подготовлено строк: <strong>{totalRows.toLocaleString('ru-RU')}</strong>. До публикации текущая активная версия не изменяется.</p><button type="button" onClick={previewSnapshot} disabled={!ready || busy}>Проверить снимок</button></section>
    {preview && <section className="pm-snapshot-preview"><h2>2. Результат проверки</h2><p>Принято: <strong>{preview.totalAcceptedRows}</strong> · Пропущено: <strong>{preview.totalSkippedRows}</strong> · Всего входных строк: <strong>{preview.totalInputRows}</strong></p><div className="pm-snapshot-report-wrap"><table><thead><tr><th>Источник</th><th>Входных</th><th>Принято</th><th>Пропущено</th><th>Проблемы</th></tr></thead><tbody>{preview.reports.map(report => <tr key={report.source}><td>{SOURCES.find(source => source.id === report.source)?.title ?? report.source}</td><td>{report.inputRows}</td><td>{report.acceptedRows}</td><td>{report.skippedRows}</td><td>{report.issues.length ? <details><summary>{report.issues.length} ошибок</summary><ul>{report.issues.slice(0, 30).map((issue, index) => <li key={index}>Строка {issue.row}: {issue.field} — {issue.message}</li>)}</ul></details> : '—'}</td></tr>)}</tbody></table></div>{preview.totalSkippedRows > 0 && <label className="pm-snapshot-skip-confirm"><input type="checkbox" checked={allowSkippedRows} onChange={event => setAllowSkippedRows(event.target.checked)} /> Я проверил ошибки и разрешаю публикацию с пропущенными строками.</label>}<div className="pm-snapshot-publish-warning">Публикация переключит активную версию всего проекта. Старые версионные факты сохраняются для отката.</div><button type="button" disabled={busy || preview.totalAcceptedRows === 0 || (preview.totalSkippedRows > 0 && !allowSkippedRows)} onClick={() => void publishSnapshot()}>{busy ? 'Публикация…' : 'Опубликовать полный снимок'}</button></section>}
    {published && <section className="pm-snapshot-success" role="status"><h2>Снимок опубликован</h2><p>Версия: <code>{published.datasetVersion}</code></p><p>Принято строк: {published.totalAcceptedRows.toLocaleString('ru-RU')}; пропущено: {published.totalSkippedRows.toLocaleString('ru-RU')}.</p></section>}
  </main>;
}
