import { describe, expect, it } from 'vitest';
import { normalizeSalesRows } from './salesNormalizer';

describe('normalizeSalesRows', () => {
  it('normalizes Russian column names, decimal commas and monthly periods', () => {
    const result = normalizeSalesRows([{ 'Год-месяц': '2025-2', 'Регион': 'Москва', 'Аптечная сеть': 'Сеть A', 'Бренд': 'Brand X', 'SKU': 'X-1', 'Продажи в штуках': '12', 'Продажи в рублях': '1 234,50' }], 'p1');
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]).toMatchObject({ period: '2025-02', brand: 'Brand X', units: 12, revenueRub: 1234.5, chain: 'Сеть A' });
    expect(result.issues).toHaveLength(0);
  });
  it('skips invalid rows and reports row-level issues', () => {
    const result = normalizeSalesRows([{ period: '2025-13', brand: '', sku: '', units: -1, revenueRub: 'abc' }], 'p1');
    expect(result.facts).toHaveLength(0);
    expect(result.skippedRows).toBe(1);
    expect(result.issues.length).toBeGreaterThan(0);
  });
  it('produces a stable fingerprint for the same records regardless of row order', () => {
    const rows = [{ period: '2025-01', brand: 'A', sku: '1', units: 1, revenueRub: 10 }, { period: '2025-02', brand: 'B', sku: '2', units: 2, revenueRub: 20 }];
    expect(normalizeSalesRows(rows, 'p1').fingerprint).toBe(normalizeSalesRows([...rows].reverse(), 'p1').fingerprint);
  });
});
