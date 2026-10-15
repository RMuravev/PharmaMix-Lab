import {describe,it,expect} from 'vitest';
import {assessMarketingHillStability} from './marketingHillStabilityService';
describe('Hill stability',()=>{
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
