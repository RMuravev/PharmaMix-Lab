import { describe, expect, it } from 'vitest';
import { buildActiveCausalStudy } from './activeSnapshotCausalStudyService';
import type { ActiveDatasetSnapshot } from '../../infrastructure/indexeddb/activeDatasetSnapshotRepository';

const snapshot = (overrides: Partial<ActiveDatasetSnapshot> = {}) => ({
  projectId: 'p1', datasetVersion: 'v1', legacy: false,
  salesFacts: [
    { id: 's1', projectId: 'p1', datasetVersion: 'v1', period: '2026-01', chain: 'Chain A', region: 'North', brand: 'Brand', sku: 'SKU', revenueRub: 100, units: 2 },
    { id: 's2', projectId: 'p1', datasetVersion: 'v1', period: '2026-01', chain: 'Chain B', region: 'South', brand: 'Brand', sku: 'SKU', revenueRub: 80, units: 1 },
  ], marketFacts: [], tvFacts: [],
  promoFacts: [],
  visitFacts: [],
  rowCounts: { salesFacts: 2, marketFacts: 0, promoFacts: 0, tvFacts: 0, visitFacts: 0 },
  ...overrides,
} as ActiveDatasetSnapshot);

describe('active causal study source semantics', () => {
  it('uses zero promo exposure and keeps a no-promo control unit', () => {
    const result = buildActiveCausalStudy(snapshot(), 'promo-chain-brand', 'Brand');
    expect(result.rows).toHaveLength(2);
    expect(result.rows.every(row => row.promoActive === 0 && row.promoBonusRub === 0)).toBe(true);
  });

  it('uses zero visits when no visit row exists for a sales observation', () => {
    const result = buildActiveCausalStudy(snapshot(), 'visits-region-brand', 'Brand');
    expect(result.rows.every(row => row.weightedVisits === 0)).toBe(true);
  });

  it('keeps a zero-rate promo as zero investment but active treatment', () => {
    const result = buildActiveCausalStudy(snapshot({ promoFacts: [{ id: 'p1', projectId: 'p1', datasetVersion: 'v1', period: '2026-01', chain: 'Chain A', brand: 'Brand', sku: 'SKU', bonusRatePct: 0 }] }), 'promo-chain-brand', 'Brand');
    const treated = result.rows.find(row => row.unitId === 'Chain A');
    expect(treated).toMatchObject({ promoActive: 1, promoBonusRub: 0 });
    expect(result.rows.find(row => row.unitId === 'Chain B')).toMatchObject({ promoActive: 0, promoBonusRub: 0 });
  });

  it('represents a source period without sales as a zero-sales observation', () => {
    const result = buildActiveCausalStudy(snapshot({ visitFacts: [{ id: 'v1', projectId: 'p1', datasetVersion: 'v1', period: '2026-02', region: 'North', city: 'City', brand: 'Brand', weightedVisits: 3 }] }), 'visits-region-brand', 'Brand');
    expect(result.calendar).toEqual(['2026-01', '2026-02']);
    expect(result.rows.find(row => row.unitId === 'North' && row.period === '2026-02')).toMatchObject({ salesRub: 0, salesUnits: 0, weightedVisits: 3 });
    expect(result.rows.find(row => row.unitId === 'South' && row.period === '2026-02')).toMatchObject({ salesRub: 0, salesUnits: 0, weightedVisits: 0 });
  });
});
