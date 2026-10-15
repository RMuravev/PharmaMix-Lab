import { describe, expect, it } from 'vitest';
import { ActiveDatasetAnalyticsService } from './activeDatasetAnalyticsService';
import type { ActiveDatasetSnapshot } from '../../infrastructure/indexeddb/activeDatasetSnapshotRepository';

const base: ActiveDatasetSnapshot = {
  projectId: 'p1', datasetVersion: 'v2', legacy: false,
  salesFacts: [], marketFacts: [], promoFacts: [], tvFacts: [], visitFacts: [],
  rowCounts: { salesFacts: 0, marketFacts: 0, promoFacts: 0, tvFacts: 0, visitFacts: 0 },
};

describe('ActiveDatasetAnalyticsService', () => {
  it('calculates headline metrics and accrued bonus estimate from matching sales', () => {
    const snapshot: ActiveDatasetSnapshot = {
      ...base,
      salesFacts: [{ id: 's1', projectId: 'p1', datasetVersion: 'v2', period: '2026-01', region: 'R1', chain: 'Chain A', brand: 'Brand A', sku: 'SKU-1', units: 12, revenueRub: 10000 }],
      marketFacts: [{ id: 'm1', projectId: 'p1', datasetVersion: 'v2', period: '2026-01', addressableMarket: 'M1', brand: 'Brand A', sku: 'SKU-1', region: 'R1', units: 20, revenueRub: 25000 }],
      promoFacts: [{ id: 'p1', projectId: 'p1', datasetVersion: 'v2', period: '2026-01', chain: 'Chain A', brand: 'Brand A', sku: 'SKU-1', bonusRatePct: 5 }],
      tvFacts: [{ id: 't1', projectId: 'p1', datasetVersion: 'v2', period: '2026-01', brand: 'Brand A', trp: 120 }],
      visitFacts: [{ id: 'v1', projectId: 'p1', datasetVersion: 'v2', period: '2026-01', region: 'R1', brand: 'Brand A', weightedVisits: 8 }],
      rowCounts: { salesFacts: 1, marketFacts: 1, promoFacts: 1, tvFacts: 1, visitFacts: 1 },
    };
    const result = new ActiveDatasetAnalyticsService().summarize(snapshot);
    expect(result.salesRevenueRub).toBe(10000);
    expect(result.marketRevenueRub).toBe(25000);
    expect(result.accruedBonusEstimateRub).toBe(500);
    expect(result.tvTrp).toBe(120);
    expect(result.weightedVisits).toBe(8);
    expect(result.sourceWarnings).toHaveLength(0);
  });

  it('does not estimate a bonus when no matching sales row exists', () => {
    const snapshot = { ...base, promoFacts: [{ id: 'p1', projectId: 'p1', datasetVersion: 'v2', period: '2026-01', chain: 'Chain A', brand: 'Brand A', sku: 'SKU-1', bonusRatePct: 5 }], rowCounts: { ...base.rowCounts, promoFacts: 1 } } as ActiveDatasetSnapshot;
    const result = new ActiveDatasetAnalyticsService().summarize(snapshot);
    expect(result.accruedBonusEstimateRub).toBe(0);
    expect(result.promoRowsWithoutMatchingSales).toBe(1);
  });
});
