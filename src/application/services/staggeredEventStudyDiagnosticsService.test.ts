import {describe,it,expect} from 'vitest';
import {summarizeCausalReliability} from './causalReliabilitySummaryService';
import {estimateMatchedCausalLift} from './causalLiftPipelineService';
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
   // A (May) can use B/C/D at event 0; B (July) uses C/D. C/D are shared.
   expect(r.points.map(p=>({eventMonth:p.eventMonth,att:p.att,treatedUnits:p.treatedUnits,controlUnitsMin:p.controlUnitsMin,cohorts:p.cohorts}))).toEqual([-3,-2,0,1,2].map(eventMonth=>({eventMonth,att:0,treatedUnits:2,controlUnitsMin:2,cohorts:2})));
   expect(r.points.some(p=>p.eventMonth===-1)).toBe(false);
   const matched=estimateMatchedCausalLift(overlapRows,{eligibleUnits:['A','B','C','D'],calendar,driver:'promoActive',treatmentStart:calendar[4]});
   for(const m of [undefined,matched]){
    const summary=summarizeCausalReliability({eligibleUnits:['A','B','C','D'],calendar,matched:m,event:r,datasetVersion:'v1',activeDatasetVersion:'v1'});
    expect(summary.sampleDiagnostics.eventStudyByTime).toEqual([-3,-2,0,1,2].map(eventMonth=>({eventMonth,treatedUnits:2,controlUnitsMin:2,cohorts:2})));
    expect(summary.sampleDiagnostics.eventStudySupport).toBe('unknown');
    expect(summary.sampleDiagnostics.matchedPairs).toBe(m?1:0);
    expect(summary.sampleDiagnostics).not.toHaveProperty('independentSupport');
   }
 });
});
it('fails closed on the six-unit finite-input overflow instead of reporting a pretrend rejection',()=>{
 const extreme=calendar.flatMap((period,i)=>['A','B','C','D','E','F'].map(unitId=>({unitId,period,salesRub:unitId!=='A'&&i===3?1e308:0,promoActive:unitId==='A'&&i>=5?1:0})));
 expect(()=>diagnoseStaggeredEventStudy(extreme,{eligibleUnits:['A','B','C','D','E','F'],calendar,driver:'promoActive',preMonths:3,postMonths:1,minControls:5,bootstrapIterations:120})).toThrow(/numerically unestimable/);
});
it('rejects overflow during bootstrap even if point estimates are finite',()=>{
 // Original control sum is 1e308; resampling the extreme unit can overflow it.
 const extreme=calendar.flatMap((period,i)=>['A','B','C','D','E','F'].map(unitId=>({unitId,period,salesRub:unitId==='B'&&i===3?1e308:0,promoActive:unitId==='A'&&i>=5?1:0})));
 expect(()=>diagnoseStaggeredEventStudy(extreme,{eligibleUnits:['A','B','C','D','E','F'],calendar,driver:'promoActive',preMonths:3,postMonths:1,minControls:5,bootstrapIterations:120,seed:71})).toThrow(/numerically unestimable/);
});
