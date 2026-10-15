import type { TvFact, VisitFact } from '../../domain/shared/facts';

export interface ExposureIssue { row: number; field: string; message: string }
export interface TvNormalizationResult { facts: TvFact[]; issues: ExposureIssue[]; skippedRows: number; fingerprint: string }
export interface VisitNormalizationResult { facts: VisitFact[]; issues: ExposureIssue[]; skippedRows: number; fingerprint: string }
type Row = Record<string, unknown>;
const normalizeKey = (value: string) => value.trim().toLocaleLowerCase('ru-RU').replace(/[ё]/g, 'е').replace(/[_\s]+/g, ' ');
function value(row: Row, aliases: string[]): unknown {
  const names = new Set(aliases.map(normalizeKey));
  for (const [key, item] of Object.entries(row)) if (names.has(normalizeKey(key))) return item;
  return undefined;
}
const str = (v: unknown) => v == null ? '' : String(v).trim();
function number(v: unknown): number {
  if (typeof v === 'number') return v;
  const raw = str(v).replace(/[\s\u00a0]/g, '').replace(',', '.');
  return raw ? Number(raw) : Number.NaN;
}
function month(v: unknown): string {
  const raw = str(v); const match = raw.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?$/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}`;
  const reverse = raw.match(/^(\d{1,2})[-/.](\d{4})$/);
  return reverse ? `${reverse[2]}-${reverse[1].padStart(2, '0')}` : raw;
}
function hash(text: string): string { let h = 0x811c9dc5; for (let i=0;i<text.length;i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); }
function validPeriod(p: string) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(p); }

export function normalizeTvRows(rows: readonly unknown[], projectId: string, datasetVersion = 'pending'): TvNormalizationResult {
  if (!projectId.trim()) throw new Error('projectId обязателен.');
  const facts: TvFact[] = [], issues: ExposureIssue[] = [];
  rows.forEach((raw, index) => {
    const rowNo = index + 1;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { issues.push({ row: rowNo, field: '*', message: 'Строка должна быть объектом.' }); return; }
    const row = raw as Row; const period = month(value(row, ['period','month','year-month','год-месяц','период','месяц']));
    const brand = str(value(row, ['brand','бренд'])); const trp = number(value(row, ['trp','grp','target rating points','тпр','рейтинг','trp рекламной кампании']));
    const errors: string[] = [];
    if (!validPeriod(period)) errors.push('Период должен иметь формат YYYY-MM.');
    if (!brand) errors.push('Не заполнен бренд.');
    if (!Number.isFinite(trp) || trp < 0) errors.push('TRP должен быть конечным неотрицательным числом.');
    if (errors.length) { errors.forEach(message => issues.push({ row: rowNo, field: 'tv', message })); return; }
    facts.push({ id: `${projectId}:tv:${rowNo}`, projectId, period, brand, trp, datasetVersion });
  });
  const canonical = facts.map(f => [f.period,f.brand,f.trp].join('\u001f')).sort().join('\n');
  return { facts, issues, skippedRows: rows.length - facts.length, fingerprint: hash(canonical) };
}

export function normalizeVisitRows(rows: readonly unknown[], projectId: string, datasetVersion = 'pending'): VisitNormalizationResult {
  if (!projectId.trim()) throw new Error('projectId обязателен.');
  const facts: VisitFact[] = [], issues: ExposureIssue[] = [];
  rows.forEach((raw, index) => {
    const rowNo = index + 1;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { issues.push({ row: rowNo, field: '*', message: 'Строка должна быть объектом.' }); return; }
    const row = raw as Row; const period = month(value(row, ['period','month','year-month','год-месяц','период','месяц']));
    const region = str(value(row, ['region','регион'])); const city = str(value(row, ['city','город'])) || undefined;
    const brand = str(value(row, ['brand','бренд']));
    const weightedVisits = number(value(row, ['weightedVisits','weighted visits','visits','количество визитов (взвешенное)','взвешенное количество визитов','количество визитов','визиты']));
    const errors: string[] = [];
    if (!validPeriod(period)) errors.push('Период должен иметь формат YYYY-MM.');
    if (!region) errors.push('Не заполнен регион.');
    if (!brand) errors.push('Не заполнен бренд.');
    if (!Number.isFinite(weightedVisits) || weightedVisits < 0) errors.push('Количество взвешенных визитов должно быть конечным неотрицательным числом.');
    if (errors.length) { errors.forEach(message => issues.push({ row: rowNo, field: 'visits', message })); return; }
    facts.push({ id: `${projectId}:visit:${rowNo}`, projectId, period, region, city, brand, weightedVisits, datasetVersion });
  });
  const canonical = facts.map(f => [f.period,f.region,f.city ?? '',f.brand,f.weightedVisits].join('\u001f')).sort().join('\n');
  return { facts, issues, skippedRows: rows.length - facts.length, fingerprint: hash(canonical) };
}
