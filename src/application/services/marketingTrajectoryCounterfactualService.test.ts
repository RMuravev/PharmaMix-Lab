import { describe, it, expect } from 'vitest';
import { calculateMarketingTrajectoryCounterfactuals } from './marketingTrajectoryCounterfactualService';
import type { AlignedPanel } from './panelSourceAlignmentService';
const settings={tvTrp:{lag:0,decay:0},weightedVisits:{lag:0,decay:0},bonusEstimateRub:{lag:0,decay:0}};
const hill={tvTrp:{halfSaturation:1,slope:1},weightedVisits:{halfSaturation:1,slope:1},bonusEstimateRub:{halfSaturation:1,slope:1}};
const panels:AlignedPanel[]=[1,2,3].map(m=>({period:`2026-0${m}`,brand:'A',region:'R',chain:'C',revenueRub:100,units:1,bonusEstimateRub:m===2?1:0,tvTrp:0,weightedVisits:0,marketRevenueRub:0}));
const fit={featureNames:['bonusEstimateRub'],coefficients:[Math.log(100),1]};
describe('full trajectory counterfactual',()=>{
 it('recomputes zero-exposure Hill and preserves zero-effect months',()=>{
  const result=calculateMarketingTrajectoryCounterfactuals(panels,fit,settings,hill,{start:'2026-01',end:'2026-03',drivers:['bonusEstimateRub']});
  expect(result.effects).toHaveLength(3);
  expect(result.effects[0].incrementalRub).toBeCloseTo(0);
  expect(result.effects[1].incrementalRub).toBeCloseTo(100*(Math.exp(.5)-1));
 });
 it('preserves pre-intervention exposure and resulting adstock after treatment begins',()=>{
  const history=panels.map((p,i)=>({...p,bonusEstimateRub:i===0?2:0}));
  const settingsWithDecay={...settings,bonusEstimateRub:{lag:0,decay:0.5}};
  const before=calculateMarketingTrajectoryCounterfactuals(history,fit,settingsWithDecay,hill,{start:'2026-02',end:'2026-03',drivers:['bonusEstimateRub'],interventionStart:'2026-02'});
  expect(before.effects.every(e=>Math.abs(e.incrementalRub)<1e-8)).toBe(true);
  const never=calculateMarketingTrajectoryCounterfactuals(history,fit,settingsWithDecay,hill,{start:'2026-02',end:'2026-03',drivers:['bonusEstimateRub']});
  expect(never.effects.some(e=>e.incrementalRub>0)).toBe(true);
 });
 it('rejects intervention after the calculation window',()=>{
  expect(()=>calculateMarketingTrajectoryCounterfactuals(panels,fit,settings,hill,{start:'2026-01',end:'2026-02',interventionStart:'2026-03'})).toThrow();
 });
 it('rejects invalid periods and duplicates',()=>{
  expect(()=>calculateMarketingTrajectoryCounterfactuals(panels,fit,settings,hill,{start:'2026-03',end:'2026-01'})).toThrow();
  expect(()=>calculateMarketingTrajectoryCounterfactuals([...panels,panels[0]],fit,settings,hill,{start:'2026-01',end:'2026-03'})).toThrow();
 });
});
