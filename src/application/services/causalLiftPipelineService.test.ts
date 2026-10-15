import { describe,it,expect } from 'vitest';
import { estimateMatchedCausalLift } from './causalLiftPipelineService';
const calendar=['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06'];
const units=['a','b','c','d'];
const data=units.flatMap(unitId=>calendar.map((period,i)=>({unitId,period,salesRub:100+2*i+(unitId==='a'||unitId==='b'?i>=4?20:0:0),weightedVisits:unitId==='a'||unitId==='b'?i>=4?2:0:0})));
const opts={eligibleUnits:units,calendar,treatmentStart:'2026-05',driver:'weightedVisits' as const,bootstrapIterations:100};
describe('matched causal lift pipeline',()=>{
 it('recovers additive DiD and deterministic CI',()=>{const a=estimateMatchedCausalLift(data,opts);const b=estimateMatchedCausalLift(data,opts);expect(a.liftPerUnitMonth).toBe(20);expect(a.pairs).toHaveLength(2);expect(a.ci95).toEqual([20,20]);expect(a.ci95).toEqual(b.ci95);expect(a.preTrendMaxAbsGap).toBe(0);});
 it('treats absent sales as true zero within scope',()=>{const sparse=data.filter(r=>!(r.unitId==='c'&&r.period==='2026-02'));const r=estimateMatchedCausalLift(sparse,{...opts,maxPreTrendGap:10,maxDistance:10});expect(Number.isFinite(r.liftPerUnitMonth)).toBe(true);});
 it('rejects invalid bootstrap and missing controls',()=>{expect(()=>estimateMatchedCausalLift(data,{...opts,bootstrapIterations:-1})).toThrow();expect(()=>estimateMatchedCausalLift(data,{...opts,eligibleUnits:['a','b']})).toThrow();});
 it('does not claim CI from a single matched pair',()=>{const rows=data.filter(r=>['a','c'].includes(r.unitId));const r=estimateMatchedCausalLift(rows,{...opts,eligibleUnits:['a','c']});expect(r.ci95).toBeNull();});
});
