import { describe, expect, it } from 'vitest';
import { buildOverviewAggregate } from '../../domain/aggregates/overview';

describe('Overview page contract', () => {
  it('returns stable monthly and brand dimensions from normalized facts', () => {
    const result = buildOverviewAggregate([
      { period: '2026-01', brand: 'A', units: 2, revenueRub: 100 },
      { period: '2026-01', brand: 'B', units: 1, revenueRub: 70 },
      { period: '2026-02', brand: 'A', units: 3, revenueRub: 180 },
    ]);
    expect(result.total).toEqual({ revenueRub: 350, units: 6, brands: 2, periods: 2 });
    expect(result.byPeriod.map(row => row.period)).toEqual(['2026-01', '2026-02']);
    expect(result.byBrand.map(row => row.brand)).toEqual(['A', 'B']);
  });

  it('rejects malformed facts instead of persisting misleading KPIs', () => {
    expect(() => buildOverviewAggregate([{ period: 'Jan-26', brand: 'A', units: 1, revenueRub: 1 }])).toThrow(/YYYY-MM/);
    expect(() => buildOverviewAggregate([{ period: '2026-01', brand: 'A', units: -1, revenueRub: 1 }])).toThrow(/units/);
  });
});
