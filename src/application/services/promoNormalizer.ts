import type { PromoFact } from '../../domain/shared/facts';

export interface PromoNormalizationIssue { row: number; field: string; message: string }
export interface PromoNormalizationResult { facts: PromoFact[]; issues: PromoNormalizationIssue[]; skippedRows: number; fingerprint: string }
type Row = Record<string, unknown>;
const ALIASES: Record<string, string[]> = {
  period: ['period', 'month', 'year-month', 'yearMonth', 'date', 'период', 'год-месяц', 'месяц'],
  chain: ['chain', 'pharmacy chain', 'pharmacyChain', 'сеть', 'аптечная сеть', 'аптечная_сеть'],
  brand: ['brand', 'бренд'], sku: ['sku', 'product', 'productCode', 'товар', 'скю', 'артикул'],
  rate: ['bonusRatePct', 'bonus rate', 'investment percent', 'investmentPct', 'promo percent', 'процент инвестиций', '% инвестиций', 'бонус %', 'процент бонуса'],
  bonus: ['accruedBonusRub', 'accrued bonus', 'bonus rub', 'начисленный бонус', 'фактически начисленный бонус', 'бонус руб'],
  mechanic: ['promoMechanic', 'promo mechanic', 'mechanic', 'механика промо', 'механика'],
};
const key = (s: string) => s.trim().toLocaleLowerCase('ru-RU').replace(/[ё]/g, 'е').replace(/[_\s]+/g, ' ');
const aliasSets = Object.fromEntries(Object.entries(ALIASES).map(([field, names]) => [field, new Set(names.map(key))]));
function read(row: Row, field: string): unknown {
  for (const [name, value] of Object.entries(row)) if (aliasSets[field]?.has(key(name))) return value;
  return undefined;
}
const str = (value: unknown) => value == null ? '' : String(value).trim();
function num(value: unknown): number {
  if (typeof value === 'number') return value;
  const raw = str(value).replace(/\s/g, '').replace(',', '.').replace(/[₽руб%]/gi, '');
  return raw === '' ? Number.NaN : Number(raw);
}
function period(value: unknown): string {
  const raw = str(value); const m = raw.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
  const reverse = raw.match(/^(\d{1,2})[-/.](\d{4})$/);
  return reverse ? `${reverse[2]}-${reverse[1].padStart(2, '0')}` : raw;
}
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
/** Promo investment is an accrued bonus on chain-level SKU sales, never a consumer discount. */
export function normalizePromoRows(rows: readonly unknown[], projectId: string, datasetVersion = 'pending'): PromoNormalizationResult {
  if (!projectId.trim()) throw new Error('projectId обязателен для нормализации промо.');
  const facts: PromoFact[] = [], issues: PromoNormalizationIssue[] = [];
  rows.forEach((value, index) => {
    const rowNumber = index + 1;
    if (!value || typeof value !== 'object' || Array.isArray(value)) { issues.push({ row: rowNumber, field: '*', message: 'Строка должна быть объектом.' }); return; }
    const row = value as Row;
    const p = period(read(row, 'period')), chain = str(read(row, 'chain'));
    const brand = str(read(row, 'brand')), sku = str(read(row, 'sku'));
    const rate = num(read(row, 'rate'));
    const bonusRaw = read(row, 'bonus');
    const accruedBonusRub = bonusRaw == null || str(bonusRaw) === '' ? undefined : num(bonusRaw);
    const promoMechanic = str(read(row, 'mechanic')) || undefined;
    const errors: string[] = [];
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(p)) errors.push('Период должен иметь формат YYYY-MM.');
    if (!chain) errors.push('Не заполнена аптечная сеть.');
    if (!brand) errors.push('Не заполнен бренд.');
    if (!sku) errors.push('Не заполнен SKU.');
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) errors.push('Процент фактически начисляемого бонуса должен быть числом от 0 до 100.');
    if (accruedBonusRub !== undefined && (!Number.isFinite(accruedBonusRub) || accruedBonusRub < 0)) errors.push('Фактически начисленный бонус должен быть неотрицательным числом.');
    if (errors.length) { errors.forEach(message => issues.push({ row: rowNumber, field: 'promo', message })); return; }
    facts.push({ id: `${projectId}:promo:${rowNumber}`, projectId, period: p, chain, brand, sku, bonusRatePct: rate, accruedBonusRub, promoMechanic, datasetVersion });
  });
  const canonical = facts.map(({ period: p, chain, brand, sku, bonusRatePct, accruedBonusRub, promoMechanic }) => [p, chain, brand, sku, bonusRatePct, accruedBonusRub ?? '', promoMechanic ?? ''].join('\u001f')).sort().join('\n');
  return { facts, issues, skippedRows: rows.length - facts.length, fingerprint: hash(canonical) };
}
