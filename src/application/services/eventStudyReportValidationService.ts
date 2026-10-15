import type { JointEventStudyReport } from './staggeredEventStudyDiagnosticsService';
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
 return r.points.every(value=>{
  if(!value||typeof value!=='object')return false;
  const p=value as Record<string,unknown>;
  return finite(p.eventMonth)&&Number.isSafeInteger(p.eventMonth)&&finite(p.att)&&count(p.treatedUnits)&&count(p.controlUnitsMin)&&count(p.cohorts)&&interval(p.ciLow,p.ciHigh)&&interval(p.simultaneousCiLow,p.simultaneousCiHigh);
 });
}
