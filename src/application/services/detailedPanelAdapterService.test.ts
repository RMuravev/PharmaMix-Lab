import { describe, expect, it } from 'vitest';
import { assertLegacyPanelGrain, toDetailedSalesObservations } from './detailedPanelAdapterService';
import type { PanelRecord } from '../../types/pharma';
const row = { month: '2026-01', brand: 'A', region: 'North', chain: 'C', units: 2, salesRub: 10, skuCount: 1 };
describe('detailed panel adapter', () => {
  it('preserves dimensions and stable series identity', () => {
    const rows = toDetailedSalesObservations([row, { ...row, region: 'South' }]);
    expect(rows).toHaveLength(2);
    expect(rows[0].seriesId).not.toBe(rows[1].seriesId);
    expect(rows.every(r => r.salesRub === 10)).toBe(true);
  });
  it('prevents mixing granular panels with brand-month MMM', () => {
    expect(() => assertLegacyPanelGrain([{ brand: 'A', region: 'North' } as PanelRecord])).toThrow(/Гранулярные панели/);
    expect(() => assertLegacyPanelGrain([{ brand: 'A', month: '2026-01' } as PanelRecord])).not.toThrow();
  });
});
