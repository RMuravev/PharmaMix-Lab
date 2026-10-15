import { describe, it, expect } from 'vitest';
import { assessEventStudyForCalibration } from './eventStudyCalibrationGateService';
import type { JointEventStudyReport } from './staggeredEventStudyDiagnosticsService';
const base: JointEventStudyReport = {points:[{eventMonth:0,att:10,treatedUnits:10,controlUnitsMin:10,cohorts:1,ciLow:2,ciHigh:18,simultaneousCiLow:null,simultaneousCiHigh:null}],jointPretrendPValue:.5,pretrendMaxAbsolute:0,pretrendStatus:'not-rejected',missingEventTimes:[],warnings:[],bootstrapIterations:400};
describe('event study calibration gate',()=>{
 it('never treats pretrend non-rejection as automatic causal eligibility',()=>{const r=assessEventStudyForCalibration(base);expect(r.eligibleForAutomaticCalibration).toBe(false);expect(r.statisticalStatus).toBe('detected')});
 it('blocks rejected pretrends',()=>{expect(assessEventStudyForCalibration({...base,pretrendStatus:'rejected'}).methodologicalStatus).toBe('blocked')});
 it('distinguishes statistical non-detection from missing uncertainty',()=>{expect(assessEventStudyForCalibration({...base,points:[{...base.points[0],ciLow:-2,ciHigh:18}]}).statisticalStatus).toBe('not-detected');expect(assessEventStudyForCalibration({...base,points:[]}).statisticalStatus).toBe('unavailable')});
});
it('marks non-finite report arithmetic unavailable, never detected or rejected',()=>{
 for(const bad of [{...base,jointPretrendPValue:NaN},{...base,pretrendMaxAbsolute:Infinity},{...base,points:[{...base.points[0],att:-Infinity}]},{...base,points:[{...base.points[0],ciHigh:NaN}]}]){
  const r=assessEventStudyForCalibration(bad);expect(r.statisticalStatus).toBe('unavailable');expect(r.methodologicalStatus).toBe('blocked');expect(r.reasons.join(' ')).toContain('non-finite');
 }
});
