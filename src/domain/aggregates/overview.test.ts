import { describe, expect, it } from 'vitest';
import { buildOverviewAggregate } from './overview';

describe('buildOverviewAggregate', () => {
  it('aggregates sales deterministically by period and brand', () => {
    const result = buildOverviewAggregate([
      { period: '2026-02', brand: 'B', units: 2, revenueRub: 30 },
      { period: '2026-01', brand: 'A', units: 3, revenueRub: 45 },
      { period: '2026-01', brand: 'B', units: 1, revenueRub: 10 },
    ]);
    expect(result.total).toEqual({ revenueRub: 85, units: 6, brands: 2, periods: 2 });
    expect(result.byPeriod).toEqual([
      { period: '2026-01', revenueRub: 55, units: 4 },
      { period: '2026-02', revenueRub: 30, units: 2 },
    ]);
    expect(result.byBrand.map(row => row.brand)).toEqual(['A', 'B']);
  });

  it('rejects malformed periods and negative metrics', () => {
    expect(() => buildOverviewAggregate([{ period: '2026/01', brand: 'A', units: 1, revenueRub: 10 }])).toThrow('период');
    expect(() => buildOverviewAggregate([{ period: '2026-01', brand: 'A', units: -1, revenueRub: 10 }])).toThrow('неотрицательным');
  });

  it('handles empty input', () => {
    expect(buildOverviewAggregate([]).total).toEqual({ revenueRub: 0, units: 0, brands: 0, periods: 0 });
  });
});
