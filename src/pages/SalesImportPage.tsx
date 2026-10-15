import { useMemo, useState } from 'react';
import { SalesNormalizationService } from '../application/services/salesNormalizationService';
import './sales-import-page.css';

type CsvRow = Record<string, string>;
const service = new SalesNormalizationService();
const DEFAULT_PROJECT = 'default';

/** Small RFC4180-style CSV reader supporting quoted commas, escaped quotes and CRLF. */
export function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.length === 0) quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(value => value.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (quoted) throw new Error('CSV содержит незакрытую кавычку. Проверьте файл.');
  if (cell.length || row.length) { row.push(cell); if (row.some(value => value.trim() !== '')) rows.push(row); }
  if (rows.length < 2) throw new Error('В CSV должны быть заголовки и хотя бы одна строка данных.');
  const headers = rows[0].map((header, index) => (index === 0 ? header.replace(/^\uFEFF/, '') : header).trim());
  if (headers.some(header => !header)) throw new Error('В CSV обнаружен пустой заголовок столбца.');
  if (new Set(headers).size !== headers.length) throw new Error('В CSV есть повторяющиеся названия столбцов.');
  return rows.slice(1).map((values, index) => {
    if (values.length !== headers.length) throw new Error(`Строка ${index + 2}: число значений не совпадает с числом столбцов.`);
    return Object.fromEntries(headers.map((header, column) => [header, values[column].trim()]));
  });
}

export default function SalesImportPage({ projectId = DEFAULT_PROJECT }: { projectId?: string }) {
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ importedRows: number; skippedRows: number; datasetVersion: number; issues: Array<{row:number;field:string;message:string}> } | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const sample = useMemo(() => rows.slice(0, 5), [rows]);

  async function chooseFile(file?: File) {
    setError(''); setReport(null); setRows([]); setConfirmReplace(false);
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) { setError('Пока поддерживается CSV. Excel-файлы сначала сохраните в CSV UTF-8.'); return; }
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      setRows(parsed); setFileName(file.name);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }

  async function importRows() {
    setBusy(true); setError('');
    try {
      const result = await service.normalizeAndCommit({ projectId, rows, sourceBatchId: crypto.randomUUID() });
      setReport(result); setConfirmReplace(false);
      if (result.importedRows === 0) setError('Не найдено корректных строк продаж; прежние данные сохранены.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  return <main className="pm-import-page">
    <header className="pm-import-header"><div><p className="pm-import-eyebrow">PHARMAMIX LAB / DATA MANAGEMENT</p><h1>Импорт продаж</h1><p>Предпросмотр CSV, проверка строк и публикация нормализованного набора данных.</p></div><span className="pm-import-project">Проект: {projectId}</span></header>
    <section className="pm-import-card"><h2>1. Выберите CSV-файл</h2><p>Обязательные поля: период, бренд, SKU, продажи в штуках и продажи в рублях. Дополнительно можно передать регион, город и аптечную сеть.</p><label className="pm-file-input">Выбрать CSV<input type="file" accept=".csv,text/csv" onChange={event => void chooseFile(event.currentTarget.files?.[0])} /></label>{fileName && <span className="pm-file-name">{fileName} · {rows.length.toLocaleString('ru-RU')} строк</span>}</section>
    {error && <section className="pm-import-alert" role="alert">{error}</section>}
    {rows.length > 0 && <section className="pm-import-card"><h2>2. Предпросмотр</h2><p>Показаны первые {sample.length} строк из {rows.length.toLocaleString('ru-RU')}. Проверка бизнес-правил выполняется при подтверждении импорта.</p><div className="pm-import-table-wrap"><table className="pm-import-table"><thead><tr>{Object.keys(rows[0]).map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{sample.map((row, index) => <tr key={index}>{Object.keys(rows[0]).map(header => <td key={header}>{row[header]}</td>)}</tr>)}</tbody></table></div>
      {!confirmReplace ? <button className="pm-import-primary" type="button" onClick={() => setConfirmReplace(true)}>Продолжить к импорту</button> : <div className="pm-import-confirm"><strong>Внимание: импорт заменит текущий нормализованный набор продаж проекта «{projectId}».</strong><p>Исходные legacy-данные не удаляются, но опубликованные факты продаж будут заменены после успешной проверки.</p><button className="pm-import-primary" type="button" disabled={busy} onClick={() => void importRows()}>{busy ? 'Проверка и сохранение…' : 'Подтвердить импорт'}</button><button className="pm-import-secondary" type="button" disabled={busy} onClick={() => setConfirmReplace(false)}>Отмена</button></div>}</section>}
    {report && <section className="pm-import-result" role="status"><h2>Импорт завершён</h2><div className="pm-import-stats"><span><strong>{report.importedRows.toLocaleString('ru-RU')}</strong> импортировано</span><span><strong>{report.skippedRows.toLocaleString('ru-RU')}</strong> пропущено</span><span><strong>{report.datasetVersion}</strong> версия данных</span></div>{report.issues.length > 0 && <details><summary>Ошибки строк: {report.issues.length}</summary><ul>{report.issues.slice(0, 100).map((issue, index) => <li key={index}>Строка {issue.row}: {issue.message}</li>)}</ul>{report.issues.length > 100 && <p>Показаны первые 100 ошибок.</p>}</details>}</section>}
    <section className="pm-import-note"><strong>Перед импортом</strong><p>Сделайте резервную копию важных файлов. Для больших CSV импорт может занять некоторое время. Данные IndexedDB хранятся локально в текущем профиле браузера и не синхронизируются автоматически между пользователями.</p></section>
  </main>;
}
