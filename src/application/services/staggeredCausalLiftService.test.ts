import { describe, it, expect } from 'vitest';
import { estimateStaggeredCausalLift } from './staggeredCausalLiftService';
const calendar=['2025-01','2025-02','2025-03','2025-04'];
const scope={eligibleUnits:['early','late','never'],calendar,driver:'promoActive' as const};
const rows = [
  ...[100,120,130,140].map((salesRub,i)=>({unitId:'early',period:calendar[i],salesRub,promoActive:i>=1?1:0})),
  ...[100,100,110,120].map((salesRub,i)=>({unitId:'late',period:calendar[i],salesRub,promoActive:i>=2?1:0})),
  ...[100,100,100,100].map((salesRub,i)=>({unitId:'never',period:calendar[i],salesRub})),
];
describe('staggered causal lift',()=>{
 it('identifies cohorts and excludes already treated controls',()=>{
   const result=estimateStaggeredCausalLift(rows,scope);
   expect(result.firstTreatment).toEqual({early:'2025-02',late:'2025-03',never:null});
   expect(result.effects.find(x=>x.cohort==='2025-02'&&x.period==='2025-02')?.controlUnits).toBe(2);
   expect(result.effects.find(x=>x.cohort==='2025-03'&&x.period==='2025-03')?.controlUnits).toBe(1);
   expect(result.effects.find(x=>x.cohort==='2025-02'&&x.period==='2025-02')?.att).toBe(20);
 });
 it('fills absent sales and exposure as true zero within scope',()=>{
   const result=estimateStaggeredCausalLift([{unitId:'early',period:'2025-02',promoActive:1,salesRub:10}],scope);
   expect(result.effects.find(x=>x.cohort==='2025-02'&&x.period==='2025-02')?.att).toBe(10);
 });
 it('does not use future-treated units as controls after their start',()=>{
   const result=estimateStaggeredCausalLift(rows,scope);
   expect(result.effects.find(x=>x.cohort==='2025-02'&&x.period==='2025-03')?.controlUnits).toBe(1);
 });
 it('rejects invalid options',()=>{
   expect(()=>estimateStaggeredCausalLift(rows,{...scope,minControls:0})).toThrow();
 });
});
