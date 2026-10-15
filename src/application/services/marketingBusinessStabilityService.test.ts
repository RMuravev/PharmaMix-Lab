import { describe, expect, it } from 'vitest';
import { assessMarketingBusinessStability } from './marketingBusinessStabilityService';
const sample = [
  {windowId:'w1',trainEnd:'2024-12',drivers:[{driver:'promo',incrementalRevenueRub:150,investmentRub:100},{driver:'tv',incrementalRevenueRub:20}]},
  {windowId:'w2',trainEnd:'2025-03',drivers:[{driver:'promo',incrementalRevenueRub:200,investmentRub:100},{driver:'tv',incrementalRevenueRub:-10}]}
];
describe('business result stability', () => {
  it('reports sign changes and only computes ROI with known positive spend', () => {
    const report=assessMarketingBusinessStability(sample);
    const promo=report.drivers.find(d=>d.driver==='promo')!;
    expect(promo.roiByWindow).toEqual([0.5,1]);
    expect(promo.signConsistent).toBe(true);
    const tv=report.drivers.find(d=>d.driver==='tv')!;
    expect(tv.signConsistent).toBe(false);
    expect(tv.roiByWindow).toEqual([null,null]);
  });
  it('rejects duplicate windows and nonfinite contributions',()=>{
    expect(()=>assessMarketingBusinessStability([sample[0],sample[0]])).toThrow();
    expect(()=>assessMarketingBusinessStability([{...sample[0],drivers:[{driver:'tv',incrementalRevenueRub:NaN}]},sample[1]])).toThrow();
  });
  it('does not silently fill missing driver estimates',()=>{
    const report=assessMarketingBusinessStability([sample[0],{...sample[1],drivers:[]}]);
    expect(report.drivers.find(d=>d.driver==='promo')?.windows).toBe(1);
    expect(report.drivers.find(d=>d.driver==='promo')?.signConsistent).toBe(false);
  });
});
