import type { AlignedPanel } from './panelSourceAlignmentService';

export type LaggedFactor = 'tvTrp' | 'weightedVisits' | 'bonusEstimateRub';
export interface DesignMatrixOptions {
  /** Nonnegative lag: month t uses only signal from t-lag. */
  lags?: Partial<Record<LaggedFactor, number>>;
  /** Omit rows without required lag history instead of imputing zeros. */
  requireCompleteHistory?: boolean;
}
export interface DesignMatrixRow {
  period: string; brand: string; region: string; chain: string;
  actualRevenueRub: number;
  features: Record<LaggedFactor | 'marketRevenueRub', number | null>;
}
export interface DesignMatrixResult { rows: DesignMatrixRow[]; errors: string[]; warnings: string[]; excludedRows: number }
const norm = (s: string) => s.trim().toLocaleLowerCase();
const key = (...s: string[]) => JSON.stringify(s.map(norm));
function monthIndex(period: string): number | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return null;
  const [year, month] = period.split('-').map(Number);
  return year * 12 + month - 1;
}
/**
 * Create a causal panel design matrix. TV is a brand-month signal, visits a
 * brand-region-month signal, promo a brand-region-chain-month signal.
 * Missing history stays null; never borrow another panel's values or look ahead.
 */
export function buildPanelDesignMatrix(panels: AlignedPanel[], options: DesignMatrixOptions = {}): DesignMatrixResult {
  const errors: string[] = [], warnings: string[] = [];
  const lags = { tvTrp: 0, weightedVisits: 0, bonusEstimateRub: 0, ...options.lags };
  for (const [name, lag] of Object.entries(lags)) {
    if (!Number.isInteger(lag) || lag < 0 || lag > 60) errors.push(`Недопустимый лаг ${name}: ${lag}.`);
  }
  if (errors.length) return { rows: [], errors, warnings, excludedRows: 0 };
  const tv = new Map<string, number | null>(), visits = new Map<string, number | null>();
  const byPanel = new Map<string, AlignedPanel>();
  const seen = new Set<string>();
  for (const p of panels) {
    const t = monthIndex(p.period);
    if (t === null) { errors.push(`Некорректный период ${p.period}.`); continue; }
    const pk = key(p.brand, p.region, p.chain, String(t));
    if (seen.has(pk)) { errors.push(`Дублирующая панель ${p.brand}/${p.region}/${p.chain}/${p.period}.`); continue; }
    seen.add(pk);
    if (!Number.isFinite(p.revenueRub) || p.revenueRub < 0 || !Number.isFinite(p.bonusEstimateRub) || p.bonusEstimateRub < 0) {
      errors.push(`Некорректная выручка или промобонус в ${p.period}.`); continue;
    }
    byPanel.set(pk, p);
    for (const [map, k, value, label] of [
      [tv, key(p.brand, String(t)), p.tvTrp, 'TV'],
      [visits, key(p.brand, p.region, String(t)), p.weightedVisits, 'визиты'],
    ] as const) {
      if (value !== null && (!Number.isFinite(value) || value < 0)) { errors.push(`Некорректное значение ${label} в ${p.period}.`); continue; }
      if (map.has(k) && map.get(k) !== value) errors.push(`Противоречивый сигнал ${label} в ${p.period}: значения различаются между панелями.`);
      else map.set(k, value);
    }
  }
  if (errors.length) return { rows: [], errors, warnings, excludedRows: 0 };
  let excludedRows = 0;
  const rows: DesignMatrixRow[] = [];
  for (const p of panels) {
    const t = monthIndex(p.period)!;
    const promoPast = byPanel.get(key(p.brand, p.region, p.chain, String(t - lags.bonusEstimateRub)));
    const features = {
      tvTrp: tv.get(key(p.brand, String(t - lags.tvTrp))) ?? null,
      weightedVisits: visits.get(key(p.brand, p.region, String(t - lags.weightedVisits))) ?? null,
      bonusEstimateRub: promoPast?.bonusEstimateRub ?? null,
      marketRevenueRub: p.marketRevenueRub,
    };
    if (options.requireCompleteHistory && Object.values(features).some(v => v === null)) { excludedRows++; continue; }
    rows.push({ period: p.period, brand: p.brand, region: p.region, chain: p.chain, actualRevenueRub: p.revenueRub, features });
  }
  if (excludedRows) warnings.push(`${excludedRows} наблюдений исключено из-за отсутствия истории факторов.`);
  if (panels.some(p => p.marketRevenueRub !== null)) warnings.push('Рынок не лагируется и повторяется по сетям; нельзя суммировать его по панелям. Для доли рынка нужен фильтр адресного рынка.');
  return { rows, errors, warnings, excludedRows };
}
