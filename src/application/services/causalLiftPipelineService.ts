/** End-to-end observational matched DiD. No randomization or causal identification guarantee. */
import { buildCompleteExposurePanel, type ExposurePanelInput } from './completeExposurePanelService';
import { matchCausalControls, type MatchedControl } from './causalControlMatchingService';

export type ExposureDriver = 'weightedVisits' | 'promoBonusRub' | 'promoActive';
export interface CausalLiftPipelineOptions {
  eligibleUnits: string[]; calendar: string[]; treatmentStart: string;
  driver: ExposureDriver; outcome?: 'salesRub' | 'salesUnits';
  bootstrapIterations?: number; seed?: number;
  maxPreTrendGap?: number; maxDistance?: number;
}
export interface MatchedLiftResult {
  driver: ExposureDriver; outcome: 'salesRub' | 'salesUnits';
  pairs: MatchedControl[]; rejected: string[];
  prePeriods: string[]; postPeriods: string[];
  /** Mean monthly DiD lift per treated unit; in units of the selected outcome. */
  liftPerUnitMonth: number;
  /** Mean lift / mean treated counterfactual post-outcome. */
  relativeLiftPct: number | null;
  ci95: [number, number] | null;
  preTrendMaxAbsGap: number;
  preTrendMonthlyGaps: {period: string; gap: number}[];
  warnings: string[];
}
const average=(xs:number[])=>xs.reduce((a,b)=>a+b,0)/xs.length;
const quantile=(sorted:number[],q:number)=>{const p=(sorted.length-1)*q,lo=Math.floor(p),hi=Math.ceil(p);return sorted[lo]+(sorted[hi]-sorted[lo])*(p-lo);};
export function estimateMatchedCausalLift(inputs:ExposurePanelInput[], opts:CausalLiftPipelineOptions):MatchedLiftResult {
  const {eligibleUnits,calendar,treatmentStart,driver}=opts;
  const outcome=opts.outcome??'salesRub';
  const iterations=opts.bootstrapIterations??499;
  const seed=opts.seed??12345;
  if (!Number.isInteger(iterations)||iterations<0||iterations>5000||!Number.isSafeInteger(seed)) throw new Error('Некорректные настройки bootstrap.');
  if (!['weightedVisits','promoBonusRub','promoActive'].includes(driver)||!['salesRub','salesUnits'].includes(outcome)) throw new Error('Некорректный драйвер или показатель.');
  const complete=buildCompleteExposurePanel(inputs,{eligibleUnits,calendar});
  const prePeriods=[...calendar].filter(p=>p<treatmentStart).sort();
  const postPeriods=[...calendar].filter(p=>p>=treatmentStart).sort();
  const matched=matchCausalControls(complete.rows.map(r=>({unitId:r.unitId,period:r.period,outcome:r[outcome],exposure:r[driver]})),treatmentStart,{eligibleUnits,calendar,maxPreTrendGap:opts.maxPreTrendGap,maxDistance:opts.maxDistance,requireStartMonthExposure:true});
  if (!matched.pairs.length) throw new Error('Не найдено ни одной сопоставимой пары.');
  const lookup=new Map(complete.rows.map(r=>[JSON.stringify([r.unitId,r.period]),r] as const));
  const get=(id:string,p:string)=>lookup.get(JSON.stringify([id,p]))![outcome];
  const pairStats=matched.pairs.map(pair=>{
    const tPre=average(prePeriods.map(p=>get(pair.treatedUnit,p)));
    const cPre=average(prePeriods.map(p=>get(pair.controlUnit,p)));
    const tPost=average(postPeriods.map(p=>get(pair.treatedUnit,p)));
    const cPost=average(postPeriods.map(p=>get(pair.controlUnit,p)));
    return {effect:(tPost-tPre)-(cPost-cPre),baseline:tPre+(cPost-cPre)};
  });
  const lift=average(pairStats.map(s=>s.effect));
  const baseline=average(pairStats.map(s=>s.baseline));
  const firstPre=prePeriods[0];
  const preTrendMonthlyGaps=prePeriods.map(period=>({period,gap:average(matched.pairs.map(pair=>(get(pair.treatedUnit,period)-get(pair.treatedUnit,firstPre))-(get(pair.controlUnit,period)-get(pair.controlUnit,firstPre))))}));
  const preTrendMaxAbsGap=Math.max(...preTrendMonthlyGaps.map(x=>Math.abs(x.gap)));
  let ci95:[number,number]|null=null;
  if (iterations>0&&pairStats.length>=2) {
    let state=seed>>>0;
    const random=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};
    const samples:number[]=[];
    for(let i=0;i<iterations;i++){
      let sum=0;
      for(let j=0;j<pairStats.length;j++)sum+=pairStats[Math.floor(random()*pairStats.length)].effect;
      samples.push(sum/pairStats.length);
    }
    samples.sort((a,b)=>a-b);
    ci95=[quantile(samples,.025),quantile(samples,.975)];
  }
  const warnings=[...complete.warnings,...matched.warnings,
    'Предтренд — описательная диагностика, а не доказательство параллельных трендов.',
    'Bootstrap пересэмплирует подобранные пары, не учитывает пространственную корреляцию и неопределённость самого matching; интервал является приближённым.',
    'При совпадении иных воздействий с запуском оценивается совокупный эффект, а не чистый эффект выбранного драйвера.'];
  if (matched.pairs.length<5) warnings.push('Менее пяти пар: доверительный интервал и оценка эффекта особенно ненадёжны.');
  if (!ci95) warnings.push('Доверительный интервал недоступен: нужно минимум две пары и положительное число итераций bootstrap.');
  if (matched.rejected.length) warnings.push(`Не вошли в оценку: ${matched.rejected.length} единиц.`);
  return {driver,outcome,pairs:matched.pairs,rejected:matched.rejected,prePeriods,postPeriods,liftPerUnitMonth:lift,relativeLiftPct:baseline>0?100*lift/baseline:null,ci95,preTrendMaxAbsGap,preTrendMonthlyGaps,warnings};
}
