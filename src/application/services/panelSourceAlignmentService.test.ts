import { describe, expect, it } from 'vitest';
import { alignPanelSources } from './panelSourceAlignmentService';
import type { SalesFact, PromoFact, TvFact, VisitFact, MarketFact } from '../../domain/shared/facts';
const base = { id: '1', projectId: 'p', datasetVersion: 'v', period: '2026-01', brand: 'A' };
const sales: SalesFact[] = [
  { ...base, id:'s1', region:'North', chain:'X', sku:'S', revenueRub:100, units:10 },
  { ...base, id:'s2', region:'South', chain:'X', sku:'S', revenueRub:300, units:30 },
];
const promo: PromoFact[] = [{ ...base, chain:'X', sku:'S', bonusRatePct:10 }];
const tv: TvFact[] = [{ ...base, trp:80 }];
const visits: VisitFact[] = [{ ...base, region:'North', weightedVisits:4 }];
const market: MarketFact[] = [{ ...base, addressableMarket:'M', sku:'S', region:'North', revenueRub:1000, units:100 }];
describe('panel source alignment', () => {
  it('allocates bonus without duplicating it across regions and marks broadcast signals', () => {
    const r = alignPanelSources({ sales, promo, tv, visits, market });
    expect(r.errors).toEqual([]);
    expect(r.totalBonusEstimateRub).toBe(40);
    expect(r.panels.map(p => p.bonusEstimateRub).sort((a,b)=>a-b)).toEqual([10,30]);
    expect(r.panels.every(p => p.tvTrp === 80)).toBe(true);
    expect(r.panels.find(p => p.region === 'North')?.weightedVisits).toBe(4);
    expect(r.panels.find(p => p.region === 'South')?.weightedVisits).toBeNull();
  });
  it('rejects duplicate promo keys instead of double counting', () => {
    const r = alignPanelSources({ sales, promo:[...promo,...promo], tv:[], visits:[], market:[] });
    expect(r.errors.some(e => e.includes('дублирующий'))).toBe(true);
    expect(r.totalBonusEstimateRub).toBe(40);
  });
  it('reports unmatched promo without inventing bonus', () => {
    const r = alignPanelSources({ sales, promo:[{...promo[0],sku:'missing'}], tv:[], visits:[], market:[] });
    expect(r.unmatchedPromo).toBe(1);
    expect(r.totalBonusEstimateRub).toBe(0);
  });
});
