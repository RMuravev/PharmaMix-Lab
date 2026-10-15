/** Conservative diagnostic gate for observational cohort-time ATT.
 * A passing gate is NOT evidence of causal identification; use as a prerequisite,
 * never as a sufficient condition, for any subsequent MMM calibration.
 */
import { buildCompleteExposurePanel, type ExposurePanelInput } from './completeExposurePanelService';
import type { StaggeredOptions, StaggeredResult, CohortTimeEffect } from './staggeredCausalLiftService';

export interface AttQualityPolicy {
  minTreatedUnits: number;
  minControlUnits: number;
  minPrePeriods: number;
  /** Max absolute placebo change as fraction of baseline treated sales; zero baselines fail. */
  maxPlaceboPct: number;
  /** Two-sided confidence interval via cluster resampling within treated/control groups. */
  bootstrapReplicates: number;
  seed: number;
}
export interface AttQualityRow {
  cohort: string; period: string; att: number;
  treatedUnits: number; controlUnits: number; prePeriods: number;
  placeboChange: number | null; placeboPct: number | null;
  ciLow: number | null; ciHigh: number | null;
  calibrationEligible: boolean; reasons: string[];
}
export interface AttQualityReport { rows: AttQualityRow[]; eligibleCount: number; blockedCount: number; warnings: string[]; policy: AttQualityPolicy }
const DEFAULT: AttQualityPolicy = {minTreatedUnits:5,minControlUnits:5,minPrePeriods:3,maxPlaceboPct:0.05,bootstrapReplicates:400,seed:173};
const avg = (xs:number[]) => xs.reduce((s,x)=>s+x,0)/xs.length;
const key = (u:string,p:string) => JSON.stringify([u,p]);
const percentile=(xs:number[],q:number)=>{const s=[...xs].sort((a,b)=>a-b);const pos=(s.length-1)*q;const lo=Math.floor(pos);return s[lo]+(s[Math.ceil(pos)]-s[lo])*(pos-lo);};
const randomGenerator=(seed:number)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
function interval(treated:number[], controls:number[], reps:number, seed:number):[number,number] {
  const rand=randomGenerator(seed);
  const sample=(xs:number[])=>avg(Array.from({length:xs.length},()=>xs[Math.floor(rand()*xs.length)]));
  const draws=Array.from({length:reps},()=>sample(treated)-sample(controls));
  return [percentile(draws,0.025),percentile(draws,0.975)];
}
export function assessStaggeredAttQuality(inputs:ExposurePanelInput[], opts:StaggeredOptions, result:StaggeredResult, overrides:Partial<AttQualityPolicy>={}):AttQualityReport {
  const policy={...DEFAULT,...overrides};
  if (![policy.minTreatedUnits,policy.minControlUnits,policy.minPrePeriods,policy.bootstrapReplicates,policy.seed].every(Number.isSafeInteger)
    || policy.minTreatedUnits<1 || policy.minControlUnits<1 || policy.minPrePeriods<2 || policy.bootstrapReplicates<100 || policy.bootstrapReplicates>10000
    || !Number.isFinite(policy.maxPlaceboPct) || policy.maxPlaceboPct<0)
    throw new Error('Некорректная политика диагностики ATT.');
  const calendar=[...opts.calendar].sort();
  const panel=buildCompleteExposurePanel(inputs,{eligibleUnits:opts.eligibleUnits,calendar});
  const values=new Map(panel.rows.map(r=>[key(r.unitId,r.period),r]));
  const outcome=opts.outcome??'salesRub';
  const value=(u:string,p:string)=>values.get(key(u,p))![outcome];
  const first=result.firstTreatment;
  if (opts.eligibleUnits.some(u=>!(u in first))) throw new Error('Несогласованный список единиц между ATT и панелью.');
  const rows:AttQualityRow[]=result.effects.map((effect:CohortTimeEffect,index)=>{
    const g=calendar.indexOf(effect.cohort), t=calendar.indexOf(effect.period);
    if(g<1||t<g) throw new Error('ATT содержит период вне допустимого когортного охвата.');
    const treated=opts.eligibleUnits.filter(u=>first[u]===effect.cohort);
    const controls=opts.eligibleUnits.filter(u=>first[u]===null || first[u]!>effect.period);
    if(treated.length!==effect.treatedUnits||controls.length!==effect.controlUnits) throw new Error('Состав когорт и контролей не соответствует оценке ATT.');
    const baseline=calendar[g-1];
    const reasons:string[]=[];
    if(treated.length<policy.minTreatedUnits) reasons.push('Недостаточно участвовавших единиц.');
    if(controls.length<policy.minControlUnits) reasons.push('Недостаточно контрольных единиц.');
    if(g<policy.minPrePeriods) reasons.push('Недостаточно месяцев до воздействия для проверки предтрендов.');
    let placeboChange:number|null=null,placeboPct:number|null=null;
    if(g>=2){
      const earlier=calendar[g-2];
      placeboChange=avg(treated.map(u=>value(u,baseline)-value(u,earlier)))
        -avg(controls.map(u=>value(u,baseline)-value(u,earlier)));
      const base=avg(treated.map(u=>value(u,earlier)));
      placeboPct=base>0?Math.abs(placeboChange)/base:null;
      if(placeboPct===null) reasons.push('Нулевая база: относительный placebo-тест неприменим.');
      else if(placeboPct>policy.maxPlaceboPct) reasons.push('Существенное расхождение предтрендов (placebo).');
    }
    const baselineTreated=treated.map(u=>value(u,baseline));
    const changesT=treated.map((u,i)=>value(u,effect.period)-baselineTreated[i]);
    const changesC=controls.map(u=>value(u,effect.period)-value(u,baseline));
    const [ciLow,ciHigh]=interval(changesT,changesC,policy.bootstrapReplicates,(policy.seed+index)>>>0);
    if(ciLow<=0 && ciHigh>=0) reasons.push('95% bootstrap-интервал ATT включает ноль.');
    if(!Number.isFinite(effect.att)||Math.abs(avg(changesT)-avg(changesC)-effect.att)>1e-6*Math.max(1,Math.abs(effect.att)))
      throw new Error('ATT не совпадает с пересчётом на исходной панели.');
    return {...effect,prePeriods:g,placeboChange,placeboPct,ciLow,ciHigh,calibrationEligible:reasons.length===0,reasons};
  });
  return {rows,eligibleCount:rows.filter(r=>r.calibrationEligible).length,blockedCount:rows.filter(r=>!r.calibrationEligible).length,policy,warnings:[
    'Это диагностические фильтры, а не формальная проверка предположения параллельных трендов.',
    'Bootstrap ресемплирует единицы внутри когорты и контроля; не учитывает пространственную корреляцию, множественные проверки и подбор когорт.',
    'Для калибровки дополнительно необходимы проверки anticipation, интерференции, состава контролей и совпадения определения воздействия MMM/DiD.',
    'Одна placebo-разность не заменяет полный event-study анализ предтрендов.',
  ]};
}
