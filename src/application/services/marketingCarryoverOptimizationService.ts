import type { AlignedPanel } from './panelSourceAlignmentService';
import { buildPanelDesignMatrix, type LaggedFactor } from './panelDesignMatrixService';
import { prepareTemporalModelDataset } from './temporalModelDatasetService';
import { trainTemporalMmm } from './temporalMmmTrainingService';

export type Driver = LaggedFactor;
export interface CarryoverSetting { lag: number; decay: number }
export type CarryoverSettings = Record<Driver, CarryoverSetting>;
export interface CarryoverCandidate { settings: CarryoverSettings; lambda: number; cvWapePct: number; observations: number }
const drivers: Driver[] = ['tvTrp', 'weightedVisits', 'bonusEstimateRub'];
const month = (p: string) => { if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(p)) throw new Error(`Некорректный месяц: ${p}`); const [y,m] = p.split('-').map(Number); return y*12+m-1; };
const key = (...parts: string[]) => JSON.stringify(parts.map(s => s.trim().toLowerCase()));
/** Geometric adstock, reset only at genuine missing history; no cross-panel carryover. */
export function applyMarketingCarryover(panels: AlignedPanel[], settings: CarryoverSettings): AlignedPanel[] {
  const out = panels.map(p => ({...p}));
  const missing = new Set<number>();
  const unique = new Map<string, number>();
  for (const d of drivers) {
    const { lag, decay } = settings[d];
    if (!Number.isInteger(lag) || lag < 0 || lag > 12 || !Number.isFinite(decay) || decay < 0 || decay >= 1) throw new Error(`Некорректные lag/adstock для ${d}.`);
    const series = new Map<string, Map<number, number | null>>();
    for (const p of panels) {
      const group = d === 'tvTrp' ? key(p.brand) : d === 'weightedVisits' ? key(p.brand,p.region) : key(p.brand,p.region,p.chain);
      const t = month(p.period), v = d === 'tvTrp' ? p.tvTrp : d === 'weightedVisits' ? p.weightedVisits : p.bonusEstimateRub;
      const id = key(d,group,String(t));
      if (unique.has(id)) { if (unique.get(id) !== v) throw new Error(`Противоречивый ${d} для ${group} ${p.period}`); }
      else if (v !== null) unique.set(id,v);
      if (!series.has(group)) series.set(group,new Map());
      const history = series.get(group)!;
      if (history.has(t) && history.get(t) !== v) throw new Error(`Противоречивый ${d} для ${group} ${p.period}`);
      history.set(t,v);
    }
    for (const [rowIndex, p] of out.entries()) {
      const group = d === 'tvTrp' ? key(p.brand) : d === 'weightedVisits' ? key(p.brand,p.region) : key(p.brand,p.region,p.chain);
      const history = series.get(group)!, t = month(p.period) - lag;
      // Finite history only: missing months invalidate a nonzero-decay state, never impute zero.
      let value = history.get(t) ?? null;
      if (value !== null && decay > 0) {
        let weight = decay;
        for (let prior = t-1; weight >= 1e-6; prior--, weight *= decay) {
          const previous = history.get(prior);
          if (previous === undefined || previous === null) { value = null; break; }
          value += weight * previous;
        }
      }
      if (d === 'tvTrp') p.tvTrp = value;
      else if (d === 'weightedVisits') p.weightedVisits = value;
      else if (value === null) missing.add(rowIndex);
      else p.bonusEstimateRub = value;
    }
  }
  return out.filter((p,i)=>!missing.has(i) && p.tvTrp !== null && p.weightedVisits !== null);
}

/** Joint driver lag/decay and Ridge lambda search using training months ONLY.
 * A fixed eligible panel/month sample is used across candidates to avoid selection bias.
 */
