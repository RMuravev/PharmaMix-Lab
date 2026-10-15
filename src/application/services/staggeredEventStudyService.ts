/** Diagnostic event-study for staggered observational exposure.
 * Pre-period placebo contrasts use g-1 as reference and controls untreated through g-1.
 * Bootstrap resamples units (entire time histories), preserving within-unit correlation;
 * control selection and cross-unit spillovers remain sources of uncertainty.
 */
import { buildCompleteExposurePanel, type ExposurePanelInput } from './completeExposurePanelService';
import type { StaggeredDriver } from './staggeredCausalLiftService';
export interface EventStudyOptions {
  eligibleUnits: string[]; calendar: string[]; driver: StaggeredDriver;
  outcome?: 'salesRub'|'salesUnits'; preMonths?: number; postMonths?: number;
  minControls?: number; bootstrapIterations?: number; seed?: number;
}
export interface EventPoint { eventMonth: number; att: number; treatedUnits: number; cohorts: number; ciLow: number|null; ciHigh: number|null }
export interface EventStudyDiagnostics { points: EventPoint[]; warnings: string[]; pretrendMaxAbsolute: number|null; pretrendPassed: boolean|null; bootstrapIterations: number }
const avg = (xs:number[]) => xs.reduce((a,b)=>a+b,0)/xs.length;
const quantile = (xs:number[], p:number) => {const sorted=[...xs].sort((a,b)=>a-b);const pos=(sorted.length-1)*p;const i=Math.floor(pos);return sorted[i]+(sorted[Math.min(i+1,sorted.length-1)]-sorted[i])*(pos-i)};
function rng(seed:number) {let s=seed>>>0;return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296}};
export function estimateStaggeredEventStudy(inputs:ExposurePanelInput[], opts:EventStudyOptions):EventStudyDiagnostics {
  const calendar=[...opts.calendar].sort();
  const pre=opts.preMonths??3,post=opts.postMonths??6, minControls=opts.minControls??1, iterations=opts.bootstrapIterations??200, seed=opts.seed??42;
  if (![pre,post,minControls,iterations].every(Number.isSafeInteger)||pre<1||post<0||minControls<1||iterations<0||iterations>2000||!Number.isSafeInteger(seed)) throw new Error('Некорректные настройки event-study.');
  if (opts.driver!=='promoActive'&&opts.driver!=='weightedVisits') throw new Error('Неизвестный драйвер.');
  const outcome=opts.outcome??'salesRub';
  if(outcome!=='salesRub'&&outcome!=='salesUnits')throw new Error('Неизвестный показатель продаж.');
  const panel=buildCompleteExposurePanel(inputs,{eligibleUnits:opts.eligibleUnits,calendar});
  const lookup=new Map(panel.rows.map(r=>[JSON.stringify([r.unitId,r.period]),r] as const));
  const val=(u:string,t:string)=>lookup.get(JSON.stringify([u,t]))![outcome];
  const first=new Map(opts.eligibleUnits.map(u=>[u,calendar.find(t=>lookup.get(JSON.stringify([u,t]))![opts.driver]>0)??null] as const));
  const cohorts=[...new Set([...first.values()].filter((x):x is string=>x!==null))].sort();
  const warnings=[...panel.warnings,'Placebo-предтренды являются диагностикой, а не доказательством параллельных трендов.','Bootstrap фиксирует определение когорт и не учитывает пространственную корреляцию или подбор контроля.'];
  if (!cohorts.length) warnings.push('Нет treated units в объявленном охвате: Event Study неидентифицируем.');
  const groups=new Map<number,{cohort:string;treated:string[];controls:string[];baseline:string;period:string}[]>();
  for(const g of cohorts){const start=calendar.indexOf(g);if(start<2){warnings.push(`Когорта ${g}: недостаточно истории для предтрендов.`);continue;}
    const treated=opts.eligibleUnits.filter(u=>first.get(u)===g);const baseline=calendar[start-1];
    if (treated.length<2) warnings.push(`Когорта ${g}: менее двух treated units; uncertainty и contamination diagnostics ограничены.`);
    for(let k=-pre;k<=post;k++) {if(k===-1)continue;const index=start+k;if(index<0||index>=calendar.length)continue;
      const period=calendar[index];const cutoff=k<0?baseline:period;
      // The evaluated cohort cannot contribute to its own placebo control mean.
      const controls=opts.eligibleUnits.filter(u=>first.get(u)!==g&&(first.get(u)===null||first.get(u)!>cutoff));
      if(controls.length<minControls){warnings.push(`Когорта ${g}, ${period}: недостаточно eligible controls для event-time ${k}.`);continue;}
      const list=groups.get(k)??[];list.push({cohort:g,treated,controls,baseline,period});groups.set(k,list);
    }
  }
  const estimate=(k:number,rand?:()=>number)=>{const entries=groups.get(k)??[];let total=0,weight=0,used=0;
    for(const entry of entries){const sample=(units:string[])=>rand?Array.from({length:units.length},()=>units[Math.floor(rand()*units.length)]):units;
      const treated=sample(entry.treated),controls=sample(entry.controls);
      const treatedChange=avg(treated.map(u=>val(u,entry.period)-val(u,entry.baseline)));
      const controlChange=avg(controls.map(u=>val(u,entry.period)-val(u,entry.baseline)));
      total+=(treatedChange-controlChange)*treated.length;weight+=treated.length;used++;
    }return weight?{att:total/weight,weight,used}:null;
  };
  const points:EventPoint[]=[];
  for(const k of [...groups.keys()].sort((a,b)=>a-b)){const base=estimate(k);if(!base)continue;
    const draws:number[]=[];const random=rng(seed+10007*(k+pre+1));
    for(let b=0;b<iterations;b++){const result=estimate(k,random);if(result)draws.push(result.att);}
    const ciLow=draws.length>=20?quantile(draws,.025):null,ciHigh=draws.length>=20?quantile(draws,.975):null;
    if (![base.att,base.weight,...draws,ciLow,ciHigh].filter(v=>v!==null).every(Number.isFinite)) { warnings.push(`Невалидный результат для event-time ${k}; оценка отброшена.`); continue; }
    points.push({eventMonth:k,att:base.att,treatedUnits:base.weight,cohorts:base.used,ciLow,ciHigh});
  }
  const leads=points.filter(p=>p.eventMonth< -1);
  if(!leads.length)warnings.push('Не удалось оценить placebo-предтренды: отсутствуют подходящие отрицательные event-time точки.');
  const pretrendMaxAbsolute=leads.length?Math.max(...leads.map(p=>Math.abs(p.att))):null;
  // No arbitrary scale-dependent pass/fail threshold.
  if(!points.length)warnings.push('Нет доступных оценок event-study.');
  return {points,warnings,pretrendMaxAbsolute,pretrendPassed:null,bootstrapIterations:iterations};
}
