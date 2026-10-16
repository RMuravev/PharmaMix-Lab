import { isValidEventStudyReport, EVENT_STUDY_PRETREND_ALPHA, EVENT_STUDY_MIN_LEADS, EVENT_STUDY_MIN_JOINT_BOOTSTRAPS } from './eventStudyReportValidationService';
/** Joint pretrend diagnostic for a staggered event study.
 * Uses a shared cluster resample across event times to preserve dependence of leads.
 * Descriptive only: a non-rejection does not establish parallel trends.
 */
import { buildCompleteExposurePanel, type ExposurePanelInput } from './completeExposurePanelService';
import type { StaggeredDriver } from './staggeredCausalLiftService';

export interface JointEventStudyOptions {
  eligibleUnits: string[]; calendar: string[]; driver: StaggeredDriver;
  outcome?: 'salesRub'|'salesUnits'; preMonths?: number; postMonths?: number;
  minControls?: number; bootstrapIterations?: number; seed?: number;
}
export interface JointEventPoint {
  eventMonth: number; att: number; treatedUnits: number; controlUnitsMin: number;
  cohorts: number; ciLow: number|null; ciHigh: number|null;
  simultaneousCiLow: number|null; simultaneousCiHigh: number|null;
}
export interface JointEventStudyReport {
  points: JointEventPoint[]; jointPretrendPValue: number|null;
  pretrendMaxAbsolute: number|null; pretrendStatus: 'not-testable'|'not-rejected'|'rejected';
  missingEventTimes: number[]; warnings: string[]; bootstrapIterations: number;
}
const key=(u:string,p:string)=>JSON.stringify([u,p]);
const finiteResult=(value:number)=>{if(!Number.isFinite(value))throw new Error('Event Study numerically unestimable: non-finite arithmetic; no inference returned.');return value;};
const mean=(v:number[])=>finiteResult(v.reduce((a,b)=>a+b,0)/v.length);
const percentile=(v:number[],q:number)=>{const s=[...v].sort((a,b)=>a-b);const x=(s.length-1)*q;const i=Math.floor(x);return s[i]+(s[Math.min(i+1,s.length-1)]-s[i])*(x-i)};
const rng=(seed:number)=>{let s=seed>>>0;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296}};
interface Group {treated:string[];controls:string[];base:string;period:string}
export function diagnoseStaggeredEventStudy(inputs:ExposurePanelInput[],opts:JointEventStudyOptions):JointEventStudyReport {
  const pre=opts.preMonths??3,post=opts.postMonths??6,minControls=opts.minControls??5,reps=opts.bootstrapIterations??400,seed=opts.seed??71;
  if(![pre,post,minControls,reps,seed].every(Number.isSafeInteger)||pre<2||post<0||minControls<1||reps<0||reps>5000)throw new Error('Некорректные параметры диагностики Event Study.');
  if(opts.driver!=='promoActive'&&opts.driver!=='weightedVisits')throw new Error('Неизвестный драйвер.');
  const outcome=opts.outcome??'salesRub';if(outcome!=='salesRub'&&outcome!=='salesUnits')throw new Error('Неизвестный показатель.');
  const calendar=[...opts.calendar].sort();
  if(new Set(calendar).size!==calendar.length)throw new Error('Дубли календарных периодов.');
  const panel=buildCompleteExposurePanel(inputs,{eligibleUnits:opts.eligibleUnits,calendar});
  const rows=new Map(panel.rows.map(r=>[key(r.unitId,r.period),r] as const));
  const val=(u:string,p:string)=>rows.get(key(u,p))![outcome];
  const first=new Map(opts.eligibleUnits.map(u=>[u,calendar.find(p=>rows.get(key(u,p))![opts.driver]>0)??null] as const));
  const groups=new Map<number,Group[]>();
  const warnings=[...panel.warnings,'Нулевые и незначимые placebo-оценки не доказывают параллельность трендов.', 'Bootstrap фиксирует когорты и состав допустимых контролей; пространственная корреляция и интерференция не моделируются.'];
  for(const cohort of [...new Set([...first.values()].filter((x):x is string=>x!==null))]){
    const g=calendar.indexOf(cohort);if(g<2){warnings.push(`Когорта ${cohort}: меньше двух месяцев предыстории.`);continue;}
    const treated=opts.eligibleUnits.filter(u=>first.get(u)===cohort);
    for(let k=-pre;k<=post;k++){
      if(k===-1)continue;
      const t=g+k;if(t<0||t>=calendar.length)continue;
      const period=calendar[t],base=calendar[g-1];
      const cutoff=k<0?base:period;
      // A cohort must never serve as its own placebo/control group. For post periods
      // this also retains the not-yet-treated rule; never-treated units remain eligible.
      const controls=opts.eligibleUnits.filter(u=>u!==undefined && first.get(u)!==cohort && (first.get(u)===null || first.get(u)!>cutoff));
      if(controls.length<minControls)continue;
      groups.set(k,[...(groups.get(k)??[]),{treated,controls,base,period}]);
    }
  }
  const times=Array.from({length:pre+post+1},(_,i)=>i-pre).filter(k=>k!==-1);
  const available=times.filter(k=>groups.has(k));
  const missingEventTimes=times.filter(k=>!groups.has(k));
  if(missingEventTimes.length)warnings.push(`Неоценённые event-time периоды: ${missingEventTimes.join(', ')}.`);
  const estimate=(k:number,samples?:Map<string,string[]>)=>{
    let total=0,weight=0;
    for(const g of groups.get(k)??[]){
      const t=samples?.get(JSON.stringify(g.treated))??g.treated;
      const c=samples?.get(JSON.stringify(g.controls))??g.controls;
      const d=mean(t.map(u=>val(u,g.period)-val(u,g.base)))-mean(c.map(u=>val(u,g.period)-val(u,g.base)));
      finiteResult(d);total=finiteResult(total+finiteResult(d*g.treated.length));weight+=g.treated.length;
    }
    return finiteResult(total/weight);
  };
  const pointEstimate=new Map(available.map(k=>[k,estimate(k)]));
  // Resample each distinct unit group once per iteration, shared across event times.
  const uniqueGroups=new Map<string,string[]>();
  for(const gs of groups.values())for(const g of gs)for(const us of [g.treated,g.controls])uniqueGroups.set(JSON.stringify(us),us);
  const random=rng(seed),draws=new Map(available.map(k=>[k,[] as number[]]));
  for(let i=0;i<reps;i++){
    const samples=new Map<string,string[]>();
    for(const [id,us] of uniqueGroups)samples.set(id,Array.from({length:us.length},()=>us[Math.floor(random()*us.length)]));
    for(const k of available)draws.get(k)!.push(estimate(k,samples));
  }
  const leads=available.filter(k=>k< -1);
  const sufficient=reps>=EVENT_STUDY_MIN_JOINT_BOOTSTRAPS;
  const maxDeviation:number[]=[];
  if(sufficient&&leads.length>=EVENT_STUDY_MIN_LEADS){for(let i=0;i<reps;i++)maxDeviation.push(Math.max(...leads.map(k=>finiteResult(Math.abs(draws.get(k)![i]-pointEstimate.get(k)!)))));}
  const critical=maxDeviation.length?percentile(maxDeviation,.95):null;
  const maxObserved=leads.length?Math.max(...leads.map(k=>Math.abs(pointEstimate.get(k)!))):null;
  const p=maxDeviation.length&&maxObserved!==null?(1+maxDeviation.filter(v=>v>=maxObserved).length)/(reps+1):null;
  if(p===null)warnings.push('Совместная проверка предтрендов требует минимум двух доступных lead-периодов и 100 bootstrap-повторений.');
  const points=available.map(k=>{
    const gs=groups.get(k)!;const x=pointEstimate.get(k)!;const d=draws.get(k)!;
    return {eventMonth:k,att:x,treatedUnits:gs.reduce((n,g)=>n+g.treated.length,0),controlUnitsMin:Math.min(...gs.map(g=>g.controls.length)),cohorts:gs.length,
      ciLow:sufficient?percentile(d,.025):null,ciHigh:sufficient?percentile(d,.975):null,
      simultaneousCiLow:critical!==null&&k< -1?x-critical:null,
      simultaneousCiHigh:critical!==null&&k< -1?x+critical:null};
  });
  const report:JointEventStudyReport={points,jointPretrendPValue:p,pretrendMaxAbsolute:maxObserved,pretrendStatus:p===null?'not-testable':p<EVENT_STUDY_PRETREND_ALPHA?'rejected':'not-rejected',missingEventTimes,warnings,bootstrapIterations:reps};
  if(!isValidEventStudyReport(report))throw new Error('Event Study numerically unestimable: invalid computed report; no inference returned.');
  return report;
}
