export interface SalesFactForOverview {
  period: string;
  brand: string;
  units: number;
  revenueRub: number;
}

export interface OverviewMetric {
  revenueRub: number;
  units: number;
  brands: number;
  periods: number;
}

export interface OverviewAggregate {
  byPeriod: Array<{ period: string; revenueRub: number; units: number }>;
  byBrand: Array<{ brand: string; revenueRub: number; units: number }>;
  total: OverviewMetric;
}

function finiteNonNegative(value: unknown, field: string, rowIndex: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`Строка ${rowIndex + 1}: поле ${field} должно быть конечным неотрицательным числом.`);
  }
  return value;
}

/** Pure deterministic aggregation; no browser, storage, or React dependencies. */
export function buildOverviewAggregate(rows: readonly SalesFactForOverview[]): OverviewAggregate {
  const periods = new Map<string, { revenueRub: number; units: number }>();
  const brands = new Map<string, { revenueRub: number; units: number }>();
  let revenueRub = 0;
  let units = 0;
  const brandSet = new Set<string>();
  const periodSet = new Set<string>();

  rows.forEach((row, index) => {
    if (!row || typeof row.period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.period)) {
      throw new Error(`Строка ${index + 1}: период должен быть в формате YYYY-MM.`);
    }
    if (typeof row.brand !== 'string' || !row.brand.trim()) throw new Error(`Строка ${index + 1}: не указан бренд.`);
    const rowRevenue = finiteNonNegative(row.revenueRub, 'revenueRub', index);
    const rowUnits = finiteNonNegative(row.units, 'units', index);
    const p = periods.get(row.period) ?? { revenueRub: 0, units: 0 };
    p.revenueRub += rowRevenue; p.units += rowUnits; periods.set(row.period, p);
    const b = brands.get(row.brand) ?? { revenueRub: 0, units: 0 };
    b.revenueRub += rowRevenue; b.units += rowUnits; brands.set(row.brand, b);
    revenueRub += rowRevenue; units += rowUnits;
    brandSet.add(row.brand); periodSet.add(row.period);
  });

  const byPeriod = [...periods.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([period, metrics]) => ({ period, ...metrics }));
  const byBrand = [...brands.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([brand, metrics]) => ({ brand, ...metrics }));
  return { byPeriod, byBrand, total: { revenueRub, units, brands: brandSet.size, periods: periodSet.size } };
}
