import { describe, expect, it } from 'vitest';
import { normalizeMarketRows } from './marketNormalizer';

describe('normalizeMarketRows', () => {
  it('normalizes Russian columns, month and localized numbers', () => {
    const result = normalizeMarketRows([{ 'Год-месяц': '2026-2', 'Адресный рынок': 'Обезболивающие', 'Бренд': 'Brand A', 'SKU': 'A-1', 'Регион': 'Москва', 'Продажи в штуках': '1 250', 'Продажи в рублях': '12 500,50' }], 'p1');
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]).toMatchObject({ period: '2026-02', addressableMarket: 'Обезболивающие', units: 1250, revenueRub: 12500.5 });
    expect(result.skippedRows).toBe(0);
  });
  it('rejects missing market and invalid metrics', () => {
    const result = normalizeMarketRows([{ period: '2026-13', brand: 'B', sku: 'S', units: -1, revenue: 'bad' }], 'p1');
    expect(result.facts).toHaveLength(0);
    expect(result.issues.length).toBeGreaterThanOrEqual(4);
  });
  it('fingerprint is stable regardless of input row order', () => {
    const rows = [
      { period: '2026-01', market: 'M', brand: 'A', sku: '1', units: 1, revenue: 10 },
      { period: '2026-02', market: 'M', brand: 'B', sku: '2', units: 2, revenue: 20 },
    ];
    expect(normalizeMarketRows(rows, 'p').fingerprint).toBe(normalizeMarketRows([...rows].reverse(), 'p').fingerprint);
  });
});
