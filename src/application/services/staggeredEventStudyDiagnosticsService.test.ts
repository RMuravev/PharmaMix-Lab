import {describe,it,expect} from 'vitest';
import {diagnoseStaggeredEventStudy} from './staggeredEventStudyDiagnosticsService';
const calendar=Array.from({length:10},(_,i)=>`2026-${String(i+1).padStart(2,'0')}`);
const rows=calendar.flatMap((period,i)=>['A','B','C','D','E','F'].map((unitId,j)=>({unitId,period,salesRub:100+j*10+i*3+(unitId==='A'&&i>=5?25:0),promoActive:unitId==='A'&&i>=5?1:0})));
const options={eligibleUnits:['A','B','C','D','E','F'],calendar,driver:'promoActive' as const,preMonths:4,postMonths:3,minControls:3,bootstrapIterations:120,seed:123};
describe('joint staggered event study',()=>{
 it('recovers uplift and pre-period zero, excludes reference month',()=>{const r=diagnoseStaggeredEventStudy(rows,options);expect(r.points.find(p=>p.eventMonth===0)?.att).toBeCloseTo(25);expect(r.points.find(p=>p.eventMonth===-2)?.att).toBeCloseTo(0);expect(r.points.some(p=>p.eventMonth===-1)).toBe(false);expect(r.jointPretrendPValue).not.toBeNull();});
 it('is deterministic with a fixed seed',()=>{expect(diagnoseStaggeredEventStudy(rows,options)).toEqual(diagnoseStaggeredEventStudy(rows,options));});
 it('reports untestable if too few bootstrap repetitions',()=>{const r=diagnoseStaggeredEventStudy(rows,{...options,bootstrapIterations:20});expect(r.pretrendStatus).toBe('not-testable');});
 it('rejects invalid parameters',()=>expect(()=>diagnoseStaggeredEventStudy(rows,{...options,preMonths:1})).toThrow());
 it('excludes the evaluated treated cohort from its own placebo controls',()=>{
   const placeboRows=calendar.flatMap((period,i)=>['A','B','C','D'].map(unitId=>({unitId,period,salesRub:(unitId==='A'&&i===3?20:0),promoActive:unitId==='A'&&i>=5?1:0})));
   const r=diagnoseStaggeredEventStudy(placeboRows,{eligibleUnits:['A','B','C','D'],calendar,driver:'promoActive',preMonths:3,postMonths:1,minControls:2,bootstrapIterations:120,seed:7});
   expect(r.points.find(p=>p.eventMonth===-2)?.att).toBeCloseTo(20);
 });
 it('keeps overlapping staggered cohorts as separate event-time groups',()=>{
   const overlapRows=calendar.flatMap((period,i)=>['A','B','C','D'].map(unitId=>({unitId,period,salesRub:100+i,promoActive:(unitId==='A'&&i>=4)||(unitId==='B'&&i>=6)?1:0})));
   const r=diagnoseStaggeredEventStudy(overlapRows,{eligibleUnits:['A','B','C','D'],calendar,driver:'promoActive',preMonths:3,postMonths:2,minControls:1,bootstrapIterations:120,seed:11});
   expect(r.points.filter(p=>p.eventMonth===0).length).toBe(1);
   expect(r.points.some(p=>p.cohorts>1)).toBe(true);
   expect(r.points.every(p=>p.treatedUnits>0&&p.controlUnitsMin>=1)).toBe(true);
 });
});
