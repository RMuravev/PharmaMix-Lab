import type { MarketFact } from '../../domain/shared/facts';

export interface MarketNormalizationIssue { row: number; field: string; message: string }
export interface MarketNormalizationResult { facts: MarketFact[]; issues: MarketNormalizationIssue[]; skippedRows: number; fingerprint: string }
type Row = Record<string, unknown>;
const ALIASES: Record<string, string[]> = {
  period: ['period', 'month', 'year-month', 'yearMonth', 'date', 'период', 'год-месяц', 'год месяц', 'месяц'],
  addressableMarket: ['addressableMarket', 'addressable market', 'market', 'адресный рынок', 'адресный_рынок'],
  brand: ['brand', 'бренд'], sku: ['sku', 'product', 'productCode', 'товар', 'скю', 'артикул'],
  region: ['region', 'регион', 'область'],
  units: ['units', 'unitSales', 'unit_sales', 'salesUnits', 'количество', 'продажи в штуках', 'продажи_в_штуках'],
  revenueRub: ['revenueRub', 'revenue', 'salesRub', 'sales_rub', 'рубли', 'продажи в рублях', 'продажи_в_рублях'],
};
const key = (s: string) => s.trim().toLocaleLowerCase('ru-RU').replace(/[ё]/g, 'е').replace(/[_\s]+/g, ' ');
const aliases = Object.fromEntries(Object.entries(ALIASES).map(([field, names]) => [field, new Set(names.map(key))]));
function read(row: Row, field: string): unknown {
  for (const [name, value] of Object.entries(row)) if (aliases[field]?.has(key(name))) return value;
  return undefined;
}
const str = (value: unknown) => value == null ? '' : String(value).trim();
function num(value: unknown): number {
  if (typeof value === 'number') return value;
  const normalized = str(value).replace(/\s/g, '').replace(',', '.').replace(/[₽руб]/gi, '');
  return normalized === '' ? Number.NaN : Number(normalized);
}
function normalizePeriod(value: unknown): string {
  const raw = str(value);
  const match = raw.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?$/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}`;
  const reverse = raw.match(/^(\d{1,2})[-/.](\d{4})$/);
  return reverse ? `${reverse[2]}-${reverse[1].padStart(2, '0')}` : raw;
}
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
export function normalizeMarketRows(rows: readonly unknown[], projectId: string, datasetVersion = 'pending'): MarketNormalizationResult {
  if (!projectId.trim()) throw new Error('projectId обязателен для нормализации рынка.');
  const facts: MarketFact[] = [], issues: MarketNormalizationIssue[] = [];
  rows.forEach((value, index) => {
    const rowNumber = index + 1;
    if (!value || typeof value !== 'object' || Array.isArray(value)) { issues.push({ row: rowNumber, field: '*', message: 'Строка должна быть объектом.' }); return; }
    const row = value as Row;
    const period = normalizePeriod(read(row, 'period'));
    const addressableMarket = str(read(row, 'addressableMarket'));
    const brand = str(read(row, 'brand')), sku = str(read(row, 'sku'));
    const region = str(read(row, 'region')) || 'Не указан';
    const units = num(read(row, 'units')), revenueRub = num(read(row, 'revenueRub'));
    const rowIssues: string[] = [];
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) rowIssues.push('Период должен иметь формат YYYY-MM.');
    if (!addressableMarket) rowIssues.push('Не заполнен адресный рынок.');
    if (!brand) rowIssues.push('Не заполнен бренд.');
    if (!sku) rowIssues.push('Не заполнен SKU.');
    if (!Number.isFinite(units) || units < 0) rowIssues.push('Продажи в штуках должны быть конечным неотрицательным числом.');
    if (!Number.isFinite(revenueRub) || revenueRub < 0) rowIssues.push('Продажи в рублях должны быть конечным неотрицательным числом.');
    if (rowIssues.length) { rowIssues.forEach(message => issues.push({ row: rowNumber, field: 'market', message })); return; }
    facts.push({ id: `${projectId}:market:${rowNumber}`, projectId, period, addressableMarket, brand, sku, region, units, revenueRub, datasetVersion });
  });
  const canonical = facts.map(({ period, addressableMarket, brand, sku, region, units, revenueRub }) => [period, addressableMarket, brand, sku, region, units, revenueRub].join('\u001f')).sort().join('\n');
  return { facts, issues, skippedRows: rows.length - facts.length, fingerprint: hash(canonical) };
}
