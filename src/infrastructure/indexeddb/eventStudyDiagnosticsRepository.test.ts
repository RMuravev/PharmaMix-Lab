import { describe, it, expect } from 'vitest';
import { validateEventStudyDiagnostics, type PersistedEventStudyDiagnostics } from './eventStudyDiagnosticsRepository';
const base = {id:'x',projectId:'p',datasetVersion:'v',createdAt:'2026-01-01T00:00:00Z',algorithmVersion:'v1',brand:'B',grain:'visits-region-brand',driver:'weightedVisits',outcome:'salesRub',preMonths:3,postMonths:6,eligibleUnits:['u1'],calendar:['2026-01'],report:{points:[],jointPretrendPValue:null,pretrendMaxAbsolute:null,pretrendStatus:'not-testable',missingEventTimes:[],warnings:[],bootstrapIterations:400},gate:{methodologicalStatus:'blocked',statisticalStatus:'unavailable',eligibleForAutomaticCalibration:false,reasons:[]}} as PersistedEventStudyDiagnostics;
describe('event study diagnostics persistence validation',()=>{
 it('accepts versioned diagnostics',()=>expect(()=>validateEventStudyDiagnostics(base)).not.toThrow());
 it('rejects duplicate units',()=>expect(()=>validateEventStudyDiagnostics({...base,eligibleUnits:['u1','u1']})).toThrow());
 it('rejects unsorted calendar',()=>expect(()=>validateEventStudyDiagnostics({...base,calendar:['2026-02','2026-01']})).toThrow());
 it('rejects empty unit id',()=>expect(()=>validateEventStudyDiagnostics({...base,eligibleUnits:[' ']})).toThrow());
 it('rejects invalid calendar',()=>expect(()=>validateEventStudyDiagnostics({...base,calendar:['2026-13']})).toThrow());
 it('never persists an automatic calibration permission',()=>expect(()=>validateEventStudyDiagnostics({...base,gate:{...base.gate,eligibleForAutomaticCalibration:true} as unknown as typeof base.gate})).toThrow());
});
it('rejects non-finite persisted report metrics, probabilities and intervals',()=>{
 const point={eventMonth:0,att:1,treatedUnits:1,controlUnitsMin:5,cohorts:1,ciLow:0,ciHigh:2,simultaneousCiLow:null,simultaneousCiHigh:null};
 for(const value of [NaN,Infinity,-Infinity]){
  for(const field of ['jointPretrendPValue','pretrendMaxAbsolute'])expect(()=>validateEventStudyDiagnostics({...base,report:{...base.report,[field]:value}})).toThrow();
  for(const field of ['att','ciLow','ciHigh','simultaneousCiLow','simultaneousCiHigh'])expect(()=>validateEventStudyDiagnostics({...base,report:{...base.report,points:[{...point,[field]:value}]}})).toThrow();
 }
});
