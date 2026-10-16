import { describe, expect, it } from 'vitest';
import { isValidEventStudyReport } from './eventStudyReportValidationService';
import { diagnoseStaggeredEventStudy, type JointEventStudyReport } from './staggeredEventStudyDiagnosticsService';
import { assessEventStudyForCalibration } from './eventStudyCalibrationGateService';
import { summarizeCausalReliability } from './causalReliabilitySummaryService';
const calendar=Array.from({length:10},(_,i)=>`2026-${String(i+1).padStart(2,'0')}`),eligibleUnits=['A','B','C','D','E','F'];
const rows=calendar.flatMap((period,i)=>eligibleUnits.map(unitId=>({unitId,period,salesRub:unitId==='A'&&i===3?20:0,promoActive:unitId==='A'&&i>=5?1:0})));
const base=diagnoseStaggeredEventStudy(rows,{calendar,eligibleUnits,driver:'promoActive',preMonths:3,postMonths:1,minControls:5,bootstrapIterations:120});
describe('statistical report consistency',()=>{
 it('accepts the current estimator report and its exact lead maximum',()=>{expect(base.pretrendMaxAbsolute).toBe(20);expect(isValidEventStudyReport(base)).toBe(true);});
 it.each([
  {points:[],jointPretrendPValue:null,pretrendMaxAbsolute:null,pretrendStatus:'rejected'},
  {points:[],jointPretrendPValue:.01,pretrendMaxAbsolute:null,pretrendStatus:'not-rejected'},
  {points:[],jointPretrendPValue:null,pretrendMaxAbsolute:10,pretrendStatus:'not-testable'},
 ] as Partial<JointEventStudyReport>[])('rejects the exact contradictory reviewer report %j at consumers too',changes=>{
  const bad={...base,...changes};expect(isValidEventStudyReport(bad)).toBe(false);
  expect(assessEventStudyForCalibration(bad).statisticalStatus).toBe('unavailable');
  const summary=summarizeCausalReliability({eligibleUnits,calendar,event:bad,datasetVersion:'v1',activeDatasetVersion:'v1'});
  expect(summary.status).toBe('insufficient');expect(summary.sampleDiagnostics.eventStudyByTime).toEqual([]);
 });
 it.each([[.049999,'rejected'],[.05,'not-rejected'],[.050001,'not-rejected']] as const)('requires status consistent with p=%s at alpha .05',(p,status)=>{
  expect(isValidEventStudyReport({...base,jointPretrendPValue:p,pretrendStatus:status})).toBe(true);
  expect(isValidEventStudyReport({...base,jointPretrendPValue:p,pretrendStatus:status==='rejected'?'not-rejected':'rejected'})).toBe(false);
 });
 it('requires sufficient distinct leads and bootstrap support for any joint p-value',()=>{
  expect(isValidEventStudyReport({...base,jointPretrendPValue:null})).toBe(false);
  expect(isValidEventStudyReport({...base,bootstrapIterations:99})).toBe(false);
  expect(isValidEventStudyReport({...base,bootstrapIterations:99,jointPretrendPValue:null,pretrendStatus:'not-testable'})).toBe(true);
  const oneLead=base.points.filter(p=>p.eventMonth>=-2);
  expect(isValidEventStudyReport({...base,points:oneLead})).toBe(false);
  expect(isValidEventStudyReport({...base,points:oneLead,jointPretrendPValue:null,pretrendStatus:'not-testable'})).toBe(true);
  expect(isValidEventStudyReport({...base,points:[base.points[0],base.points[0]],pretrendMaxAbsolute:Math.abs(base.points[0].att)})).toBe(false);
 });
 it('requires the maximum to match available leads exactly, or null for no leads',()=>{
  for(const maximum of [null,0,19.9,20.1])expect(isValidEventStudyReport({...base,pretrendMaxAbsolute:maximum})).toBe(false);
  const noLeads={...base,points:base.points.filter(p=>p.eventMonth>=0),jointPretrendPValue:null,pretrendStatus:'not-testable' as const,pretrendMaxAbsolute:null};
  expect(isValidEventStudyReport(noLeads)).toBe(true);expect(isValidEventStudyReport({...noLeads,pretrendMaxAbsolute:0})).toBe(false);
 });
});
