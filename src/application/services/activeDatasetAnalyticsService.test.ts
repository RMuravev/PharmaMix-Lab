import { describe, expect, it } from 'vitest';
import { ActiveDatasetAnalyticsService } from './activeDatasetAnalyticsService';
import type { ActiveDatasetSnapshot } from '../../infrastructure/indexeddb/activeDatasetSnapshotRepository';

const base: ActiveDatasetSnapshot = {
  projectId: 'p1', datasetVersion: 'v2',
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

  it('reports promo metrics as unavailable when Promo was not provided', () => {
    const result = new ActiveDatasetAnalyticsService().summarize({...base,sourceAvailability:{sales:{source:'sales',status:'LOADED',coverage:null},market:{source:'market',status:'NOT_PROVIDED',coverage:null},promo:{source:'promo',status:'NOT_PROVIDED',coverage:null},tv:{source:'tv',status:'NOT_PROVIDED',coverage:null},visits:{source:'visits',status:'NOT_PROVIDED',coverage:null}}});
    expect(result.accruedBonusEstimateRub).toBeNull();
    expect(result.sourceWarnings).toContain('Источник Promo не предоставлен: промо-воздействие и начисленный бонус недоступны, а не равны нулю.');
  });
  it('keeps unavailable source totals distinct from declared known-empty zero',()=>{const sourceAvailability={sales:{source:'sales' as const,status:'LOADED' as const,coverage:{startPeriod:'2026-01',endPeriod:'2026-02',periods:['2026-01','2026-02']}},market:{source:'market' as const,status:'NOT_PROVIDED' as const,coverage:null},promo:{source:'promo' as const,status:'KNOWN_EMPTY' as const,coverage:{startPeriod:'2026-01',endPeriod:'2026-01',periods:['2026-01']}},tv:{source:'tv' as const,status:'NOT_PROVIDED' as const,coverage:null},visits:{source:'visits' as const,status:'KNOWN_EMPTY' as const,coverage:{startPeriod:'2026-01',endPeriod:'2026-02',periods:['2026-01','2026-02']}}};const result=new ActiveDatasetAnalyticsService().summarize({...base,sourceAvailability});expect(result.marketRevenueRub).toBeNull();expect(result.tvTrp).toBeNull();expect(result.weightedVisits).toBe(0);expect(result.sourceWarnings.some(w=>w.includes('Promo coverage'))).toBe(true);expect(result.metricCoverage.promo).toEqual({status:'partial',coveredPeriods:['2026-01']});expect(result.metricCoverage.market?.status).toBe('unavailable');});
});
