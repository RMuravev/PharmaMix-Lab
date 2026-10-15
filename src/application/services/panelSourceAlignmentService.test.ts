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
    expect(r.panels.find(p => p.region === 'South')?.weightedVisits).toBe(0);
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
  it('uses actually accrued bonus instead of recomputing from the rate', () => {
    const r = alignPanelSources({ sales, promo:[{...promo[0], accruedBonusRub:25}], tv:[], visits:[], market:[] });
    expect(r.totalBonusEstimateRub).toBe(25);
    expect(r.panels.map(p => p.bonusEstimateRub).sort((a,b)=>a-b)).toEqual([6.25,18.75]);
  });
  it('rejects duplicate TV grain instead of double counting TRP', () => {
    const r = alignPanelSources({ sales, promo:[], tv:[tv[0], {...tv[0], id:'tv-2', trp:20}], visits:[], market:[] });
    expect(r.errors.some(e => e.includes('Дублирующий ключ TV'))).toBe(true);
    expect(r.panels.every(p => p.tvTrp === 80)).toBe(true);
  });
  it('rejects positive accrued bonus when matched sales revenue is zero', () => {
    const zeroSales = [{ ...sales[0], revenueRub: 0 }, { ...sales[1], revenueRub: 0 }];
    const r = alignPanelSources({ sales: zeroSales, promo:[{...promo[0], accruedBonusRub:25}], tv:[], visits:[], market:[] });
    expect(r.errors.some(e => e.includes('нулевой matched-выручке'))).toBe(true);
    expect(r.totalBonusEstimateRub).toBe(0);
  });
  it('rejects negative or non-finite accrued bonus', () => {
    for (const accruedBonusRub of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = alignPanelSources({ sales, promo:[{...promo[0], accruedBonusRub}], tv:[], visits:[], market:[] });
      expect(r.errors.some(e => e.includes('некорректный фактически начисленный бонус'))).toBe(true);
    }
  });
});
