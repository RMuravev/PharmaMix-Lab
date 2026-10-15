import { describe, it, expect } from 'vitest';
import { applyMarketingHill } from './marketingHillCvService';
import type { AlignedPanel } from './panelSourceAlignmentService';
const p: AlignedPanel = {period:'2025-01',brand:'A',region:'R',chain:'C',revenueRub:100,units:1,bonusEstimateRub:10,tvTrp:20,weightedVisits:null,marketRevenueRub:null};
describe('marketing Hill transformation',()=>{
  it('applies separate EC50 and keeps missing drivers missing',()=>{
    const result=applyMarketingHill([p],{tvTrp:{halfSaturation:20,slope:2},weightedVisits:{halfSaturation:1,slope:1},bonusEstimateRub:{halfSaturation:10,slope:1}});
    expect(result[0].tvTrp).toBeCloseTo(0.5);
    expect(result[0].bonusEstimateRub).toBeCloseTo(0.5);
    expect(result[0].weightedVisits).toBeNull();
    expect(p.tvTrp).toBe(20);
  });
  it('rejects invalid exposure rather than hiding it',()=>{
    expect(()=>applyMarketingHill([{...p,bonusEstimateRub:-1}],{tvTrp:{halfSaturation:20,slope:2},weightedVisits:{halfSaturation:1,slope:1},bonusEstimateRub:{halfSaturation:10,slope:1}})).toThrow();
  });
});
