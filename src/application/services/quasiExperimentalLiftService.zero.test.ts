import {describe,it,expect} from 'vitest';
import {estimateDifferenceInDifferences} from './quasiExperimentalLiftService';
describe('closed-world DiD',()=>{
 it('imputes missing sales as zero within an explicit calendar',()=>{
  const rows=[
   {unitId:'t',period:'2026-01',treated:true,outcome:10},
   {unitId:'t',period:'2026-02',treated:true,outcome:20},
   {unitId:'c',period:'2026-01',treated:false,outcome:10},
   // Missing control post-period means zero sales.
  ];
  const r=estimateDifferenceInDifferences(rows,'2026-02',{calendar:['2026-01','2026-02']});
  expect(r.absoluteLift).toBe(20);
  expect(r.warnings.some(x=>x.includes('нулями'))).toBe(true);
 });
 it('rejects unknown all-missing group assignment',()=>{
  expect(()=>estimateDifferenceInDifferences([{unitId:'t',period:'2026-01',treated:true,outcome:1}], '2026-02',{eligibleUnits:['t','c'],calendar:['2026-01','2026-02']})).toThrow('группу воздействия');
 });
});
