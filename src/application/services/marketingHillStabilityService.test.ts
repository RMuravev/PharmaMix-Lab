import {describe,it,expect,vi,afterEach} from 'vitest';
import {assessMarketingHillStability} from './marketingHillStabilityService';
import * as carryover from './marketingCarryoverOptimizationService';
import * as hill from './marketingHillCvService';
import type { AlignedPanel } from './panelSourceAlignmentService';
describe('Hill stability',()=>{
 afterEach(()=>vi.restoreAllMocks());
 it('expands training windows without including the holdout months',()=>{
  const panels:AlignedPanel[]=[1,2,3,4,5,6].map(m=>({period:`2025-0${m}`,brand:'B',region:'R',chain:'C',revenueRub:100,units:1,bonusEstimateRub:1,tvTrp:1,weightedVisits:1,marketRevenueRub:100}));
  const settings={tvTrp:{lag:0,decay:0},weightedVisits:{lag:0,decay:0},bonusEstimateRub:{lag:0,decay:0}};
  const hillSettings={tvTrp:{halfSaturation:1,slope:1},weightedVisits:{halfSaturation:1,slope:1},bonusEstimateRub:{halfSaturation:1,slope:1}};
  const optimize=vi.spyOn(carryover,'optimizeMarketingCarryover').mockReturnValue({best:{settings,lambda:1,cvWapePct:1,observations:2},candidates:[],evaluated:1});
  vi.spyOn(hill,'optimizeMarketingHill').mockReturnValue({settings:hillSettings,cvWapePct:1,evaluations:1});
  const report=assessMarketingHillStability(panels,{testStart:'2025-05',testEnd:'2025-06',windowCount:2,stepMonths:2});
  expect(report.windows.map(w=>w.trainEnd)).toEqual(['2025-02','2025-04']);
  expect(optimize.mock.calls.map(([rows])=>rows.map(p=>p.period))).toEqual([
   ['2025-01','2025-02'],['2025-01','2025-02','2025-03','2025-04'],
  ]);
  expect(report.drivers.every(d=>d.stable)).toBe(true);
 });
 it('rejects invalid windows',()=>{
  expect(()=>assessMarketingHillStability([],{testStart:'2025-01',testEnd:'2025-02',windowCount:1})).toThrow();
  expect(()=>assessMarketingHillStability([],{testStart:'2025-01',testEnd:'2024-12'})).toThrow();
 });
 it('does not invent stable estimates without history',()=>{
  const report=assessMarketingHillStability([],{testStart:'2025-01',testEnd:'2025-02'});
  expect(report.windows).toHaveLength(0);
  expect(report.drivers.every(d=>!d.stable)).toBe(true);
  expect(report.warnings.some(w=>w.includes('Недостаточно'))).toBe(true);
 });
});