export function optimizeMarketingCarryover(panels: AlignedPanel[], options: {
  testStart: string; testEnd: string; lags?: number[]; decays?: number[]; lambdas?: number[];
  validationMonths?: number; folds?: number; minTrainMonths?: number; maxCandidates?: number; onProgress?: (completed: number, total: number) => void;
}): { best: CarryoverCandidate; candidates: CarryoverCandidate[]; evaluated: number } {
  const lags = options.lags ?? [0,1], decays = options.decays ?? [0,0.5];
  const lambdas = options.lambdas ?? [0.1,1,10];
  const folds = options.folds ?? 3, validationMonths = options.validationMonths ?? 2, minTrainMonths = options.minTrainMonths ?? 8;
  if (!lags.length || !decays.length || !lambdas.length || [...lags,...decays,...lambdas].some(x=>!Number.isFinite(x)) || lags.some(x=>!Number.isInteger(x)||x<0||x>12) || decays.some(x=>x<0||x>=1) || lambdas.some(x=>x<0)) throw new Error('Некорректная сетка параметров.');
  if (![folds,validationMonths,minTrainMonths].every(x=>Number.isInteger(x)&&x>0)) throw new Error('Некорректные размеры временных окон.');
  const count = (lags.length*decays.length)**3*lambdas.length;
  if (count > (options.maxCandidates ?? 300)) throw new Error(`Слишком большая сетка (${count}). Сократите диапазоны для расчётов в браузере.`);
  const months = [...new Set(panels.map(p=>p.period).filter(p=>p<options.testStart))].sort();
  if (months.length < minTrainMonths + folds*validationMonths) throw new Error('Недостаточно месяцев train для внутренней CV.');
  const configurations: CarryoverSettings[] = [];
  for (const a of lags) for (const b of decays) for (const c of lags) for (const d of decays) for (const e of lags) for (const f of decays) configurations.push({tvTrp:{lag:a,decay:b},weightedVisits:{lag:c,decay:d},bonusEstimateRub:{lag:e,decay:f}});
  const datasets = configurations.map(settings => {
    try {
      const transformed = applyMarketingCarryover(panels,settings);
      const matrix = buildPanelDesignMatrix(transformed);
      if (matrix.errors.length) return null;
      const dataset = prepareTemporalModelDataset(matrix.rows,{testStart:options.testStart,testEnd:options.testEnd,standardize:false});
      return dataset.errors.length ? null : dataset;
    } catch { return null; }
  });
  // Intersection across candidates: no candidate gets easier validation observations.
  const ids = (rows: {period:string;panelKey:string}[]) => new Set(rows.map(r=>JSON.stringify([r.period,r.panelKey])));
  const valid = datasets.filter((d):d is NonNullable<typeof d>=>d!==null);
  if (!valid.length) throw new Error('Ни одна конфигурация не сформировала допустимую выборку.');
  const common = ids(valid[0].train);
  for (const dataset of valid.slice(1)) { const next = ids(dataset.train); for (const id of common) if (!next.has(id)) common.delete(id); }
  const candidates: CarryoverCandidate[] = [];
  let completed = 0;
  configurations.forEach((settings,i)=>{
    const dataset = datasets[i]; if (!dataset) { completed += lambdas.length; options.onProgress?.(completed,count); return; }
    const train = dataset.train.filter(r=>common.has(JSON.stringify([r.period,r.panelKey])));
    const monthsAvailable = [...new Set(train.map(r=>r.period))].sort();
    if (monthsAvailable.length < minTrainMonths + folds*validationMonths) { completed += lambdas.length; options.onProgress?.(completed,count); return; }
    for (const lambda of lambdas) {
      let absError = 0, absActual = 0, observations = 0, failed = false;
      for (let fold=folds-1;fold>=0;fold--) {
        const end = monthsAvailable.length-fold*validationMonths, start=end-validationMonths;
        const fitMonths = new Set(monthsAvailable.slice(0,start)), valMonths = new Set(monthsAvailable.slice(start,end));
        const fit = train.filter(r=>fitMonths.has(r.period)), validation = train.filter(r=>valMonths.has(r.period));
        if (!fit.length || !validation.length) { failed=true; break; }
        const means = dataset.featureNames.map((_,j)=>fit.reduce((s,r)=>s+r.x[j],0)/fit.length);
        const stds = means.map((m,j)=>Math.sqrt(fit.reduce((s,r)=>s+(r.x[j]-m)**2,0)/fit.length)||1);
        const scale = (rows: typeof fit)=>rows.map(r=>({...r,x:r.x.map((v,j)=>(v-means[j])/stds[j])}));
        try {
          const result = trainTemporalMmm({...dataset,train:scale(fit),test:scale(validation),errors:[],warnings:[]},{model:'ridge',lambda});
          for (const p of result.testPredictions) {absError+=Math.abs(p.actualRevenueRub-p.predictedRevenueRub);absActual+=Math.abs(p.actualRevenueRub);observations++;}
        } catch { failed=true; break; }
      }
      if (!failed && absActual>0) candidates.push({settings,lambda,cvWapePct:100*absError/absActual,observations});
      completed++; options.onProgress?.(completed,count);
    }
  });
  candidates.sort((a,b)=>a.cvWapePct-b.cvWapePct || a.lambda-b.lambda);
  if (!candidates.length) throw new Error('Ни один вариант не прошёл временную CV.');
  return {best:candidates[0],candidates,evaluated:count};
}
