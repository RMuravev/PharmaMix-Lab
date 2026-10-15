import { describe, expect, it } from 'vitest';
import { estimateMatchedCausalLift } from './causalLiftPipelineService';
import { diagnoseStaggeredEventStudy } from './staggeredEventStudyDiagnosticsService';
import { summarizeCausalReliability } from './causalReliabilitySummaryService';
describe('causal reliability summary',()=>{it('fails closed on insufficient declared coverage',()=>{const r=summarizeCausalReliability({eligibleUnits:['u'],calendar:['2025-01']});expect(r.status).toBe('insufficient');expect(r.warnings.some(x=>x.includes('coverage'))).toBe(true);});it('reports event pretrend and freshness limitations',()=>{const r=summarizeCausalReliability({eligibleUnits:['a','b'],calendar:['2025-01','2025-02','2025-03'],event:{pretrendStatus:'not-testable',missingEventTimes:[-2],points:[],jointPretrendPValue:null,pretrendMaxAbsolute:null,warnings:[],bootstrapIterations:0},datasetVersion:'v1'});expect(r.status).toBe('insufficient');expect(r.freshness?.datasetVersion).toBe('v1');expect(r.warnings.join(' ')).toContain('Pre-trends');});});
it('keeps event-time sample bounds separate when maxima differ',()=>{const r=summarizeCausalReliability({eligibleUnits:['a','b','c'],calendar:['2025-01','2025-02','2025-03'],event:{pretrendStatus:'not-testable',missingEventTimes:[],points:[{eventMonth:0,att:1,treatedUnits:2,controlUnitsMin:7,cohorts:1,ciLow:null,ciHigh:null,simultaneousCiLow:null,simultaneousCiHigh:null},{eventMonth:1,att:1,treatedUnits:5,controlUnitsMin:3,cohorts:2,ciLow:null,ciHigh:null,simultaneousCiLow:null,simultaneousCiHigh:null}],jointPretrendPValue:null,pretrendMaxAbsolute:null,warnings:[],bootstrapIterations:0}});expect(r.sampleDiagnostics.eventStudyByTime).toEqual([{eventMonth:0,treatedUnits:2,controlUnitsMin:7,cohorts:1},{eventMonth:1,treatedUnits:5,controlUnitsMin:3,cohorts:2}]);expect(JSON.stringify(r.sampleDiagnostics)).not.toContain('effectiveSample');});

it('blocks stale and unverifiable/no-result readiness',()=>{expect(summarizeCausalReliability({eligibleUnits:['a','b'],calendar:['2025-01','2025-02','2025-03'],datasetVersion:'v1',activeDatasetVersion:'v2'}).status).toBe('insufficient');expect(summarizeCausalReliability({eligibleUnits:['a','b'],calendar:['2025-01','2025-02','2025-03']}).status).toBe('insufficient');});
it('never treats a dataset as fresh without a verified active version',()=>{const r=summarizeCausalReliability({eligibleUnits:['a','b'],calendar:['2025-01','2025-02','2025-03'],datasetVersion:'v1'});expect(r.freshness.status).toBe('unverifiable');expect(r.status).toBe('insufficient');});
it('keeps Event Study independent support unknown and warns without matched estimator',()=>{const r=summarizeCausalReliability({eligibleUnits:['a','b'],calendar:['2025-01','2025-02','2025-03'],datasetVersion:'v1',activeDatasetVersion:'v1',event:{pretrendStatus:'not-testable',missingEventTimes:[],points:[{eventMonth:0,att:1,treatedUnits:1,controlUnitsMin:1,cohorts:2,ciLow:null,ciHigh:null,simultaneousCiLow:null,simultaneousCiHigh:null}],jointPretrendPValue:null,pretrendMaxAbsolute:null,warnings:[],bootstrapIterations:10}});expect(r.sampleDiagnostics.eventStudySupport).toBe('unknown');expect(r.warnings.join(' ')).toContain('effective sample');});
it('retains descriptive event-time counts without an independent sample field',()=>{const r=summarizeCausalReliability({eligibleUnits:['a','b','c'],calendar:['2025-01','2025-02','2025-03'],datasetVersion:'v1',activeDatasetVersion:'v1',event:{pretrendStatus:'not-testable',missingEventTimes:[],points:[{eventMonth:-2,att:0,treatedUnits:1,controlUnitsMin:2,cohorts:1,ciLow:null,ciHigh:null,simultaneousCiLow:null,simultaneousCiHigh:null},{eventMonth:0,att:1,treatedUnits:2,controlUnitsMin:1,cohorts:2,ciLow:null,ciHigh:null,simultaneousCiLow:null,simultaneousCiHigh:null}],jointPretrendPValue:null,pretrendMaxAbsolute:0,warnings:[],bootstrapIterations:10}});expect(r.sampleDiagnostics.eventStudyByTime).toHaveLength(2);expect(r.sampleDiagnostics.eventStudySupport).toBe('unknown');expect(r.sampleDiagnostics).not.toHaveProperty('independentSupport');expect(r.limitations.join(' ')).toContain('overlapping cohort controls');});

it('separates support for neither, matched-only, event-only and both estimators',()=>{
 const calendar=Array.from({length:10},(_,i)=>`2026-${String(i+1).padStart(2,'0')}`);
 const eligibleUnits=['A','B','C','D'];
 const rows=calendar.flatMap((period,i)=>eligibleUnits.map(unitId=>({unitId,period,salesRub:100+i,promoActive:unitId==='A'&&i>=4?1:0})));
 const matched=estimateMatchedCausalLift(rows,{eligibleUnits,calendar,treatmentStart:calendar[4],driver:'promoActive'});
 const event=diagnoseStaggeredEventStudy(rows,{eligibleUnits,calendar,driver:'promoActive',preMonths:3,postMonths:2,minControls:1,bootstrapIterations:120});
 for(const m of [undefined,matched])for(const e of [undefined,event]) {
  const r=summarizeCausalReliability({eligibleUnits,calendar,datasetVersion:'v1',activeDatasetVersion:'v1',matched:m,event:e});
  expect(r.sampleDiagnostics.matchedPairs).toBe(m?1:0);
  expect(r.sampleDiagnostics.matchedPairSupport).toBe(m?'available':'unavailable');
  expect(r.sampleDiagnostics.eventStudySupport).toBe(e?'unknown':'not-run');
  expect(r.sampleDiagnostics).not.toHaveProperty('independentSupport');
  expect(r.warnings.some(w=>w.includes('effective sample'))).toBe(!!e);
 }
});
