import type { JointEventStudyReport, JointEventPoint } from './staggeredEventStudyDiagnosticsService';
export const EVENT_STUDY_PRETREND_ALPHA = .05;
export const EVENT_STUDY_MIN_LEADS = 2;
export const EVENT_STUDY_MIN_JOINT_BOOTSTRAPS = 100;
const finite = (v:unknown):v is number => typeof v==='number'&&Number.isFinite(v);
const nullable = (v:unknown) => v===null||finite(v);
const count = (v:unknown) => finite(v)&&Number.isSafeInteger(v)&&v>=0;
const interval = (lo:unknown,hi:unknown) => (lo===null&&hi===null)||(finite(lo)&&finite(hi)&&lo<=hi);
/** Runtime boundary shared by estimator, persistence and consumers. Unknown/missing
 * or non-finite arithmetic cannot become substantive statistical evidence.
 */
export function isValidEventStudyReport(value:unknown):value is JointEventStudyReport {
 if(!value||typeof value!=='object')return false;
 const r=value as Record<string,unknown>;
 if(!Array.isArray(r.points)||!Array.isArray(r.missingEventTimes)||!r.missingEventTimes.every(v=>finite(v)&&Number.isSafeInteger(v))||!Array.isArray(r.warnings)||!r.warnings.every(v=>typeof v==='string')||!count(r.bootstrapIterations))return false;
 if(!nullable(r.jointPretrendPValue)||(finite(r.jointPretrendPValue)&&(r.jointPretrendPValue<0||r.jointPretrendPValue>1))||!nullable(r.pretrendMaxAbsolute)||(finite(r.pretrendMaxAbsolute)&&r.pretrendMaxAbsolute<0)||!['not-testable','not-rejected','rejected'].includes(String(r.pretrendStatus)))return false;
 if(!r.points.every(value=>{
  if(!value||typeof value!=='object')return false;
  const p=value as Record<string,unknown>;
  return finite(p.eventMonth)&&Number.isSafeInteger(p.eventMonth)&&finite(p.att)&&count(p.treatedUnits)&&count(p.controlUnitsMin)&&count(p.cohorts)&&interval(p.ciLow,p.ciHigh)&&interval(p.simultaneousCiLow,p.simultaneousCiHigh);
 }))return false;
 const points=r.points as JointEventPoint[];
 if(new Set(points.map(p=>p.eventMonth)).size!==points.length||points.some(p=>p.eventMonth===-1))return false;
 const leads=points.filter(p=>p.eventMonth< -1);
 const expectedMaximum=leads.length?Math.max(...leads.map(p=>Math.abs(p.att))):null;
 // This report carries raw computed values, not independently rounded summaries.
 if(r.pretrendMaxAbsolute!==expectedMaximum)return false;
 const jointAvailable=leads.length>=EVENT_STUDY_MIN_LEADS&&(r.bootstrapIterations as number)>=EVENT_STUDY_MIN_JOINT_BOOTSTRAPS;
 if(!jointAvailable)return r.jointPretrendPValue===null&&r.pretrendStatus==='not-testable';
 if(!finite(r.jointPretrendPValue))return false;
 return r.pretrendStatus===(r.jointPretrendPValue<EVENT_STUDY_PRETREND_ALPHA?'rejected':'not-rejected');
}
